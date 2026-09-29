# Official V1.1 Demo — finalized three-result walkthrough

This is the **completed** V1→V2 Demo on GenLayer Studio / Studionet `61999`, contract [`0x4bBF1Eaa4947686F2291605Caf1DC4e19F55C3C2`](https://explorer-studio.genlayer.com/address/0x4bBF1Eaa4947686F2291605Caf1DC4e19F55C3C2), protocol `PolicyDrift-V1.1-Studio`. The [app](https://halihalibt.github.io/policydrift/#/) and [public V2 policy](https://halihalibt.github.io/policydrift/demo/policy.html) are live. Existing records can be read without signing. **Do not perform another CHECK NOW or ADOPT on these frozen proof Watches.**

## How the two published versions differed

The same stable, direct-200 HTTPS source URL served V1 while Baselines were registered, then V2 while the three checks were run. The original V1 is preserved by the on-chain Baseline and repository history; the current public page is V2.

| Section | V1 at Baseline establishment | Published V2 at drift check |
| --- | --- | --- |
| Commercial Use | `Third-party developers may use API data in commercial applications provided that attribution is displayed.` | `Third-party developers may use API data in commercial applications only after obtaining prior written approval.` |
| Redistribution | `Independent redistribution of API data is prohibited.` | Same text and meaning |
| AI Training | No AI model training clause | `API data may not be used for AI model training.` |

## Inspect the three finalized Watches

| Watch / question | Active V1 Baseline | V2 Observation and verdict | Final transaction |
| --- | --- | --- | --- |
| [#3](https://halihalibt.github.io/policydrift/#/watch/3): Is commercial use of API data allowed subject to any required condition? | ID 3, `PRESENT/ALLOWED`, condition `attribution is displayed` | Observation 3, `PRESENT/ALLOWED`, condition `prior written approval`; `MATERIAL_DRIFT + CONDITION_CHANGED` | [Explorer `0x70aa98…0bdb8`](https://explorer-studio.genlayer.com/tx/0x70aa98f64f9327d73a118a5aec3d9bc73f4dfca1f6f736d5ee2dc8db54e0bdb8) |
| [#4](https://halihalibt.github.io/policydrift/#/watch/4): Is independent redistribution of API data prohibited? | ID 4, `PRESENT/PROHIBITED` | Observation 4, materially unchanged; `NO_MATERIAL_DRIFT`, flags `0` | [Explorer `0xf2fdc2…cdcb7`](https://explorer-studio.genlayer.com/tx/0xf2fdc2916a983487ce0b94d501ad892146fed9b2fc68047378960c18a5fcdcb7) |
| [#5](https://halihalibt.github.io/policydrift/#/watch/5): Is API data allowed for AI model training? | ID 5, `NOT_STATED/NONE`, no direct excerpt | Observation 5, `PRESENT/PROHIBITED`, direct V2 quote; `MATERIAL_DRIFT + RULE_APPEARED` | [Explorer `0xb71d2f…524b6`](https://explorer-studio.genlayer.com/tx/0xb71d2f743f88c28983773b88f9c030b5421d4121c49a8ef960cc2e2926d524b6) |

Each Watch has `check_count=1`, `observation_count=1`, `baseline_version=1` and active Baseline ID 3/4/5. None was adopted to Baseline V2. Each linked transaction reached Explorer `FINALIZED` and consensus `Accepted` (SDK `MAJORITY_AGREE`) in Normal mode with five initial validators. #5 finalized after three rounds and two leader rotations; preserve full consensus history, including a quorum-reached cancellation in an intermediate execution.

On each Watch Detail page, inspect **Active Baseline**, **Baseline vs Current**, and **Semantic History**, then open the matching Explorer transaction's **Overview**, **Consensus**, and **Monitoring** views. The dashboard and Create Watch page explain the full product workflow; the existing demo needs no further transaction to be reviewed.

## Independent and historical evidence

The separate V1.1 validation Watches 1 and 2 and [`validation-policy.html`](../public/demo/validation-policy.html) proved both `RULE_APPEARED` and `RULE_DISAPPEARED` before the official Demo. They are frozen and not official Demo Watches. The older V1 contract `0x914BE63CCAE73DF6f039cdb84D46b951851aB8Ca` and its earlier screenshots/transactions remain historical only. [Baseline preparation record](OFFICIAL_V1_1_BASELINE_PREPARATION.md) is a dated snapshot, not the current status.

## Known non-blocking display issue

The UI occasionally displayed a transient RPC or receipt retrieval error before refresh showed the finalized Registry and Explorer state. Cause has not been established. This is recorded as a **Transient RPC / frontend status retrieval anomaly**, not a protocol failure or proof of a Studio node outage. Wallet compatibility and receipt cleanup are deferred to a separate stage.
