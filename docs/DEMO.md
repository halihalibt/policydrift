# Public Demo sequence · not yet deployed

The [V1 policy source](../public/demo/policy.html) is prepared. Its public URL must be a stable direct-200 HTTPS response on GitHub Pages, reachable by Studio validators. Do not register Demo Watches against a local file or replace V1 with V2 until all three initial Baselines have finalized and been inspected.

| Watch | Frozen question | Expected V1 Baseline |
| --- | --- | --- |
| A | Is commercial use of API data allowed subject to any required condition? | PRESENT / ALLOWED; attribution required |
| B | Is independent redistribution of API data prohibited? | PRESENT / PROHIBITED |
| C | Is API data allowed for AI model training? | NOT_STATED |

After the three V1 Baselines exist, replace the **same** public `policy.html` with the HANDOFF V2 text. It changes Commercial Use to prior written approval, retains the redistribution prohibition and adds an AI Training prohibition. Check A, B, C on Studio. Expected: A = MATERIAL_DRIFT with CONDITION_CHANGED; B = NO_MATERIAL_DRIFT; C = MATERIAL_DRIFT with RULE_APPEARED.

Leave the published policy in V2 and do not Adopt A or C. Repeated CHECK NOW operations should reproduce the material difference without appending duplicate semantic Observations.

**Current status:** no public demo URL, V1 registrations, V2 publication or three verdict proofs yet. Those results will be recorded here only after real Studio transactions. No demo Watch ID is hardcoded into the app.
