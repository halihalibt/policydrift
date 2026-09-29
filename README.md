# PolicyDrift

Monitor when public rules actually change, rather than when webpage text merely changes.

## What is it?

PolicyDrift tracks one normative question against one public policy URL. A Watch stores a semantic Baseline; later checks append Observations with a verdict, material-change flags, evidence and history. The protocol is implemented in the separately maintained [SemanticDriftRegistry repository](../policydrift-semantic-drift-registry/README.md). This Project is its browser interface and contains no second canonical contract source.

## Why are text diffs insufficient?

A policy can rephrase the same rule without changing what it permits, while a few altered words can replace an attribution condition with prior written approval. Comparing bytes or page hashes cannot reliably distinguish those cases.

## Why GenLayer?

Validators independently retrieve public evidence and agree on the semantic state. The Intelligent Contract then applies deterministic drift rules and stores append-only Baselines and Observations. Anyone can inspect the same record or trigger another check.

## How does the protocol work?

Connect an external wallet, establish a Baseline with **Create Watch**, open its detail page and use **CHECK NOW**. The page displays the active Baseline, latest verdict, decoded change flags, evidence quote, Before vs Current table and complete semantic history. A connected Owner can **ADOPT AS BASELINE** only when the latest Observation meets the contract's adoption guards. All official data comes from the deployed contract; the frontend has no backend or database.

## How do I try the demo?

The public three-Watch V1→V2 demo is being prepared. The current [V1 source](public/demo/policy.html) must be published at a stable direct-200 URL **before** registering the three Demo Watches; it has not yet been published or registered. Meanwhile the release contract already has [live Watches](https://explorer-studio.genlayer.com/address/0x914BE63CCAE73DF6f039cdb84D46b951851aB8Ca). After opening the app locally, Dashboard and Watch Detail read those real records. The [Studio frontend proof](docs/STUDIO_FRONTEND_INTEGRATION.md) includes a wallet-signed finalized check and screenshot.

## Studio configuration

| Item | V1 value |
| --- | --- |
| Network | GenLayer Studio / Studionet, chain ID `61999` |
| API | `https://studio.genlayer.com/api` |
| Contract | [`0x914BE63CCAE73DF6f039cdb84D46b951851aB8Ca`](https://explorer-studio.genlayer.com/address/0x914BE63CCAE73DF6f039cdb84D46b951851aB8Ca) |
| SDK | `genlayer-js@1.1.8` (pinned exactly) |

The single network integration is `src/lib/studio.ts`; semantic enum/bitmask conversion is `src/lib/semantic.ts`. No private key, server wallet, OpenAI API key, backend, database or paid service is used.

## Run and verify

Requires a recent Node.js and a browser with MetaMask:

```bash
npm ci
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173/#/`. Routes are `/#/` (Dashboard), `/#/create`, `/#/watch/:id`, and the retained temporary `/#/debug`. Connect Wallet authorizes the account and switches/adds Studio through the SDK. All writes are signed by that browser wallet.

```bash
npm test
npm run lint
npm run build
```

The build uses relative asset paths for a GitHub Pages project repository. The output includes `dist/demo/policy.html`. Publishing to Pages, the three Demo Watches and V2 switch are still pending.

See [architecture](docs/ARCHITECTURE.md), [demo sequence](docs/DEMO.md), [frontend proof](docs/STUDIO_FRONTEND_INTEGRATION.md) and the [contract deployment report](../policydrift-semantic-drift-registry/docs/STUDIO_STAGE_RESULT.md). The Project is a separate local Git repository; remote GitHub publication remains open.
