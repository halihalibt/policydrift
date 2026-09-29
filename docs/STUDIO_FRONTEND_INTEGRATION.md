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

## Remaining acceptance gate

The cloud browser returned `ERR_BLOCKED_BY_CLIENT` for `http://127.0.0.1:5173/#/debug`. Terminal sessions are isolated network namespaces, so a server started in one command cannot be reached by another command or that browser. A request to run outside the sandbox was automatically rejected by the execution approval policy. Browser wallet presence, wallet-signed write hash, browser transaction finalization, and the current frontend screenshot therefore remain **unverified**. The temporary `/debug` page is ready for a browser with MetaMask and access to a local or static deployment. Do not move the HANDOFF gate to the three formal pages until one real frontend-signed write finalizes successfully.

No Intelligent Contract interface defect or protocol change has been found. The existing redirect/source limitation remains exactly as described by the contract stage report.
