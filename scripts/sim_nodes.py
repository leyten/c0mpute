"""Simulated volunteer nodes for the permissionless-loop demo (swarm-loop-demo.ts).

Real nodes hold ed25519 identity keys and sign per-stage receipts with them (shard.receipt). To
demonstrate the loop end-to-end against the REAL shard seams — without a GPU ring — this stands in
for the node side: it mints node identities + plausible hardware, and later signs a real, chained
receipt set for whatever ring the planner formed. The control-plane logic under test (announce →
admit → place → assign → settle → pay) is the actual SwarmManager; only the GPUs are simulated.

  python3 sim_nodes.py gen --n 6 --keystore /tmp/ks.json      # -> {nodes:[...], rtt:[[...]]}
  python3 sim_nodes.py receipts --keystore /tmp/ks.json \      # -> [signed receipt, ...]
      --stages '<json [{pubkey,lo,hi}...]>' --nonce <n> [--tamper-nonce|--drop-middle]

Needs `shard` importable: set SHARD_REPO (default ../shard next to the c0mpute repo).
"""
import argparse
import base64
import json
import os
import sys

SHARD_REPO = os.environ.get("SHARD_REPO",
                            os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
                                os.path.abspath(__file__)))), "shard"))
sys.path.insert(0, SHARD_REPO)
from cryptography.hazmat.primitives.asymmetric import ed25519  # noqa: E402
from shard.receipt import ReceiptSigner  # noqa: E402


def _pub(priv):
    return base64.b64encode(priv.public_key().public_bytes_raw()).decode()


def _seed(priv):
    return base64.b64encode(priv.private_bytes_raw()).decode()


# a small, deterministic EU-ish pool: node2 is most central; node5 is a slow, low-uplink box the
# planner should relegate. node6 is a FAT card (RTX PRO 6000 WS, 96 GB) announcing its probe-MEASURED
# capability vector — the hetero case: the planner places it at ITS density (35 layers), and the ring
# shrinks to fewer, fatter hops. The plain nodes announce honest 32 GB numbers against the MEASURED
# profile (2330 MB/layer -> 12-layer cap; the old 30 GB rows predate the 2026-07-09 revision and made
# the sim pool infeasible). Extra nodes past this table are cloned from node1 with a fresh subnet.
_HW = [
    {"gpu": "RTX 5090", "freeVramMb": 32768, "subnet": "5.9.0.0/24",   "cpuFactor": 1.0, "upMbps": 120, "geo": "DE"},
    {"gpu": "RTX 5090", "freeVramMb": 32768, "subnet": "185.8.0.0/24", "cpuFactor": 1.1, "upMbps": 90,  "geo": "CZ"},
    {"gpu": "RTX 5090", "freeVramMb": 32768, "subnet": "51.15.0.0/24", "cpuFactor": 1.0, "upMbps": 200, "geo": "NL"},
    {"gpu": "RTX 5090", "freeVramMb": 32768, "subnet": "77.2.0.0/24",  "cpuFactor": 1.2, "upMbps": 60,  "geo": "NO"},
    {"gpu": "RTX 5090", "freeVramMb": 32768, "subnet": "93.4.0.0/24",  "cpuFactor": 1.1, "upMbps": 150, "geo": "DK"},
    {"gpu": "RTX 4090", "freeVramMb": 22 * 1024, "subnet": "88.1.0.0/24",  "cpuFactor": 3.0, "upMbps": 15,  "geo": "HU"},
    {"gpu": "RTX PRO 6000 WS", "freeVramMb": 97887, "subnet": "185.99.0.0/24", "cpuFactor": 1.0,
     "upMbps": 400, "geo": "CZ",
     "layerVramMb": 2330.0, "totalVramMb": 97887.0, "loadPeakExtraMb": 72.0},
]
# one-way ms, aligned to _HW order; node2 (index 2, NL) is central. Symmetric-ish EU internet.
_RTT = [
    [0, 18, 22, 30, 25, 20, 19],
    [18, 0, 20, 32, 24, 12, 8],
    [22, 20, 0, 28, 15, 26, 21],
    [30, 32, 28, 0, 35, 33, 31],
    [25, 24, 15, 35, 0, 28, 26],
    [20, 12, 26, 33, 28, 0, 13],
    [19, 8, 21, 31, 26, 13, 0],
]


def gen(n, keystore):
    ks = {}
    nodes = []
    for i in range(n):
        priv = ed25519.Ed25519PrivateKey.generate()
        pub = _pub(priv)
        ks[pub] = _seed(priv)
        hw = dict(_HW[i]) if i < len(_HW) else {**_HW[0], "subnet": f"10.{i}.0.0/24", "geo": f"X{i}"}
        nodes.append({"nodeId": f"node{i}", "pubkey": pub, **hw})
    json.dump(ks, open(keystore, "w"))
    if n <= len(_RTT):
        rtt = [row[:n] for row in _RTT[:n]]
    else:  # extend with a flat 30ms mesh for the cloned nodes
        rtt = [[0 if i == j else (_RTT[i][j] if i < len(_RTT) and j < len(_RTT) else 30)
                for j in range(n)] for i in range(n)]
    return {"nodes": nodes, "rtt": rtt}


def receipts(keystore, stages, nonce, tamper_nonce=False, drop_middle=False):
    """Sign a real chained receipt set for the formed ring: stage i's out activation per chunk equals
    stage i+1's in, so out_root[i] == in_root[i+1] (the lossless chain holds). --tamper-nonce signs a
    stale nonce (replay); --drop-middle omits a stage (coverage gap) — both must be REJECTED by settle."""
    ks = json.load(open(keystore))
    stages = sorted(stages, key=lambda s: s["lo"])
    used_nonce = "STALE-nonce-from-an-earlier-job" if tamper_nonce else nonce
    signers = []
    for s in stages:
        priv = ed25519.Ed25519PrivateKey.from_private_bytes(base64.b64decode(ks[s["pubkey"]]))
        signers.append(ReceiptSigner(priv, "swarm-sim", "job-sim", s["lo"], s["hi"], nonce=used_nonce))
    for c in range(2):  # 2 chunks
        prev = f"prompt-{c}".encode()
        for sg in signers:
            out = f"act-{sg.meta['layer_start']}-{c}".encode()
            sg.observe(prev, out)
            prev = out
    out = [sg.finalize() for sg in signers]
    if drop_middle and len(out) >= 3:
        out.pop(len(out) // 2)
    return out


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    g = sub.add_parser("gen"); g.add_argument("--n", type=int, default=6); g.add_argument("--keystore", required=True)
    r = sub.add_parser("receipts")
    r.add_argument("--keystore", required=True); r.add_argument("--stages", required=True)
    r.add_argument("--nonce", required=True)
    r.add_argument("--tamper-nonce", action="store_true"); r.add_argument("--drop-middle", action="store_true")
    a = ap.parse_args()
    if a.cmd == "gen":
        json.dump(gen(a.n, a.keystore), sys.stdout)
    else:
        json.dump(receipts(a.keystore, json.loads(a.stages), a.nonce,
                           tamper_nonce=a.tamper_nonce, drop_middle=a.drop_middle), sys.stdout)


if __name__ == "__main__":
    main()
