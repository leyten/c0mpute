/**
 * registryDump — load the signed model registry (c0mpute side) and print resolved specs as
 * JSON to stdout. Used by the cross-repo CI test (shard/tests/registry_cross_repo_test.py)
 * to prove BOTH repos resolve the SAME registry to the SAME per-model specs.
 *
 *   SHARD_MODELS_JSON=<path> [SHARD_MODELS_PUBKEY=<b64>] npx tsx lib/orchestrator/registryDump.ts
 *
 * Prints: { ok, schema, version, publisher_pubkey, adapters:[...known], models:{ id: {...} } }
 * Exits non-zero (and prints {ok:false,error}) on any verification failure — fail closed.
 */
import { loadRegistryFromFile, modelsById, KNOWN_ADAPTERS, RegistryError } from './modelRegistry';

function main() {
  const pathArg = process.env.SHARD_MODELS_JSON;
  if (!pathArg) {
    console.log(JSON.stringify({ ok: false, error: 'SHARD_MODELS_JSON not set' }));
    process.exit(2);
  }
  try {
    const reg = loadRegistryFromFile(pathArg, process.env.SHARD_MODELS_PUBKEY || undefined);
    const byId = modelsById(reg);
    const models: Record<string, unknown> = {};
    for (const [id, m] of Object.entries(byId)) {
      models[id] = {
        hfArch: m.hfArch, workerModel: m.workerModel, enginePath: m.enginePath,
        layerCount: m.layerCount, gbPerLayer: m.gbPerLayer, kvGbPerLayer: m.kvGbPerLayer,
        quant: m.quant, adapter: m.adapter, tokenizerId: m.tokenizerId,
      };
    }
    console.log(JSON.stringify({
      ok: true, schema: reg.schema, version: reg.version,
      publisher_pubkey: reg.publisher_pubkey,
      adapters: [...KNOWN_ADAPTERS].sort(), models,
    }));
  } catch (e) {
    const msg = e instanceof RegistryError ? e.message : (e as Error).message;
    console.log(JSON.stringify({ ok: false, error: msg }));
    process.exit(1);
  }
}

main();
