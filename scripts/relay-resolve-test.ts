/**
 * Relay auto-discovery (P0-#3) — the daemon-side merge/validate logic.
 *
 * Validation is LOAD-BEARING: the sidecar log.Fatalf's on a malformed -relays entry, so one bad
 * /relays.json push would kill every daemon's sidecar at boot network-wide. mergeRelayLists must
 * drop garbage loudly, keep well-formed multiaddrs, put operator-env entries first, and dedupe.
 *
 * Run:  npx tsx scripts/relay-resolve-test.ts
 */
import { mergeRelayLists } from '../c0mpute-worker/src/shard-setup.js';

let failed = false;
function check(cond: boolean, msg: string) { console.log(`${cond ? 'ok  ' : 'FAIL'}  ${msg}`); if (!cond) failed = true; }

const FSN = '/ip4/198.51.100.7/tcp/29600/p2p/12D3KooWHv7iSkM33QMFKkZwNbGnEm7xSANPuNDfYuWADxH1N7vb';
const FSNQ = '/ip4/198.51.100.7/udp/29600/quic-v1/p2p/12D3KooWHv7iSkM33QMFKkZwNbGnEm7xSANPuNDfYuWADxH1N7vb';
const AMS = '/ip4/198.51.100.9/tcp/29600/p2p/12D3KooWCfyZuJRUPB4mYJoQ8NmDbjqASEXW7jZ2xjrt9jY38Nog';

check(JSON.stringify(mergeRelayLists({ relays: [FSN, FSNQ] }, undefined)) === JSON.stringify([FSN, FSNQ]),
  'well-formed tcp + quic-v1 multiaddrs pass');
check(JSON.stringify(mergeRelayLists({ relays: [AMS] }, FSN)) === JSON.stringify([FSN, AMS]),
  'operator env entries lead the merged list');
check(JSON.stringify(mergeRelayLists({ relays: [FSN, FSN] }, FSN)) === JSON.stringify([FSN]),
  'duplicates collapse');
for (const bad of [
  'not-a-multiaddr',
  '/ip4/1.2.3.4/tcp/29600',                              // no /p2p suffix -> sidecar fatal
  '/ip4/1.2.3.4/tcp/29600/p2p/short',                    // junk peer id
  '/ip4/1.2.3.4/tcp/notaport/p2p/12D3KooWHv7iSkM33QMFKkZwNbGnEm7xSANPuNDfYuWADxH1N7vb',
  '/unix/tmp/x/p2p/12D3KooWHv7iSkM33QMFKkZwNbGnEm7xSANPuNDfYuWADxH1N7vb',
  ' /ip4/1.2.3.4/tcp/1/p2p/12D3KooWHv7iSkM33QMFKkZwNbGnEm7xSANPuNDfYuWADxH1N7vb',
]) {
  check(mergeRelayLists({ relays: [bad, FSN] }, undefined).length === 1,
    `malformed entry dropped, good one kept: ${JSON.stringify(bad.slice(0, 40))}`);
}
check(mergeRelayLists(null, undefined).length === 0, 'no doc + no env -> empty (direct-only node)');
check(mergeRelayLists({ relays: 'nope' }, undefined).length === 0, 'non-array relays field -> empty');
check(mergeRelayLists({ relays: [42, null, FSN] }, undefined).length === 1, 'non-string entries dropped');

console.log(failed ? '\nRESULT: FAIL' : '\nRESULT: PASS');
process.exit(failed ? 1 : 0);
