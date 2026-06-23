// Node identity binding (shard <-> c0mpute, step 2.3).
//
// A swarm node proves it controls its libp2p PeerId by signing a challenge with its node
// key (shard side: `sidecar -prove <nonce>`). c0mpute verifies that proof here, and —
// gated by the node's cwt_ worker token (which resolves to the account) — records the
// PeerId <-> account binding. So the network knows who to pay / whose reputation to track,
// and nobody can claim a PeerId they don't hold (no key -> no valid signature).
//
// Zero new deps: ed25519 PeerIds embed the public key, so we decode it inline (base58 +
// the identity-multihash/protobuf framing) and verify with Node's native crypto.
import { createPublicKey, verify as edVerify } from 'node:crypto';

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58decode(s: string): Buffer {
  const bytes: number[] = [];
  for (const ch of s) {
    let carry = B58.indexOf(ch);
    if (carry < 0) throw new Error('invalid base58');
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  for (let k = 0; k < s.length && s[k] === '1'; k++) bytes.push(0); // leading '1' -> 0x00
  return Buffer.from(bytes.reverse());
}

// Extract the raw 32-byte ed25519 public key from a libp2p PeerId string.
// Framing: [0x00 identity-mh][0x24 len=36][0x08 0x01 (Ed25519)][0x12 0x20 (32 bytes)][key].
function ed25519PubFromPeerId(peerId: string): Buffer {
  const raw = base58decode(peerId);
  if (raw.length !== 38 || raw[0] !== 0x00 || raw[2] !== 0x08 || raw[3] !== 0x01) {
    throw new Error('not an ed25519 PeerId');
  }
  return raw.subarray(6, 38);
}

// True iff `sigB64` is a valid signature of `nonce` by the key behind `peerId`.
export function verifyBindingProof(peerId: string, nonce: string, sigB64: string): boolean {
  try {
    const rawPub = ed25519PubFromPeerId(peerId);
    const der = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), rawPub]); // SPKI ed25519
    const pub = createPublicKey({ key: der, format: 'der', type: 'spki' });
    return edVerify(null, Buffer.from(nonce), pub, Buffer.from(sigB64, 'base64'));
  } catch {
    return false;
  }
}
