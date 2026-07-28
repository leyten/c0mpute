#!/usr/bin/env python3
"""Engine shim for shard-daemon-sim on boxes WITHOUT a GPU/weights: set
C0MPUTE_SHARD_PYTHON to this file and it fakes ONLY the GPU-heavy calls the daemon
makes — a serving `python -m shard.stage` and the weight pull. Every other invocation
(receipt-key mint, shard.probe, `--check`) execs the REAL python3.

The fake stage is protocol-honest where it matters for the RING test: it BINDS the
engine port (so a predecessor's forward tunnel has something to land on), and a
non-tail stage DIALS --next through the local sidecar and pushes a probe line before
printing READY — a two-daemon sim run therefore proves bytes crossing BOTH sidecars,
not just two processes printing READY."""
import json
import os
import socket
import struct
import sys
import threading
import time

argv = sys.argv[1:]


# The sidecar tunnel enforces an 8-byte-BE length-prefixed frame format (copyFramed, matching
# shard/transport.py send_msg + the H4 per-frame deadline, default 60s) — a mismatched prefix
# is read as a garbage length and the tunnel dies at the deadline, so the shim speaks the SAME
# 8-byte framing the real engine wire does.
def send_frame(sock, payload):
    sock.sendall(struct.pack(">Q", len(payload)) + payload)


def recv_frame(sock):
    def exact(n):
        buf = b""
        while len(buf) < n:
            chunk = sock.recv(n - len(buf))
            if not chunk:
                raise OSError("peer closed mid-frame")
            buf += chunk
        return buf
    return exact(struct.unpack(">Q", exact(8))[0])

if argv[:2] == ["-m", "shard.stage"] and "--check" not in argv:
    def arg(name, default):
        return argv[argv.index(name) + 1] if name in argv else default
    stage = int(arg("--stage", 0))
    port = int(arg("--port", 29610))
    nxt = arg("--next", None)

    # SHIM_STAGE_READY_DELAY_S models a stage still PULLING its 25-30 GB range: no engine listener
    # and no SHARD_STAGE_READY for that long, while the rest of the ring is already up. Applied
    # before the bind, because a listening port would let the coordinator's return probe succeed
    # against a stage that is not actually serving yet (slow-tail-test.sh).
    _delay = float(os.environ.get("SHIM_STAGE_READY_DELAY_S") or 0)
    if _delay > 0:
        print(f"SHIM_STAGE_PULLING stage={stage} for {_delay:.0f}s", flush=True)
        time.sleep(_delay)

    srv = socket.socket()
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("127.0.0.1", port))
    srv.listen(4)

    def accept_loop():
        while True:
            c, _ = srv.accept()
            try:
                data = recv_frame(c)
                # the ring-leg receipt: a predecessor's probe rode sidecar->sidecar->here.
                # Echo it back — the sender treats the roundtrip as tunnel-proven.
                print(f"SHIM_INBOUND stage={stage} {data!r}", flush=True)
                send_frame(c, data)
            except OSError:
                pass
    threading.Thread(target=accept_loop, daemon=True).start()

    # READY before the forward ROUNDTRIP. The real engine does dial forward first
    # (m25_pipe.py:2139, strict) — but it dials the LOCAL SIDECAR's forward port, which is up
    # regardless of whether the downstream STAGE is, so a real stage reports READY while the rest
    # of the ring is still pulling. The shim's roundtrip needs the peer's echo, so leaving READY
    # behind it made every stage look like it became ready at the same instant and no harness could
    # ever see a head running ahead of a still-pulling tail (bug S2). The roundtrip stays below as
    # the ring-leg receipt; only the READY line moves.
    time.sleep(0.5)
    print("SHARD_STAGE_READY " + json.dumps({
        "stage": stage, "nstages": int(arg("--nstages", 1)),
        "lo": int(arg("--lo", 0)), "hi": int(arg("--hi", 62)),
        "port": port, "pid": os.getpid(), "tail": nxt is None}), flush=True)

    if nxt:                                          # forward leg: dial the successor THROUGH
        host, p = nxt.rsplit(":", 1)                 # the local sidecar's -forward tunnel
        probe = f"SHIM_RING_PROBE from stage {stage}".encode()
        for attempt in range(30):
            try:
                s = socket.create_connection((host, int(p)), timeout=5)
                s.settimeout(5)
                send_frame(s, probe)
                # a local connect alone proves NOTHING (the sidecar's remote dial can fail
                # after accepting us) — only the successor's echo is a tunnel receipt
                if recv_frame(s) == probe:
                    print(f"SHIM_FORWARD_ROUNDTRIP stage={stage} -> {nxt} OK", flush=True)
                    break
                s.close()
            except OSError:
                pass
            time.sleep(2)
        else:
            print("SHARD_STAGE_FATAL " + json.dumps(
                {"error": f"shim: forward roundtrip via {nxt} never completed"}), flush=True)
            sys.exit(1)

    while True:                                      # park like a warm stage; SIGTERM ends us
        time.sleep(60)

