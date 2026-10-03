# GenLayer contract in the PolicyDrift Project

This document maps the browser client to the complete V1.1 contract source included in this repository. The [Intelligent Contracts repository](https://github.com/halihalibt/policydrift-semantic-drift-registry) remains canonical; [`contracts/semantic_drift_registry.py`](contracts/semantic_drift_registry.py) is a byte-identical review copy of its deployed V1.1 source, not a new deployment or a changed protocol. The source SHA-256 in both repositories is `3a7ef302bf57b4c9ee7e8993dd7aac2496c4272faa168f61368af219d657e3d4` (canonical source commit `5d96d9f1b175b16c27f62280bdbb5cc6bfee3819`). [`contract-tests/test_protocol.py`](contract-tests/test_protocol.py) copies the canonical protocol test suite without changing its assertions.

## 1. Deployed contract

| Item | Value |
| --- | --- |
| Contract | `SemanticDriftRegistry` at [`0x4bBF1Eaa4947686F2291605Caf1DC4e19F55C3C2`](https://explorer-studio.genlayer.com/address/0x4bBF1Eaa4947686F2291605Caf1DC4e19F55C3C2) |
| Network | GenLayer Studio / Studionet, chain ID `61999`, API `https://studio.genlayer.com/api` |
| Protocol | `get_protocol_version()` returns `PolicyDrift-V1.1-Studio` |
| Source | [`contracts/semantic_drift_registry.py`](contracts/semantic_drift_registry.py) |
| Tests | [`contract-tests/test_protocol.py`](contract-tests/test_protocol.py), 18 protocol tests |

The copied module's opening docstring retains its historical “V1” wording. The actual `PROTOCOL_VERSION` constant and deployed `get_protocol_version()` result above identify this unchanged source as V1.1.

## 2. Contract responsibilities

`register_watch(source_url, target_question)` validates one public HTTPS policy source and a focused normative question, verifies the target and extracts a structured Semantic State through GenLayer consensus, and appends the initial Baseline. `check_drift(watch_id)` re-evaluates the same registered URL and question against the active Baseline. It compares `presence`, `disposition`, `conditions`, `scope`, `exceptions` and `quantitative_terms`, computes a deterministic verdict and flag mask, and increments the check count. A distinct semantic result appends an Observation; an identical consecutive fingerprint reuses the last Observation while still incrementing the check count. Neither path overwrites earlier history.

`adopt_observation(watch_id, observation_id)` is a separate owner-only write that can append a new active Baseline from an eligible, latest, material Observation. The official Demo did not call it; Watches #3/#4/#5 retain Baseline V1 IDs 3/4/5. The three methods above are the actual `@gl.public.write` methods. Viewing the demo does not call any of them.

## 3. Client queries and read methods

[`src/lib/studio.ts`](src/lib/studio.ts) defines the single `CONTRACT_ADDRESS`, `STUDIO_CHAIN_ID`, and `STUDIO_API`, checks the installed `studionet` definition, and creates the `genlayer-js@1.1.8` client. Its shared reader in [`src/lib/rpc.ts`](src/lib/rpc.ts) uses `reader.readContract` at that address with `TransactionHashVariant.LATEST_FINAL` and `jsonSafeReturn: true`. The actual `@gl.public.view` methods in the copied contract are:

| Contract method | Client wrapper | Use in product |
| --- | --- | --- |
| `get_protocol_version()` | `protocolVersion()` | Dashboard registry version. |
| `get_watch_count()` | `watchCount()` | Dashboard Watch list and metrics. |
| `get_watch(watch_id)` | `getWatch(id)` | Watch owner, URL, target, active Baseline ID, counts and latest Observation ID. |
| `get_active_baseline(watch_id)` | `getActiveBaseline(id)` | Current active Baseline card. |
| `get_baseline(baseline_id)` | `getBaseline(id)` | Baseline snapshots for comparison and history. |
| `get_observation(observation_id)` | `getObservation(id)` | Latest Current card, verdict, evidence, flags and history. |
| `get_watch_baseline_ids(watch_id)` | `getBaselineIds(id)` | Baseline history IDs, followed by `get_baseline`. |
| `get_watch_observation_ids(watch_id)` | `getObservationIds(id)` | Observation history IDs, followed by `get_observation`. |

The contract has no separate comparison query. [`src/pages/WatchDetail.tsx`](src/pages/WatchDetail.tsx) reads the latest Observation and its `baseline_id`, loads that Baseline, and renders `Baseline vs Current` and `Semantic History` from returned records. [`src/pages/Dashboard.tsx`](src/pages/Dashboard.tsx) reads the count, Watches, Observation IDs and records; [`src/pages/CreateWatch.tsx`](src/pages/CreateWatch.tsx) calls the real `register_watch` write only on form submission and reads the active Baseline on success. [`src/pages/DebugPage.tsx`](src/pages/DebugPage.tsx) uses the same shared SDK configuration. [`src/lib/semantic.ts`](src/lib/semantic.ts) decodes numeric enums and the contract-produced flag mask for display; [`src/App.tsx`](src/App.tsx) provides routes and displays the same chain ID/address in the footer.

Existing Watch detail and Dashboard records are read from the deployed contract, not hard-coded finalized demo data or a private verdict database. The checked-in [`public/demo/policy.html`](public/demo/policy.html) is the public V2 **source document being monitored**, not a mock result store. [`public/demo/validation-policy.html`](public/demo/validation-policy.html) is a separate frozen validation source.

The UI calls `writeAndFinalize()` in `src/lib/studio.ts` for `register_watch`, `check_drift` and eligible owner-only `adopt_observation`. That wrapper submits once through the injected wallet, then polls status and waits for `FINALIZED`. Only read operations can automatically retry; no signature or transaction submission is retried, including a second SDK ABI-fallback submission. Uncertain submission/status retrieval produces manual Explorer-inspection guidance, with the hash when available. Receipt consensus/execution classification is unchanged; this update does not claim to reconcile every historical receipt display discrepancy. The official finalized proof Watches are read-only for this review.

[`src/lib/rpc.ts`](src/lib/rpc.ts) allowlists these eight view methods, limits contract reads to two concurrent operations, and retries only transient reads at most four times. [`src/lib/dashboard.ts`](src/lib/dashboard.ts) stages Watch reads and retains last-known-good data through a failed refresh. [`src/lib/errors.ts`](src/lib/errors.ts) separates transport, contract, network, rejection and capability errors and keeps raw technical diagnostics. [`src/lib/wallet.ts`](src/lib/wallet.ts) selects the official SDK Snap path for supported MetaMask providers, or verified generic EIP-1193 network/account routing. `accountsChanged` and `chainChanged` update connection state; public reads remain independent of wallet availability.

## 4. Nondeterministic execution and consensus

```text
Public policy URL + focused normative question
  → GenLayer nondeterministic Web Access (`gl.nondet.web.get`)
  → nondeterministic structured extraction (`gl.nondet.exec_prompt`)
  → leader proposal / independent validator retrieval and extraction
  → exact Consensus Critical Vector and evidence checks
  → accepted structured Semantic State and ordered delta relations
  → deterministic `_drift_engine` verdict and flags
  → append-only Baseline or Observation/Watch metadata update
```

`_consensus_target_validity` independently verifies that a registration question is a valid normative target. `_consensus_extract` calls `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)`: the validator re-fetches the URL and independently evaluates it. `_parse_extraction` rejects invalid schema/enums and inconsistent states. `_validate_independent` compares the exact critical vector—source status, presence and disposition, plus the ordered condition/scope/exception/quantitative relations for a drift check—and anchors a positive leader excerpt in independently retrieved source text. `_compare_semantic_payload` permits only constrained material equivalence of noncritical field wording. It cannot set the verdict or flags. `AMBIGUOUS`, malformed output, wrong critical fields, and materially different states do not become accepted by that comparison.

The accepted payload is subsequently passed to `_drift_engine`, which is ordinary deterministic contract code. The LLM does not freely choose `MATERIAL_DRIFT`, `NO_MATERIAL_DRIFT`, or a flag bit. Unavailable or oversized source content produces `UNVERIFIABLE`, not a fabricated disappearance. The stored state and evidence describe an observation at check time, not a legal determination or a guarantee that a source serves identical bytes to every reader.

## 5. Baseline → Observation → classification → history

The public [official V2 policy](https://halihalibt.github.io/policydrift/demo/policy.html) followed V1 Baseline establishment at the same URL. Each official Watch has exactly one finalized check and one Observation, without Baseline adoption:

| Watch | V1 active Baseline | V2 Current Observation | Deterministic result | Finalized check |
| --- | --- | --- | --- | --- |
| [#3](https://halihalibt.github.io/policydrift/#/watch/3), commercial use | ID 3; `PRESENT / ALLOWED`; condition `attribution is displayed` | `PRESENT / ALLOWED`; condition `prior written approval` | `MATERIAL_DRIFT + CONDITION_CHANGED` | [Explorer](https://explorer-studio.genlayer.com/tx/0x70aa98f64f9327d73a118a5aec3d9bc73f4dfca1f6f736d5ee2dc8db54e0bdb8) |
| [#4](https://halihalibt.github.io/policydrift/#/watch/4), independent redistribution | ID 4; `PRESENT / PROHIBITED` | `PRESENT / PROHIBITED`; materially unchanged | `NO_MATERIAL_DRIFT`, no material flags | [Explorer](https://explorer-studio.genlayer.com/tx/0xf2fdc2916a983487ce0b94d501ad892146fed9b2fc68047378960c18a5fcdcb7) |
| [#5](https://halihalibt.github.io/policydrift/#/watch/5), AI model training | ID 5; `NOT_STATED / NONE` | `PRESENT / PROHIBITED`; source says `API data may not be used for AI model training.` | `MATERIAL_DRIFT + RULE_APPEARED` | [Explorer](https://explorer-studio.genlayer.com/tx/0xb71d2f743f88c28983773b88f9c030b5421d4121c49a8ef960cc2e2926d524b6) |

`check_drift` stores the Observation against the Baseline ID used for that check. The Watch retains its active Baseline pointer and updates `last_observation_id`, `check_count` and `observation_count`; the Baseline and Observation ID lists preserve the append-only history. Watch Detail loads those IDs and records to render the same historical chain state.

## 6. Presence Transition handling in V1.1

For a definite `NOT_STATED → PRESENT` or `PRESENT → NOT_STATED` transition with an available source, `_parse_extraction` canonicalizes globally known, non-ambiguous delta relations to `NOT_APPLICABLE` before the exact validator critical-vector comparison. It preserves an `AMBIGUOUS` relation, so ambiguity is not accepted as a definite change. After consensus, `_drift_engine` deterministically returns `MATERIAL_DRIFT + RULE_APPEARED` or `MATERIAL_DRIFT + RULE_DISAPPEARED` respectively. This normalization does not relax schema, presence, disposition, quote anchoring or material-equivalence rejection. Watch #5 proves the appearance direction in the official Demo; the reverse direction was separately finalized on the same V1.1 contract in isolated validation.

## 7. Security and review boundaries

- Baseline and Observation histories are append-only; an eligible owner adoption appends a new Baseline and changes the active pointer rather than rewriting prior records. No official Demo adoption occurred.
- Independent validator retrieval, strict parsing, exact critical-vector comparison and positive evidence anchoring constrain nondeterministic extraction; deterministic contract code computes drift classification.
- A public, stable, single-URL policy and focused question are protocol assumptions. `NOT_STATED` is weaker negative evidence than an anchored positive quote. Dynamic/personalized source content and source equivocation are residual limitations.
- The frontend requests latest-final contract reads and presents stored states. Transient read failures are retried safely; exhausted retries produce actionable errors while Debug preserves the underlying details. A frontend transaction-status retrieval anomaly is distinct from finalized Registry and Explorer outcomes; no Studio-node root cause is asserted. Submissions are never automatically repeated.
- The copied source and tests are for repository reviewability. They do not change the already deployed address, contract semantics, public policy, validation source or on-chain state. The frontend reliability changes retain `genlayer-js@1.1.8` and the same network configuration; they change read scheduling/error handling and wallet connection routing only.

Run the copied protocol tests from the Projects root with `python -m unittest discover -s contract-tests -v`. The tests simulate the GenLayer host boundary and do not themselves prove live consensus; the three linked finalized Studio transactions provide live execution evidence. Run the product checks with `npm test`, `npm run lint` and `npm run build`.
