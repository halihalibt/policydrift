# PolicyDrift

A browser product for monitoring **what a public policy rule means**, rather than merely which words changed. [Open the live app](https://halihalibt.github.io/policydrift/#/) and inspect the three finalized [official Demo Watches](docs/DEMO.md).

## The user problem and workflow

A policy can rephrase a rule without changing it, or replace one short condition with a materially different requirement. Text diffs alone cannot tell a user which happened. PolicyDrift lets a user track one focused normative question against one public HTTPS policy page:

1. **Dashboard** lists on-chain Watches, recent observations and semantic change counts.
2. **Create Watch** takes a policy URL and question. GenLayer validators establish the first Semantic State as an on-chain Baseline.
3. **CHECK NOW** asks validators to revisit the same source and append an Observation when appropriate.
4. **Watch Detail** shows active Baseline, latest Current state, evidence quote, verdict, decoded drift flags, a Baseline vs Current comparison and append-only Semantic History. Eligible owners can choose to adopt a later Baseline; no adoption was made for the frozen official Demo.

All authoritative Watch, Baseline and Observation records come from the deployed Intelligent Contract. The frontend has no application database that substitutes a private answer.

## GenLayer Intelligent Contract

This Projects repository includes the complete, byte-identical V1.1 contract source at [`contracts/semantic_drift_registry.py`](contracts/semantic_drift_registry.py) and its unchanged [18 protocol tests](contract-tests/test_protocol.py). The separate [Intelligent Contracts repository](https://github.com/halihalibt/policydrift-semantic-drift-registry) remains the canonical source; the copy here makes the submitted Project independently reviewable. The contract source SHA-256 is `3a7ef302bf57b4c9ee7e8993dd7aac2496c4272faa168f61368af219d657e3d4`.

Deployed V1.1: [`0x4bBF1Eaa4947686F2291605Caf1DC4e19F55C3C2`](https://explorer-studio.genlayer.com/address/0x4bBF1Eaa4947686F2291605Caf1DC4e19F55C3C2) on GenLayer Studio / Studionet **61999**, protocol `PolicyDrift-V1.1-Studio`.

```text
Frontend SDK → SemanticDriftRegistry → GenLayer validator consensus
             → structured Semantic State → deterministic drift classifier
             → append-only Baseline and Observation history
```

See [`CONTRACT.md`](CONTRACT.md) for the exact client read and write methods, nondeterministic validator flow, deterministic state transitions and frontend file paths. The contract test suite runs with `python -m unittest discover -s contract-tests -v` and uses a minimal simulated GenLayer host; the linked Studio Explorer transactions separately demonstrate real validator execution.

## Why GenLayer is the product core

The leader and validators independently retrieve the registered public source and assess its structured Semantic State. Consensus verifies critical fields and evidence anchoring; deterministic contract logic computes material drift and stores shared, inspectable history. This is not a single LLM API response behind a dashboard. The reusable protocol is maintained in the separate [canonical SemanticDriftRegistry repository](https://github.com/halihalibt/policydrift-semantic-drift-registry); this Project delivers the browser workflow, SDK integration, result interpretation and public demonstration. The included contract copy supports direct review of that integration.

## Official V1.1 three-Watch Demo — finalized

The [official policy URL](https://halihalibt.github.io/policydrift/demo/policy.html) initially published V1: commercial API-data use required attribution, independent redistribution was prohibited, and AI model training was not stated. Three new Watches established V1 Baselines on the V1.1 Studio contract. The same URL now serves frozen V2: prior written approval replaces attribution, redistribution remains prohibited, and AI training is prohibited. Each Watch was checked exactly once against V2 and retains its original V1 active Baseline.

| Watch | Baseline V1 → Current V2 | Final result | Studio Explorer |
| --- | --- | --- | --- |
| [#3 Commercial Use](https://halihalibt.github.io/policydrift/#/watch/3) | `PRESENT/ALLOWED`, attribution → `PRESENT/ALLOWED`, prior written approval | `MATERIAL_DRIFT + CONDITION_CHANGED` | [FINALIZED transaction](https://explorer-studio.genlayer.com/tx/0x70aa98f64f9327d73a118a5aec3d9bc73f4dfca1f6f736d5ee2dc8db54e0bdb8) |
| [#4 Redistribution](https://halihalibt.github.io/policydrift/#/watch/4) | `PRESENT/PROHIBITED` → same material state | `NO_MATERIAL_DRIFT`, no material flags | [FINALIZED transaction](https://explorer-studio.genlayer.com/tx/0xf2fdc2916a983487ce0b94d501ad892146fed9b2fc68047378960c18a5fcdcb7) |
| [#5 AI Training](https://halihalibt.github.io/policydrift/#/watch/5) | `NOT_STATED/NONE` → `PRESENT/PROHIBITED` | `MATERIAL_DRIFT + RULE_APPEARED` | [FINALIZED transaction](https://explorer-studio.genlayer.com/tx/0xb71d2f743f88c28983773b88f9c030b5421d4121c49a8ef960cc2e2926d524b6) |

All three Explorer transactions finalized with majority acceptance on Studio 61999, Normal execution and five initial validators. The Registry records one check and one Observation for each Watch; active Baselines remain V1 IDs 3, 4 and 5. [Demo walkthrough and evidence links](docs/DEMO.md) provide the exact questions and source wording. Reviewers can inspect existing results without a wallet write; do not repeat CHECK NOW or adopt these frozen Baselines for the submission.

**Separate Presence Transition validation:** V1.1 Watches 1 and 2 previously finalized both `RULE_APPEARED` and `RULE_DISAPPEARED` using the isolated [validation source](public/demo/validation-policy.html). They are not the official #3/#4/#5 Demo and remain frozen. [Preparation record](docs/OFFICIAL_V1_1_BASELINE_PREPARATION.md) is an archived snapshot of the earlier stage.

**Historical V1:** the old contract `0x914BE63CCAE73DF6f039cdb84D46b951851aB8Ca`, old Demo successes/failures and [browser integration proof](docs/STUDIO_FRONTEND_INTEGRATION.md) are historical only. They do not establish V1.1 acceptance.

## Studio configuration

| Item | Current V1.1 value |
| --- | --- |
| Network | GenLayer Studio / Studionet, chain ID `61999` |
| API | `https://studio.genlayer.com/api` |
| Contract | [`0x4bBF1Eaa4947686F2291605Caf1DC4e19F55C3C2`](https://explorer-studio.genlayer.com/address/0x4bBF1Eaa4947686F2291605Caf1DC4e19F55C3C2) |
| Protocol | `PolicyDrift-V1.1-Studio` |
| SDK | `genlayer-js@1.1.8` (pinned exactly) |

The shared SDK integration is `src/lib/studio.ts`; semantic enum/bitmask conversion is `src/lib/semantic.ts`. No private key, server wallet, OpenAI API key, backend, database or paid service is required.

## Run locally

Requires a recent Node.js and a compatible injected browser wallet:

```bash
npm ci
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173/#/`. Routes are `/#/` (Dashboard), `/#/create`, `/#/watch/:id` and `/#/debug` (retained diagnostics). Wallet-signed writes use the Studio network; existing Watch data is publicly readable.

```bash
npm test
npm run lint
npm run build
```

The build uses relative asset paths for GitHub Pages and includes the frozen V2 `dist/demo/policy.html`. The Pages workflow builds and deploys on pushes to `main`. See [architecture](docs/ARCHITECTURE.md), [official Demo](docs/DEMO.md) and [historical V1 stage record](docs/PROJECT_STAGE_RESULT.md). The Project and Intelligent Contract have independent Git histories.

## Known non-blocking status display issue

During some writes the frontend temporarily reported an RPC/status retrieval error or incomplete receipt before the finalized Registry and Explorer state was visible after refresh. The root cause is unproven; do not infer a Studio node fault or a contract failure. OKX `wallet_getSnaps` compatibility and receipt reconciliation are deferred UI work, separate from the accepted on-chain results.
