#!/usr/bin/env python3
"""Engine shim for shard-daemon-sim on boxes WITHOUT a GPU/weights: set
C0MPUTE_SHARD_PYTHON to this file and it fakes ONLY the GPU-heavy calls the daemon
makes — a serving `python -m shard.stage` (prints the READY contract, parks) and the
weight pull (instant success). Every other invocation (receipt-key mint, shard.probe,
`--check`) execs the REAL python3, so identity/probe stay honest."""
import json
import os
import sys
import time

argv = sys.argv[1:]

if argv[:2] == ["-m", "shard.stage"] and "--check" not in argv:
    def arg(name, default):
        return argv[argv.index(name) + 1] if name in argv else default
    time.sleep(1)                                   # a beat of load-time realism
    print("SHARD_STAGE_READY " + json.dumps({
        "stage": int(arg("--stage", 0)), "nstages": int(arg("--nstages", 1)),
        "lo": int(arg("--lo", 0)), "hi": int(arg("--hi", 62)),
        "port": int(arg("--port", 29610)), "pid": os.getpid(),
        "tail": "--next" not in argv}), flush=True)
    while True:                                     # park like a warm stage; SIGTERM ends us
        time.sleep(60)

if argv and argv[0].endswith("m25_pull_range.py"):
    print("RANGE_PULL_DONE (sim shim — no bytes moved)", flush=True)
    sys.exit(0)

os.execvp("python3", ["python3"] + argv)
