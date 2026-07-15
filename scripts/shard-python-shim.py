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

    time.sleep(0.5)
    print("SHARD_STAGE_READY " + json.dumps({
        "stage": stage, "nstages": int(arg("--nstages", 1)),
        "lo": int(arg("--lo", 0)), "hi": int(arg("--hi", 62)),
        "port": port, "pid": os.getpid(), "tail": nxt is None}), flush=True)
    while True:                                      # park like a warm stage; SIGTERM ends us
        time.sleep(60)

if argv and argv[0].endswith("m25_pull_range.py"):
    print("RANGE_PULL_DONE (sim shim — no bytes moved)", flush=True)
    sys.exit(0)

if argv[:2] == ["-m", "shard.fetch"]:
    print("SHARD_FETCH_DONE " + json.dumps({"files": 0, "bytes": 0, "dir": "sim"}), flush=True)
    sys.exit(0)

if argv[:2] == ["-m", "shard.probe"] or (argv and argv[0].endswith("publish_manifest.py")):
    sys.exit(0)                                     # heavy real calls the GPU-less demo skips

os.execvp("python3", ["python3"] + argv)
