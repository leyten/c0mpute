# Join from Windows (WSL2) — one command

Your Windows PC with an NVIDIA GPU can be a c0mpute shard node. It runs inside **WSL2**
(Windows Subsystem for Linux) — the GPU is shared in automatically from your Windows driver.
Proven on a home box behind double-NAT: it joins via a public relay, hole-punches to a direct
link, torrents its weight slice from a peer, and serves. Total setup: three steps.

## 1. Install WSL2 + Ubuntu (once)

Open **PowerShell as Administrator** and run:

```powershell
wsl --install -d Ubuntu-24.04
```

Reboot if it asks. (Use **Ubuntu-24.04** — it ships the right Python. Older Ubuntu works too,
the setup script handles it, but 24.04 is the smooth path.) When it finishes, open **Ubuntu**
from the Start menu and set a username/password.

## 2. Install the NVIDIA driver on Windows (once)

Install the latest **NVIDIA Game Ready or Studio driver** on Windows (nvidia.com/drivers or
GeForce Experience). **Do not install a driver inside WSL** — WSL sees your GPU through the
Windows driver automatically. Verify inside the Ubuntu terminal:

```bash
nvidia-smi        # should list your GPU
```

If it doesn't, update the Windows driver and reopen the Ubuntu terminal.

## 3. One command to join

Get a worker token at **c0mpute.ai** (Earn → Worker), then in the Ubuntu terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/leyten/c0mpute/master/scripts/wsl-setup.sh | bash -s -- --token cwt_YOURTOKEN
```

That installs the toolchain (git, Node, Python) and launches the node. The **first run pulls
several GB** (engine dependencies + your assigned weight slice) and takes a few minutes — after
that it's cached and re-joins fast. Your dot lights up on the live map at **shard.c0mpute.ai**.

Leave the terminal open to keep serving. `Ctrl-C` stops; re-run the same command to rejoin
(your weight slice is cached, so the rejoin is warm).

---

## Better networking (optional, recommended)

By default WSL2 uses NAT, so your node reaches the network through a **relay** (it works, just
one extra hop). For a **direct** connection, enable mirrored networking (Windows 11 22H2+):
create `C:\Users\<you>\.wslconfig` with:

```ini
[wsl2]
networkingMode=mirrored
```

Then in PowerShell: `wsl --shutdown`, and reopen Ubuntu. Your node will hole-punch to a direct
link over QUIC. (If you skip this, relayed still serves fine — it's a quality upgrade, not a
requirement. Relays are discovered automatically; you never set a relay address by hand.)

## Troubleshooting

- **`nvidia-smi` not found / no GPU** → the Windows NVIDIA driver isn't installed or is old.
  Fix it on the Windows side and reopen Ubuntu. Nothing GPU-related installs inside WSL.
- **`python3 is < 3.11`** → you're on an older Ubuntu; the script attempts to install 3.11, but
  the clean fix is `wsl --install -d Ubuntu-24.04` and run step 3 there.
- **Stuck on "pulling"** → the first weight pull is large; give it time. The 2nd+ node pulls from
  peers, so later joins are faster.
- **Firewall prompt** → allow it; the node needs outbound + (in mirrored mode) inbound on its port.
