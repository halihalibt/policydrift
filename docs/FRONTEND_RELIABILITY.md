# Frontend reliability validation — candidate V3

## Scope and release gate

This increment is **candidate V2 → candidate V3**, not a patch against the old Git HEAD. Apply it only after the V1 candidate and the V2 incremental patch (V2 SHA-256 `998e14b13564c1288120425cd15764ada38415ffae7466b3bff0a324271985af`). No commit, push, Pages deployment, Portal action, live wallet connection, signature or transaction was performed. Windows production-preview acceptance remains pending.

The contract, deployment address `0x4bBF1Eaa4947686F2291605Caf1DC4e19F55C3C2`, Studionet 61999 / `https://studio.genlayer.com/api`, SDK 1.1.8, official V2 policy, validation source and on-chain state are frozen. Wallet routing and transaction submission/polling implementation are byte-identical to V2. The shared error classifier now recognizes rate limiting separately; this does not authorize or introduce a transaction resend.

## Root cause evidence

**Confirmed by the user's Windows production-preview Chrome Network trace:** a Dashboard `gen_call`, `type: read`, to the V1.1 contract received HTTP 429 Too Many Requests, `Retry-After: 10`, standard bucket, limit 30, remaining 0, reset 10 and minute window. The frontend can exhaust the Studio API rate-limit bucket while loading/recovering the Dashboard. This is not evidence of a Studio node outage. The trace does not establish all other users of that bucket or every earlier error's cause.

SDK 1.1.8's `getCustomTransportConfig` parses JSON without checking HTTP status or retaining headers. Previously, 429 belonged to ordinary transient retry, and each Dashboard load traversed all Observation history. Repeated reads/recovery could amplify pressure on an exhausted bucket. The new scoped view transport preserves HTTP status and exposed headers, while using the pinned SDK ABI encoding and the same `gen_call` wire parameters. Automated parity tests compare its request/result with SDK 1.1.8. It is not used for signatures or transaction submission.

## Read gateway and cooldown

- The eight existing view methods are allowlisted. Calls use `LATEST_FINAL`, `type: read`, zero sender, SDK ABI serialization and JSON-safe decoded values. The HTTP boundary rejects any other method before fetch. It has a 12-second fetch timeout and accepts Dashboard cancellation signals.
- Explicit HTTP/nested RPC 429 or an explicit rate-limit-exceeded error is `RATE_LIMITED`. Contract reverts/invalid arguments still take priority. Generic unknown RPC errors are not assumed to be 429.
- `RATE_LIMITED` stops the individual read immediately: no 250/500/1000 ms retry. The single shared view scheduler pauses every queued view, honors Retry-After seconds/date, then reset information, or falls back to 12 seconds if metadata is hidden/lost. Browser CORS may hide headers even when DevTools shows them; HTTP status remains usable.
- One physical read at a time, minimum 350 ms spacing and a conservative client policy of at most 18 attempts in a rolling 60 seconds. Failed attempts count. An exposed lower server limit further reduces the budget; exposed remaining=0 delays further reads. These are frontend safeguards, not a claim that Studio always has a 30/minute protocol limit. Other applications/tabs can still consume a shared upstream bucket.
- Cooldown and recent attempts persist in sessionStorage for the same network/address. Hard reload, queued reads and manual Refresh cannot reset or bypass that gate. All waiting jobs share one timer; only one queued read resumes first, with subsequent reads paced. A further 429 extends the same cooldown. Aborting queued Dashboard reads removes them and cancels an unused gate timer.
- Non-rate-limit transient failures retain four bounded attempts with 250/500/1000 ms + small jitter. Every actual view attempt enters the shared gate. Deterministic/unknown errors do not receive blind retries.

## Dashboard critical path and progressive rendering

V2 read-count formula for valid histories: **2 + 2W + H**, where W is all Watches and H is the sum of distinct Observation IDs fetched. If a last Observation were missing from its history ID list, the old code made an extra fallback fetch.

V3 core formula: **2 + V + L**, where V = min(W, 5) recent Watches and L is the number of those Watches with a nonzero last Observation ID. Thus the no-failure initial path is **at most 12 view calls**, regardless of older history size. A controlled five-Watch fixture with one Observation per Watch is exactly **17 → 12 calls**. For only three one-Observation Watches, it is **11 → 8**. These are audited/tested counts; no claim is made that an unmeasured live registry has a particular total history size.

