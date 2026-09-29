# Studio frontend integration record

Date: 2026-09-29. Contract source and release address remain frozen; no contract files were edited.

## Chosen SDK and calls

| Area | Pinned Studio behavior |
| --- | --- |
| Package | `genlayer-js@1.1.8`; npm `latest` tag verified as `1.1.8`, separate RC unused |
| Reader | `createClient({ chain: studionet })`, `readContract({ address, functionName, args, transactionHashVariant: TransactionHashVariant.LATEST_FINAL, jsonSafeReturn: true })` |
| Wallet | External injected `window.ethereum`; `eth_requestAccounts`, `createClient({ chain: studionet, account: address, provider })`, `client.connect('studionet')`, then verify `eth_chainId === 0xf22f` |
| Write | `writeContract({ address, functionName, args, value: 0n })` returns the Studio transaction hash; the SDK uses EIP-1193 `eth_sendTransaction` for the injected wallet |
| Gas | `estimateTransactionGas({ from, to, data: '0x', value: 0n })` + `eth_gasPrice` generic diagnostic; SDK estimates the exact encoded write itself at send time |
| Finality | Poll `getTransaction({ hash })` for progress and request `waitForTransactionReceipt({ hash, status: TransactionStatus.FINALIZED, retries: 0 })` after finalization |
| Outcome | Actual Studio `statusName: 'FINALIZED'` and `result_name: 'MAJORITY_AGREE'` and final leader `execution_result: 'SUCCESS'` all required. `MAJORITY_DISAGREE` is Undetermined. `FINALIZED` alone is not success. |
| IDs | Final leader receipt `result.status: 'return'`, `result.payload.readable`, checked as a positive safe integer |

The Studio RPC returns `result_name` and `consensus_data` in snake case despite SDK type declarations that also describe camel case fields. `src/lib/transactions.ts` reads the observed payload. The `genlayer-js` chain object resolves precisely to ID 61999 and `https://studio.genlayer.com/api`; initialization fails if those values drift.

## Actual results

- Node SDK read on the release address: `get_protocol_version = PolicyDrift-V1-Studio`; `get_watch_count = 2`. `get_watch(1)`, `get_active_baseline(1)`, `get_observation(1)`, `get_watch_baseline_ids(1) = [1]` and `get_watch_observation_ids(1) = [1]` succeeded. Watch 1 owner is `0x8B58CDEE513c8B97E9356d3d1F25dD43DB171600`, baseline version 1, one deduplicated observation.
- SDK `getTransaction` on [a successful Studio register](https://explorer-studio.genlayer.com/tx/0x3ce22ebdc6fe96e3f0cbec0daf99613a3580151bcc67a626b26d22697cab8fd1) returned `FINALIZED / MAJORITY_AGREE / SUCCESS`, returned ID `1`. [An earlier disagreement](https://explorer-studio.genlayer.com/tx/0xad5adbbb3d8b797d7662d8acdb7d238f6ec8b8bb5aea83433bdbbc84218d92d4) returned `FINALIZED / MAJORITY_DISAGREE`; it did not create a Watch. Those transactions predate this frontend, so they are **not** browser wallet proof.
- Generic Studio SDK estimate returned `500000` gas and `eth_gasPrice = 0x0`; this is not a method-specific fee quote. The Studio API answered a browser-origin `OPTIONS` preflight for `http://localhost:5173` with `access-control-allow-origin: http://localhost:5173` and POST/content-type enabled.
- `npm test`: 6/6 adapter tests; `npm run build` and `npm run lint`: passed. Vite reported ready at `http://127.0.0.1:5173/` inside the terminal sandbox.

## Browser wallet acceptance: passed

The user ran this Project's `/debug` in a local browser with MetaMask and supplied the [success screenshot](studio_debug_browser_success.png) (SHA-256 `b3bf0cf8cd5609fa9f9955bcef2d611726fa39261b2874d83ae3ed3eed62ab34`). It shows the connected wallet `0x22acaa233b7b985b36ef168f2de9295334065b15`, Studio/Studionet 61999, the release contract address and `genlayer-js@1.1.8`.

The browser signed `check_drift(1)`: [transaction `0xfc447cf054a8176b8bfb364f28b63ae7a6a12e6882f4e14c8e5bb56c99b811b8`](https://explorer-studio.genlayer.com/tx/0xfc447cf054a8176b8bfb364f28b63ae7a6a12e6882f4e14c8e5bb56c99b811b8), `FINALIZED / MAJORITY_AGREE / SUCCESS`, returned Observation ID `1`. The same screenshot shows finalized `get_watch(1)` with `check_count = 3`, `observation_count = 1`, `last_observation_id = 1`: the repeated semantic state reused Observation 1. This proof is user-provided browser evidence; it is distinct from the contract-stage transactions.

**Studio Frontend Integration Freeze passed.** The earlier isolated-cloud-browser access limitation no longer blocks Project work because the required local browser flow was completed. The first wallet connection sometimes showed `Wallet: [object Object]`; the frontend now extracts provider error messages and codes through `src/lib/errors.ts`.

## Execution environment note

The agent's cloud browser still cannot open the local Vite server in this execution environment. Subsequent formal-page UI code is verified by build/tests and Studio read calls; its browser rendering and write controls require a reachable browser. Do not represent that limitation as a failed Studio contract flow.

No Intelligent Contract interface defect or protocol change has been found. The existing redirect/source limitation remains exactly as described by the contract stage report.
