# Official V1.1 Demo · Stage 1 baseline preparation

The [V1 policy source](../public/demo/policy.html) is prepared. Its public URL must be a stable direct-200 HTTPS response on GitHub Pages, reachable by Studio validators. Do not register Demo Watches against a local file or replace V1 with V2 until all three initial Baselines have finalized and been inspected.

| Watch | Frozen question | Expected V1 Baseline |
| --- | --- | --- |
| A | Is commercial use of API data allowed subject to any required condition? | PRESENT / ALLOWED; attribution required |
| B | Is independent redistribution of API data prohibited? | PRESENT / PROHIBITED |
| C | Is API data allowed for AI model training? | NOT_STATED |

After the three V1 Baselines exist, replace the **same** public `policy.html` with the HANDOFF V2 text. It changes Commercial Use to prior written approval, retains the redistribution prohibition and adds an AI Training prohibition. Check A, B, C on Studio. Expected: A = MATERIAL_DRIFT with CONDITION_CHANGED; B = NO_MATERIAL_DRIFT; C = MATERIAL_DRIFT with RULE_APPEARED.

Leave the published policy in V2 and do not Adopt A or C. Repeated CHECK NOW operations should reproduce the material difference without appending duplicate semantic Observations.

**Current status:** V1.1 isolated presence-transition validation is PASS. Official V1 source is prepared locally for publication; no official V1.1 Demo Watch has been created. The existing V1.1 Watch 1/2 and `validation-policy.html` are frozen validation evidence and must not be checked, adopted or reused for this demo. The old V1 address and old Demo #3/#4/#5 are historical evidence. No demo Watch ID is hardcoded into the app.

Stage 1 stops after preparation, tests and the Project commit. Next stage: verify public V1 → create three official Baselines on V1.1 → inspect finalized states → publish V2 → verify the three Drift results. Wallet Compatibility Cleanup, including OKX `wallet_getSnaps`, is deferred until all three official Drifts pass.