- Protocol and Watch count precede the five newest Watch records; only their latest Observation is fetched. Each question and active Baseline version/ID can render before its latest result finishes. Pending result is `LOADING`, not an invented `NOT_CHECKED`.
- Older Watches remain accessible through their existing detail URLs; the Dashboard explicitly says how many recent Watches it shows. Metrics for a visible subset are labelled as such.
- Semantic Changes initially shows **—**, not zero or a fabricated count. The optional **Load semantic metrics** action loads history after core rendering, de-duplicates IDs and reuses the already read latest Observation. One enrichment failure leaves its metric unknown and never fails/discards the core list. A 429 stops further enrichment, leaving the shared gate in cooldown.
- The full-load recovery controller reuses successful views only within that cycle. After a failed later read it does not re-fetch every successful protocol/count/Watch/Observation. A transient latest-result failure still enters automatic recovery; the question already rendered remains visible.
- Ordinary transient recovery is bounded at six attempts with the existing 2/3/4/5/6-second waits and an active 30-second deadline. A rate limit replaces that timer with the server/client gate wait and at most three controlled resumptions after the first failed attempt. Budget/cooldown waits do not trigger a false 30-second fatal while the gate is intentionally paused. The scheduler itself does not resend a failed operation.
- Generation identity, cancellation signals and timer cleanup prevent replacement/unmount/StrictMode cycles from publishing stale results or issuing cancelled queued reads. Manual Refresh cancels both pending recovery and initial deferred-cache-revalidation timers. An already running cancelled fetch is aborted by the scoped view transport.

## Honest short-lived cache

A completed snapshot is saved in sessionStorage under a schema/network/address-specific key with its completion timestamp. TTL is **60 seconds**. A new page can immediately show a valid snapshot, explicitly labelled **Cached snapshot / Last synced**, while scheduling live revalidation. Very recent snapshots defer revalidation until 30 seconds after the last completed sync, reducing repeated hard-refresh bursts. An explicit Refresh can request revalidation sooner, but still obeys the shared read gate.

Expired, future, malformed, partial or different-deployment snapshots are not restored. Last-known-good rows remain visible during recovery. A persistent failure is actionable; with retained rows it is a non-destructive warning, not a blank Dashboard. No promise is made that upstream failures can never occur. Cache contains read-only UI data, is not a chain authority, and is not imported by Watch Detail write/adopt/check or submission code. Those paths continue to read actual chain state and require explicit wallet actions.

## Automated validation

```bash
npm test
npm run lint
npm run build
python -B -m unittest discover -s contract-tests -v
```

**86/86 frontend tests**: the original 7 product tests, V1's 26 reliability cases, V2's 14 controller and 12 DOM cases, plus 23 rate-limit/cache/progressive-core cases and 4 DOM cases. Existing assertions were adapted to intentional single concurrency, lazy metrics, reduced call counts, modern Response mocks and a coherent fake clock. No coverage or protocol expected outcome was removed. Wallet/provider and transaction safety regressions still pass.

**18/18 protocol tests**, lint (zero warnings/errors), production build and diff checks pass. Vite still reports its pre-existing large-chunk advisory; no bundle-size redesign was included. Contract SHA-256 remains `3a7ef302bf57b4c9ee7e8993dd7aac2496c4272faa168f61368af219d657e3d4`.

DOM tests run the real React pages, pinned ABI and read transport with synthetic HTTP/provider responses and virtual timers. They cover neutral 429 cooldown/recovery, persisted cache through hard-reload simulation, manual supersession, automatic deferred revalidation, optional metric failure, StrictMode, comparisons/history without wallet and unchanged wallet compatibility. They are not real Windows/browser or finalized-chain evidence.

## Remaining Windows acceptance

1. In `E:\policydrift` with candidates V1 and V2 already applied, run `git apply --check` on the V2 → V3 incremental patch, then apply it. Run all commands above.
2. Build, then `npm run preview -- --host 127.0.0.1`. Perform at least ten cold/hard refresh trials without manual Dashboard Refresh or wallet connection. Record elapsed recovery time and whether the data was cached or newly read. Cache may render immediately; wait for **Cached snapshot** to clear and for the new sync timestamp when testing revalidation.
3. To test genuinely empty-cache initial load, remove only the Dashboard snapshot key; **do not remove the read-budget/cooldown key**, since that would deliberately bypass the safeguard. Test the expired-cache case after its TTL as well.
4. Preserve DevTools status, exposed Retry-After/reset and request timestamps for a real 429. During cooldown, confirm there are no rapid retry reads; recovery should happen automatically. Requests from other tabs/tools share the upstream budget and should be accounted for separately.
5. Read #3/#4/#5, Baseline vs Current and Semantic History only. Do not create Watch, CHECK NOW, ADOPT, connect/sign or send a transaction. Stop for user acceptance; no commit/push/deployment/Portal step is authorized yet.
