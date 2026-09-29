# PolicyDrift · Project

Studio-only React/TypeScript/Vite frontend for the frozen [SemanticDriftRegistry repository](../policydrift-semantic-drift-registry/README.md). This repository contains **no second copy** of the canonical Intelligent Contract source.

## Frozen integration

| Item | Value |
| --- | --- |
| Network | GenLayer Studio / Studionet, chain ID `61999` |
| API | `https://studio.genlayer.com/api` |
| Contract | [`0x914BE63CCAE73DF6f039cdb84D46b951851aB8Ca`](https://explorer-studio.genlayer.com/address/0x914BE63CCAE73DF6f039cdb84D46b951851aB8Ca) |
| SDK | `genlayer-js@1.1.8` (exact version) |
| Contract deployment evidence | [Intelligent Contract stage result](../policydrift-semantic-drift-registry/docs/STUDIO_STAGE_RESULT.md) |

The single frontend network configuration is `src/lib/studio.ts`. Frozen enum and u32 bitmask decoding is in `src/lib/semantic.ts`; Studio transaction status parsing is in `src/lib/transactions.ts`.

## Run the current integration build

```bash
npm ci
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173/#/debug` in a browser with an injected MetaMask wallet. Use **Connect Wallet** to authorize the external account, switch/add Studionet and install the GenLayer Snap through the SDK prompt. The browser wallet signs every write through EIP-1193. There are no private keys, server wallets, fake transactions, backend, database or paid APIs in this Project.

The temporary debug page reads `get_protocol_version`, `get_watch_count`, `get_watch`, `get_active_baseline`, `get_observation`, and provides wallet-signed `register_watch`, `check_drift`, `adopt_observation`. It shows the hash immediately, polls consensus status, explicitly waits for `FINALIZED`, and classifies majority agreement plus successful GenVM execution before reporting success. A finalized disagreement is **Undetermined**, never a successful Watch. Returned IDs are decoded from Studio's leader receipt.

```bash
npm test
npm run build
npm run lint
```

## Verification boundary

Node-side `genlayer-js@1.1.8` calls against the deployed Studio contract passed for all view methods exercised in the [frontend integration record](docs/STUDIO_FRONTEND_INTEGRATION.md). Build, lint and semantic/transaction adapter tests pass. Browser wallet signing and browser-side finalization have **not** been witnessed yet: this execution environment's cloud browser blocks its isolated local Vite server. Dashboard, Create Watch and Watch Detail wait for the required `/debug` browser closure, as ordered in the HANDOFF. Do not count previous contract-stage Studio writes as frontend-signed transactions.

The Project is a separate local git repository. The required remote repository and GitHub Pages publication are not yet established.