if argv and argv[0].endswith("m25_pull_range.py"):
    print("RANGE_PULL_DONE (sim shim — no bytes moved)", flush=True)
    sys.exit(0)

if argv[:2] == ["-m", "shard.fetch"]:
    # echo the argv so the harness can ASSERT the daemon threads the trust args through
    # (--manifest-cid from the assignment ref, --pubkey = the pin, the --expect-* cross-checks)
    print("SHIM_FETCH_ARGS " + json.dumps(argv), flush=True)
    print("SHARD_FETCH_DONE " + json.dumps({"files": 0, "bytes": 0, "dir": "sim"}), flush=True)
    sys.exit(0)

if argv[:2] == ["-m", "shard.coordinate"]:
    def arg(name, default):
        return argv[argv.index(name) + 1] if name in argv else default
    if "--check" in argv:
        print("SHARD_COORD_OK " + json.dumps({"dir": arg("--dir", "sim"), "transport": "shim"}), flush=True)
        sys.exit(0)
    tail = arg("--tail", "127.0.0.1:29612")
    host, p = tail.rsplit(":", 1)
    # the RETURN-TUNNEL receipt (leg 8): dial the head sidecar's return -forward; the probe rides
    # sidecar -> libp2p -> the TAIL's sidecar -> the tail shim stage, which echoes it. Only the
    # echo proves the tunnel (a local connect alone proves nothing — same rule as the forward leg).
    probe = b"SHIM_RETURN_PROBE from coordinator"
    # SHIM_COORD_DIAL_ATTEMPTS shortens the ~120s dial window so a harness can watch a head's
    # coordinator give up against a tail that is not there YET, without paying two minutes per
    # attempt (slow-tail-test.sh). Default = the real CLI's patience.
    for attempt in range(int(os.environ.get("SHIM_COORD_DIAL_ATTEMPTS") or 60)):
        try:
            s = socket.create_connection((host, int(p)), timeout=5)
            s.settimeout(5)
            send_frame(s, probe)
            if recv_frame(s) == probe:
                print(f"SHIM_RETURN_ROUNDTRIP -> {tail} OK", flush=True)
                break
            s.close()
        except OSError:
            pass
        time.sleep(2)
    else:
        print("SHARD_JOB_FATAL " + json.dumps(
            {"error": f"shim: return roundtrip via {tail} never completed"}), flush=True)
        sys.exit(1)
    # echo the coordinator's EAGLE arm so a harness can prove the P11 restart-degraded path:
    # after a stall-kill the daemon relaunches us with M25_EAGLE=0 (the proven plain ring).
    eagle = os.environ.get("M25_EAGLE", "1") != "0"
    print("SHIM_COORD_EAGLE " + json.dumps({"eagle": eagle}), flush=True)
    print("SHARD_COORD_READY " + json.dumps({"head": arg("--head", ""), "tail": tail,
                                             "shim": True, "eagle": eagle}), flush=True)
    for line in sys.stdin:                           # NDJSON jobs, exactly the real CLI's loop
        line = line.strip()
        if not line:
            continue
        try:
            job = json.loads(line)
            jid = job["jobId"]
        except (ValueError, KeyError) as e:
            print("SHARD_JOB_FATAL " + json.dumps({"error": f"shim: bad job line: {e}"}), flush=True)
            continue
        # P11 harness hook: a job carrying the __P11_STALL__ sentinel (in messages, the field that
        # threads unchanged through the real dispatch path) makes the coordinator emit the L3
        # stall-watchdog FATAL and hard-exit — the wedge signature the daemon relaunches EAGLE-off.
        msgs = job.get("messages") or []
        stall = job.get("stall") or any("__P11_STALL__" in str(m.get("content", "")) for m in msgs)
        if stall:
            print("SHARD_JOB_FATAL " + json.dumps({"jobId": jid,
                  "error": "stall-watchdog: no progress in 240s (ring or drafter wedged) — exiting so the daemon restarts us"}), flush=True)
            sys.exit(1)
        words = ["a ", "scattered ", "ring ", "served ", "this."]
        for w in words:
            print("SHARD_JOB_TOKEN " + json.dumps({"jobId": jid, "delta": w}), flush=True)
            time.sleep(0.05)
        print("SHARD_JOB_DONE " + json.dumps({
            "jobId": jid, "ok": True, "response": "".join(words),
            "tokensGenerated": len(words), "receipts": [], "receiptsOk": None,
            "nonce": job.get("nonce")}), flush=True)
    sys.exit(0)

if argv[:2] == ["-m", "shard.probe"] or (argv and argv[0].endswith("publish_manifest.py")):
    sys.exit(0)                                     # heavy real calls the GPU-less demo skips

os.execvp("python3", ["python3"] + argv)
