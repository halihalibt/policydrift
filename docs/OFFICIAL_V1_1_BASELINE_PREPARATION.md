# Official V1.1 Demo Baseline Preparation — Stage 1

Date: 2026-09-29. **Presence Transition Validation: PASS.** Official demo baseline preparation is complete; official Demo Watches have not been created.

## Frozen configuration

- Contract: `0x4bBF1Eaa4947686F2291605Caf1DC4e19F55C3C2`.
- Protocol: `PolicyDrift-V1.1-Studio`; canonical contract commit `5d96d9f1b175b16c27f62280bdbb5cc6bfee3819`.
- Contract source SHA-256: `3a7ef302bf57b4c9ee7e8993dd7aac2496c4272faa168f61368af219d657e3d4`.
- Studionet 61999, `https://studio.genlayer.com/api`, `genlayer-js@1.1.8` unchanged.
- `src/lib/studio.ts` is the sole SDK contract-address configuration. Debug, Dashboard, Create Watch and Watch Detail use its shared read/write functions. Protocol labels are read from the contract, not hardcoded to V1.

## Frozen validation evidence — PASS

- [Deployment](https://explorer-studio.genlayer.com/tx/0x6af424162efcb45e997fdfa8bd759948cf140ae022ec797088a98acf7ee9dff8): finalized, Accepted, GenVM SUCCESS; finalized version and deployed source hash matched canonical source.
- [Validation Watch 1 RULE_APPEARED](https://explorer-studio.genlayer.com/tx/0xedbbe5a5f21a8bf1c5a7f0ac65a45bec36e256dd546a03251acb456243a7d579): finalized, Accepted, SUCCESS; Observation 1 MATERIAL_DRIFT, flag 1. Two internal leader rotations preceded final acceptance.
- [Validation Watch 2 RULE_DISAPPEARED](https://explorer-studio.genlayer.com/tx/0x79de5188467b519154abd99c975e545a5a0642c6d07f055d7890a744b8ce77c5): finalized, Accepted, SUCCESS; Observation 2 MATERIAL_DRIFT, flag 2.
- Validation Watches 1/2 and `public/demo/validation-policy.html` are frozen. Do not check, adopt or reuse them for the official demo.

## Prepared official V1 policy

`public/demo/policy.html` contains exactly these two rules, with the original page title and section headings:

1. Commercial Use: `Third-party developers may use API data in commercial applications provided that attribution is displayed.`
2. Redistribution: `Independent redistribution of API data is prohibited.`

There is no AI training section, rule or explanatory text. Build copies it to `dist/demo/policy.html`. The separate validation source remains byte-identical to its final validation state.

## Local verification and publication

- `npm test`: 7/7 passed.
- `npm run lint`: passed.
- `npm run build`: passed; existing bundle-size warning remains, with no build error.
- Pages workflow: main push / workflow_dispatch → npm ci → tests → build → dist artifact → GitHub Pages deployment. Existing permissions and versions are retained.
- Publication readiness does not establish new on-chain Baselines. Public V1 must be checked for direct HTTPS 200 and exact text in the next stage.

## Historical V1 and deferred work

Historical V1 address `0x914BE63CCAE73DF6f039cdb84D46b951851aB8Ca`, old #3/#4 successes and old #5 failures remain historical evidence. Existing integration screenshots and transactions are not V1.1 official-demo acceptance.

This preparation changes no contract source or chain state. It creates no official Demo Watch, adopts no Baseline, and does not switch the official policy back to V2. OKX `wallet_getSnaps`, wallet connection logic, UI redesign and new features are excluded.

Next approved stage must follow: publish and verify official V1 → register three independent official Baselines on V1.1 → inspect finalized states → publish frozen V2 → verify CONDITION_CHANGED, NO_MATERIAL_DRIFT and RULE_APPEARED. Pause for user confirmation before that stage.
