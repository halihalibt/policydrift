# PolicyDrift

Monitor when public rules actually change, rather than when webpage text merely changes.

## What is it?

PolicyDrift tracks one normative question against one public policy URL. A Watch stores a semantic Baseline; later checks append Observations with a verdict, material-change flags, evidence and history. The protocol is implemented in the separately maintained [SemanticDriftRegistry repository](https://github.com/halihalibt/policydrift-semantic-drift-registry). This Project is its browser interface and contains no second canonical contract source.

## Why are text diffs insufficient?

A policy can rephrase the same rule without changing what it permits, while a few altered words can replace an attribution condition with prior written approval. Comparing bytes or page hashes cannot reliably distinguish those cases.

## Why GenLayer?

Validators independently retrieve public evidence and agree on the semantic state. The Intelligent Contract then applies deterministic drift rules and stores append-only Baselines and Observations. Anyone can inspect the same record or trigger another check.

## How does the protocol work?

Connect an external wallet, establish a Baseline with **Create Watch**, open its detail page and use **CHECK NOW**. The page displays the active Baseline, latest verdict, decoded change flags, evidence quote, Before vs Current table and complete semantic history. A connected Owner can **ADOPT AS BASELINE** only when the latest Observation meets the contract's adoption guards. All official data comes from the deployed contract; the frontend has no backend or database.

## How do I try the demo?

The official V1.1 three-Watch demo is at **Stage 1: baseline preparation**. The [official policy source](public/demo/policy.html) has been restored to frozen V1: commercial use requires attribution, redistribution is prohibited, and no AI training clause is present. Official V1.1 Demo Watches have not been created. The next stage must verify the published V1 before establishing all three Baselines and then publishing V2.

**Presence Transition Validation: PASS.** Independent validation Watches 1 and 2 on V1.1 finalized RULE_APPEARED and RULE_DISAPPEARED. These are frozen validation records, not official Demo Watches. Leave [validation-policy.html](public/demo/validation-policy.html) unchanged. See [V1.1 preparation record](docs/OFFICIAL_V1_1_BASELINE_PREPARATION.md).

**Historical V1:** the old contract `0x914BE63CCAE73DF6f039cdb84D46b951851aB8Ca`, its old Demo #3/#4 successes and #5 failures, and the [browser wallet proof](docs/STUDIO_FRONTEND_INTEGRATION.md) remain historical evidence. They do not prove the new V1.1 official demo.

## Studio configuration

| Item | Current V1.1 value |
| --- | --- |
| Network | GenLayer Studio / Studionet, chain ID `61999` |
| API | `https://studio.genlayer.com/api` |
| Contract | [`0x4bBF1Eaa4947686F2291605Caf1DC4e19F55C3C2`](https://explorer-studio.genlayer.com/address/0x4bBF1Eaa4947686F2291605Caf1DC4e19F55C3C2) |
| Protocol | `PolicyDrift-V1.1-Studio` |
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

The build uses relative asset paths for a GitHub Pages project repository. The output includes `dist/demo/policy.html`. The Pages workflow can publish this prepared V1 build. Official V1.1 Baseline registration and the later V2 switch require the next stage.

See [architecture](docs/ARCHITECTURE.md), [demo sequence](docs/DEMO.md), [frontend proof](docs/STUDIO_FRONTEND_INTEGRATION.md) and the [contract deployment report](https://github.com/halihalibt/policydrift-semantic-drift-registry/blob/main/docs/STUDIO_STAGE_RESULT.md). The Project and Intelligent Contract retain independent Git histories.
