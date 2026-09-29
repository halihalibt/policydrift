# PolicyDrift Project architecture · Studio V1

The browser reads the deployed SemanticDriftRegistry through `genlayer-js@1.1.8` on `studionet` (chain 61999). The single contract address is `0x914BE63CCAE73DF6f039cdb84D46b951851aB8Ca`. The [canonical source](../../policydrift-semantic-drift-registry/README.md) remains in its independent Intelligent Contract repository.

| Layer | Role |
| --- | --- |
| `src/lib/studio.ts` | One Studio client/configuration, finalized views, injected-wallet writes, hash polling and finality |
| `src/lib/transactions.ts` | Parse actual Studio `result_name` and leader receipt; require FINALIZED + MAJORITY_AGREE + SUCCESS |
| `src/lib/semantic.ts` | Convert frozen numeric enums and all 13 u32 material flag bits |
| `src/pages/Dashboard.tsx` | Read Watch count, every Watch and Observation history for metrics/recent list |
| `src/pages/CreateWatch.tsx` | Wallet-signed register, real transaction status and resulting Baseline V1 |
| `src/pages/WatchDetail.tsx` | Finalized Watch/Baseline/Observation records, evidence, comparison and history; guarded owner adoption |
| `src/pages/DebugPage.tsx` | Retained integration diagnostics for all five core views and three writes |

There is no authoritative local cache, server, database or mock protocol state. Dashboard's Semantic Changes metric counts distinct material Observations from chain history, not every repeated check. A repeated check can increase `check_count` and return an existing Observation ID; the frontend reads the Watch again after finality.

The latest Observation may reference an earlier Baseline after adoption. The Before vs Current table therefore compares it with `observation.baseline_id`, while the separate Active Baseline panel always displays `watch.active_baseline_id`. Historical records are loaded by `get_watch_baseline_ids`, `get_watch_observation_ids`, `get_baseline` and `get_observation`.

Only a matching connected Owner sees the Adopt button. It also requires the latest Observation ID, current active Baseline ID, MATERIAL_DRIFT, source OK, and PRESENT/NOT_STATED current state. The contract repeats all guards on write.

The SDK obtains a transaction hash from the browser's EIP-1193 provider. The UI tracks the hash until FINALIZED and then evaluates consensus and GenVM execution separately. `MAJORITY_DISAGREE` is Undetermined even if a leader executed successfully. Studio's generic gas estimate is only a diagnostic; the SDK estimates the encoded write when sending.

Hash routing and Vite's relative asset base support the intended GitHub Pages project path. The public demo policy is a static direct URL, with no runtime backend. The Studio Web Access redirect/final-URL limitation remains documented in the [contract stage](../../policydrift-semantic-drift-registry/docs/STUDIO_STAGE_RESULT.md); frontend code does not change the frozen source-boundary semantics.
