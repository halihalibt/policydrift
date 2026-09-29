# PolicyDrift Project stage · Studio frontend and formal pages

Status: Studio Frontend Integration Freeze **passed** on 2026-09-29 based on the user's actual browser transaction and [screenshot](studio_debug_browser_success.png). Dashboard, Create Watch and Watch Detail basic functionality is implemented. Public Demo step 40 (policy V1 source) is prepared; step 41 (public source deployment) remains open, so there are no Demo Watch/V2 claims.

## Frozen Project configuration

| Item | Value |
| --- | --- |
| JavaScript SDK | `genlayer-js@1.1.8` exact |
| Network | GenLayer Studio / Studionet, chain ID `61999` |
| API | `https://studio.genlayer.com/api` |
| Contract | [`0x914BE63CCAE73DF6f039cdb84D46b951851aB8Ca`](https://explorer-studio.genlayer.com/address/0x914BE63CCAE73DF6f039cdb84D46b951851aB8Ca) |
| Contract source | Independent frozen `policydrift-semantic-drift-registry` repository; no source copy or modification in this Project |
| Frontend | React, TypeScript, Vite, HashRouter; no backend, database, server wallet or private key |

## Browser evidence

The user connected MetaMask at `0x22acaa233b7b985b36ef168f2de9295334065b15`, selected Studio 61999, read `get_watch(1)` and signed `check_drift(1)` in `/debug`.

| Result | Evidence |
| --- | --- |
| Transaction | [`0xfc447cf054a8176b8bfb364f28b63ae7a6a12e6882f4e14c8e5bb56c99b811b8`](https://explorer-studio.genlayer.com/tx/0xfc447cf054a8176b8bfb364f28b63ae7a6a12e6882f4e14c8e5bb56c99b811b8) |
| Finality/outcome | `FINALIZED / MAJORITY_AGREE / GenVM SUCCESS / SUCCESS` |
| Returned ID | Observation `1` |
| Finalized Watch state | `check_count=3`, `observation_count=1`, `last_observation_id=1`; repeated semantic state deduplicated |
| Screenshot | [Browser proof](studio_debug_browser_success.png), SHA-256 `b3bf0cf8cd5609fa9f9955bcef2d611726fa39261b2874d83ae3ed3eed62ab34` |

The screenshot and transaction were supplied by the user from a local browser. The agent's isolated cloud browser cannot reach that local Vite server; the user browser proof is the basis of this gate, not an invented agent run.

## Formal pages

| Route | Basic behavior |
| --- | --- |
| `/#/` Dashboard | Live Watch count, Checks, distinct material Observations, active Baselines and recent Watches; real history and latest verdict |
| `/#/create` Create Watch | Policy URL and normative Target, browser-wallet `register_watch`, real transaction lifecycle, returned ID and Baseline V1 |
| `/#/watch/:id` Watch Detail | Source, Target, Owner, active Baseline, semantic state/digest, latest verdict/flags/evidence, Before vs Current against the Observation's referenced Baseline, Observation and Baseline histories, CHECK NOW and owner-only eligible Adopt |
| `/#/debug` | Retained all five core reads and three writes for diagnostics |

The first wallet connection's short `Wallet: [object Object]` notice is addressed by extracting provider messages/codes in `src/lib/errors.ts`. No contract change was necessary.

## Verification and remaining work

The restored Project runs `npm test`, `npm run lint` and `npm run build` successfully. The SDK has returned actual Studio Baseline and history-ID views used by Watch Detail. The formal pages' rendering and their individual write buttons have not been exercised in the user's browser yet; Create Watch and owner Adopt remain live acceptance items during the upcoming Demo transactions.

The V1 demo source is `public/demo/policy.html`, and the build copies it to `dist/demo/policy.html`. `.github/workflows/pages.yml` prepares GitHub Pages. The connected GitHub account has no `policydrift` repository yet, and the available GitHub connector has no repository-create operation. The public V1 URL, three registration hashes/Baselines, V2 switch, three verdicts and final Pages deployment proof remain open. Do not change `policy.html` to V2 before all three V1 Baselines exist.

No deviation from the frozen protocol is introduced. The Studio redirect/final-URL limitation remains in the Intelligent Contract stage report; the frontend does not reinterpret it.
