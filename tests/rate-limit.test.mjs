import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createClient, abi } from 'genlayer-js'
import { studionet } from 'genlayer-js/chains'
import { TransactionHashVariant } from 'genlayer-js/types'
import { readFileSync } from 'node:fs'
import { classifyError, rateLimitDelay, technicalError } from '../src/lib/errors.ts'
import { retryTransientRead, createContractReader } from '../src/lib/rpc.ts'
import { createReadScheduler } from '../src/lib/read-scheduler.ts'
import { createHttpViewClient } from '../src/lib/read-transport.ts'
import { loadDashboard, enrichDashboard, createDashboardRecovery, retainedLoad } from '../src/lib/dashboard.ts'
import { createDashboardCache, DASHBOARD_CACHE_TTL_MS } from '../src/lib/dashboard-cache.ts'
const address = '0x' + '1'.repeat(40)
const limited = (seconds = 10) => ({ status: 429, headers: { 'retry-after': String(seconds) } })
const flush = async () => { for (let i = 0; i < 140; i++) await Promise.resolve() }
class Clock {
  time = 0; next = 0; jobs = new Map()
  now = () => this.time
  schedule = (fn, ms) => { const id = ++this.next; this.jobs.set(id, { at: this.time + ms, fn }); return () => this.jobs.delete(id) }
  async advance(ms) {
    const end = this.time + ms; await flush()
    while (true) {
      const next = [...this.jobs].filter(([, j]) => j.at <= end).sort((a,b) => a[1].at-b[1].at || a[0]-b[0])[0]
      if (!next) break
      this.jobs.delete(next[0]); this.time = next[1].at; next[1].fn(); await flush()
    }
    this.time = end; await flush()
  }
}
function storage() { const map = new Map(); return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) } }
const watch = id => ({ owner: address, source_url: 'https://example.test/policy', target_question: `Question ${id}`, active_baseline_id: id,
  baseline_version: 1, created_at: id, last_check_at: id, baseline_count: 1, observation_count: 1, check_count: 1, last_observation_id: id, last_observation_fingerprint: 'fixture' })
function reads(count = 5) { return { protocolVersion: async () => 'PolicyDrift-V1.1-Studio', watchCount: async () => count,
  getWatch: async id => watch(id), getObservationIds: async id => [id], getObservation: async id => ({ watch_id: id, verdict: id === 4 ? 1 : 2 }) } }
function ui(input, clock, data) {
  let state = { loading: false, error: '', data }; const actions = []
  const recovery = createDashboardRecovery(input, action => { actions.push(action); state = retainedLoad(state, action) }, clock)
  return { recovery, actions, get state() { return state } }
}

test('HTTP/nested transport 429 has its own RATE_LIMITED class; deterministic reverts still win', () => {
  assert.equal(classifyError({ cause: { response: { status: 429 } } }), 'RATE_LIMITED')
  assert.equal(classifyError(new Error('HTTP 429 Too Many Requests')), 'RATE_LIMITED')
  assert.equal(classifyError({ code: -32005, message: 'rate limit exceeded' }), 'RATE_LIMITED')
  assert.equal(classifyError({ status: 429, cause: { message: 'PD003 WATCH_NOT_FOUND' } }), 'CONTRACT_ERROR')
})
test('Retry-After seconds/date, reset metadata, hidden-header fallback retain conservative delays', () => {
  assert.equal(rateLimitDelay(limited()), 10_000)
  assert.equal(rateLimitDelay({ response: { headers: new Headers({ 'Retry-After': 'Thu, 01 Jan 1970 00:00:20 GMT' }) } }, 5000), 15_000)
  assert.equal(rateLimitDelay({ headers: { 'X-Ratelimit-Reset': '10' } }), 10_000)
  assert.equal(rateLimitDelay({ status: 429 }), 12_000)
})
test('429 never enters the per-read 250/500/1000ms exponential retry', async () => {
  let calls = 0; const waits = []
  await assert.rejects(retryTransientRead(async () => { calls++; throw limited() }, 'view', { sleep: async ms => waits.push(ms) }))
  assert.equal(calls, 1); assert.deepEqual(waits, [])
})
test('shared queue honors Retry-After and holds all pending reads behind one timer', async () => {
  const clock = new Clock(), scheduler = createReadScheduler({ clock }); const events = []
  await assert.rejects(scheduler.run(async () => { events.push(clock.time); throw limited() }))
  const a = scheduler.run(async () => { events.push(clock.time); return 1 }), b = scheduler.run(async () => { events.push(clock.time); return 2 })
  assert.equal(clock.jobs.size, 1); await clock.advance(9999); assert.deepEqual(events, [0])
  await clock.advance(1); assert.equal(await a, 1); assert.deepEqual(events, [0, 10_000]); assert.equal(clock.jobs.size, 1)
  await clock.advance(350); assert.equal(await b, 2); assert.deepEqual(events, [0, 10_000, 10_350]); assert.equal(clock.jobs.size, 0)
})
test('another 429 at resumption extends one cooldown, never releases a parallel probe storm', async () => {
  const clock = new Clock(), scheduler = createReadScheduler({ clock }); let calls = 0
  const operation = async () => { calls++; throw limited() }
  await assert.rejects(scheduler.run(operation))
  const probe = assert.rejects(scheduler.run(operation)), pending = scheduler.run(async () => { calls++; return 'ok' })
  await clock.advance(10_000); await probe; assert.equal(calls, 2)
  await clock.advance(9999); assert.equal(calls, 2); await clock.advance(1); assert.equal(await pending, 'ok'); assert.equal(calls, 3)
})
test('conservative rolling budget bounds attempts, including failed reads; exposed lower limit updates it', async () => {
  const clock = new Clock(), scheduler = createReadScheduler({ clock, budget: 2, spacingMs: 0 }); let calls = 0
  await scheduler.run(async () => calls++); await scheduler.run(async () => calls++)
  const third = scheduler.run(async () => calls++)
  await clock.advance(59_999); assert.equal(calls, 2); await clock.advance(1); await third; assert.equal(calls, 3)
  const small = createReadScheduler({ clock, spacingMs: 0 })
  small.observeHeaders(new Headers({ 'X-Ratelimit-Limit': '2' }))
  await small.run(async () => 1); const next = small.run(async () => 2)
  await clock.advance(59_999); assert.equal(clock.jobs.size, 1); await clock.advance(1); assert.equal(await next, 2)
})
test('cooldown and request budget persist across scheduler hard-reload simulation', async () => {
  const clock = new Clock(), store = storage(), options = { clock, storage: () => store, spacingMs: 0 }
  await assert.rejects(createReadScheduler(options).run(async () => { throw limited() }))
  const next = createReadScheduler(options); let calls = 0
  const pending = next.run(async () => ++calls); await clock.advance(9999); assert.equal(calls, 0)
  await clock.advance(1); assert.equal(await pending, 1)
})
test('aborting queued reads clears the shared wait timer and never starts a cancelled operation', async () => {
  const clock = new Clock(), scheduler = createReadScheduler({ clock }); let calls = 0
  await assert.rejects(scheduler.run(async () => { throw limited() }))
  const controller = new AbortController(), pending = scheduler.run(async () => { calls++; return 1 }, controller.signal)
  controller.abort(); await assert.rejects(pending); assert.equal(clock.jobs.size, 0)
  await clock.advance(60_000); assert.equal(calls, 0)
})
test('HTTP boundary sees 429 even when response body is HTML and SDK would lose headers', async () => {
  const scheduler = createReadScheduler(), client = createHttpViewClient(studionet.rpcUrls.default.http[0], scheduler,
    async () => new Response('<html>Too Many Requests</html>', { status: 429, headers: { 'Retry-After': '10' } }))
  await assert.rejects(client.readContract({ address, functionName: 'get_watch_count', args: [], transactionHashVariant: TransactionHashVariant.LATEST_FINAL, jsonSafeReturn: true }), error => {
    assert.equal(classifyError(error), 'RATE_LIMITED'); assert.equal(rateLimitDelay(error), 10_000); assert.match(technicalError(error), /retry-after/); return true
  })
})
test('scoped view transport matches pinned SDK gen_call payload and JSON-safe results', async () => {
  const old = globalThis.fetch, payloads = [], value = { count: 7n, huge: 9007199254740992n, rows: [{ name: 'watch', id: 3n }], raw: new Uint8Array([1,2]) }
  globalThis.fetch = async (_url, options) => { payloads.push(JSON.parse(options.body)); return Response.json({ result: Buffer.from(abi.calldata.encode(value)).toString('hex') }) }
  try {
    const params = { address, functionName: 'get_watch', args: [3], transactionHashVariant: TransactionHashVariant.LATEST_FINAL, jsonSafeReturn: true }
    const sdk = await createClient({ chain: studionet }).readContract(params)
    const result = await createHttpViewClient(studionet.rpcUrls.default.http[0], createReadScheduler()).readContract(params)
    assert.deepEqual(result, sdk); assert.deepEqual(payloads[1].params, payloads[0].params); assert.equal(payloads[1].method, 'gen_call'); assert.equal(payloads[1].params[0].type, 'read')
  } finally { globalThis.fetch = old }
})
test('initial critical path is <=12 calls even with hundreds of Watches and histories', async () => {
  const calls = [], input = reads(100)
  for (const key of ['protocolVersion','watchCount','getWatch','getObservation']) { const original = input[key]; input[key] = async (...args) => { calls.push([key,...args]); return original(...args) } }
  input.getObservationIds = async () => { throw new Error('History must not enter the initial path') }
  const data = await loadDashboard(input)
  assert.equal(calls.length, 12); assert.deepEqual(data.rows.map(r => r.id), [100,99,98,97,96]); assert.ok(data.rows.every(row => row.semanticChanges === undefined))
})
test('Watch question/baseline render progressively before latest Observation finishes', async () => {
  let release; const updates = [], input = reads(1)
  input.getObservation = () => new Promise(resolve => { release = resolve })
  const pending = loadDashboard(input, undefined, data => updates.push(data)); await flush()
  assert.equal(updates.length, 1); assert.equal(updates[0].rows[0].watch.active_baseline_id, 1); assert.equal(updates[0].rows[0].latestPending, true)
  release({ watch_id: 1, verdict: 2 }); const data = await pending; assert.equal(data.rows[0].latest.verdict, 2)
})
test('history enrichment is optional/nonblocking and one failure does not discard the core list', async () => {
  const input = reads(2), core = await loadDashboard(input); let ids = 0, observations = 0
  input.getObservationIds = async id => { ids++; if (id === 2) throw { status: 503 }; return [id,id] }
  input.getObservation = async () => { observations++; throw new Error('Latest must be reused') }
  const data = await enrichDashboard(core, input)
  assert.equal(ids, 2); assert.equal(observations, 0); assert.equal(data.rows.length, 2); assert.equal(data.rows[0].semanticChanges, undefined); assert.equal(data.rows[1].semanticChanges, 1)
  assert.equal(core.rows[1].semanticChanges, undefined)
})
test('rate-limited optional history stops further enrichment without failing core Watches', async () => {
  const input = reads(5), core = await loadDashboard(input); let calls = 0
  input.getObservationIds = async () => { calls++; throw limited() }
  const data = await enrichDashboard(core, input); assert.equal(calls, 1); assert.equal(data.rows.length, 5); assert.equal(data.rows[0].latest.verdict, 2)
})
test('last-known-good session snapshot survives reload, is timestamped/cached and revalidates', async () => {
  const clock = new Clock(), store = storage(), cache = createDashboardCache('deployment-specific', () => store, clock.now)
  const data = await loadDashboard(reads(1)); cache.save(data)
  const cached = createDashboardCache('deployment-specific', () => store, clock.now).read()
  assert.equal(cached.cached, true); assert.equal(cached.syncedAt, 0)
  const state = ui(reads(1), clock, cached); state.recovery.start(); await clock.advance(0)
  assert.equal(state.state.data.cached, false); assert.equal(state.state.loading, false)
})
test('expired, future, malformed, partial and foreign-deployment cache do not masquerade as fresh data', async () => {
  const clock = new Clock(), store = storage(), cache = createDashboardCache('contract-a', () => store, clock.now), data = await loadDashboard(reads(1))
  cache.save(data); await clock.advance(DASHBOARD_CACHE_TTL_MS); assert.equal(cache.read(), undefined)
  store.setItem('contract-a', '{bad json'); assert.equal(cache.read(), undefined)
  store.removeItem('contract-a'); cache.save({ ...data, partial: true }); assert.equal(cache.read(), undefined)
  cache.save({ ...data, syncedAt: clock.now() + 1000 }); assert.equal(cache.read(), undefined)
  cache.save(data); assert.equal(createDashboardCache('contract-b', () => store, clock.now).read(), undefined)
})
test('Dashboard 429 suspends V2 short recovery timers and resumes exactly once after server cooldown', async () => {
  const clock = new Clock(), input = reads(0); let calls = 0
  input.protocolVersion = async () => { if (++calls === 1) throw limited(); return 'V1.1' }
  const state = ui(input, clock); state.recovery.start(); await clock.advance(9999)
  assert.equal(calls, 1); assert.equal(state.state.error, ''); assert.equal(state.state.rateLimited, true)
  await clock.advance(1); assert.equal(calls, 2); assert.equal(state.state.loading, false); assert.equal(clock.jobs.size, 0)
})
test('manual Refresh cannot bypass cooldown or create parallel recovery loops', async () => {
  const clock = new Clock(), scheduler = createReadScheduler({ clock, spacingMs: 0 }); let calls = 0
  const read = createContractReader({ readContract: async ({ functionName }) => { calls++; if (calls === 1) throw limited(); return functionName === 'get_watch_count' ? 0 : 'V1.1' } }, address, { scheduler })
  const state = ui({ ...reads(0), protocolVersion: signal => read('get_protocol_version', [], signal), watchCount: signal => read('get_watch_count', [], signal), waitMs: scheduler.remaining }, clock)
  state.recovery.start(); await clock.advance(0); state.recovery.start(); await clock.advance(100); state.recovery.start(); await clock.advance(9899)
  assert.equal(calls, 1); assert.equal(state.state.error, '')
  await clock.advance(1); assert.equal(calls, 3); assert.equal(state.actions.filter(a => a.type === 'success').length, 1); assert.equal(clock.jobs.size, 0)
})
test('successful core reads are reused within a 429 recovery instead of amplified by full reload', async () => {
  const clock = new Clock(), input = reads(2), counts = {}; let failed = false
  for (const key of ['protocolVersion','watchCount','getWatch']) { const original = input[key]; input[key] = async (...args) => { const k = key + (typeof args[0] === 'number' ? args[0] : ''); counts[k] = (counts[k] ?? 0)+1; return original(...args) } }
  input.getObservation = async id => { if (!failed) { failed = true; throw limited() }; return { watch_id: id, verdict: 2 } }
  const state = ui(input, clock); state.recovery.start(); await clock.advance(10_000)
  assert.equal(counts.protocolVersion, 1); assert.equal(counts.watchCount, 1); assert.equal(counts.getWatch2, 1); assert.equal(state.state.data.rows.length, 2)
})
test('rate-limited recovery is finite; retained data survives all attempts and terminal warning', async () => {
  const clock = new Clock(), previous = await loadDashboard(reads(1)), input = reads(0); let calls = 0
  input.protocolVersion = async () => { calls++; throw limited() }
  const state = ui(input, clock, previous); state.recovery.start(); await clock.advance(29_999)
  assert.equal(state.state.data, previous); assert.equal(state.state.error, ''); await clock.advance(1)
  assert.equal(calls, 4); assert.match(state.state.error, /rate-limiting/); assert.equal(state.state.data, previous); assert.equal(clock.jobs.size, 0)
  await clock.advance(100_000); assert.equal(calls, 4)
})
test('budget wait is respected before initial load and does not trigger a 30-second false fatal', async () => {
  const clock = new Clock(), scheduler = createReadScheduler({ clock, budget: 1, spacingMs: 0 })
  await scheduler.run(async () => 1)
  const state = ui({ ...reads(0), protocolVersion: signal => scheduler.run(async () => 'V1.1', signal), waitMs: scheduler.remaining }, clock)
  state.recovery.start(); await clock.advance(59_999); assert.equal(state.state.error, ''); assert.equal(state.state.loading, true)
  await clock.advance(1); assert.equal(state.state.loading, false); assert.equal(state.state.data.version, 'V1.1')
})
test('write/signature methods cannot use the view gateway or Dashboard cache/recovery', async () => {
  let calls = 0
  const client = createHttpViewClient(studionet.rpcUrls.default.http[0], createReadScheduler(), async () => { calls++; throw new Error('Unexpected fetch') })
  const read = createContractReader(client, address)
  for (const method of ['register_watch','check_drift','adopt_observation','eth_sendTransaction','personal_sign']) await assert.rejects(read(method), /allowlisted/)
  assert.equal(calls, 0)
  const source = readFileSync(new URL('../src/lib/studio.ts', import.meta.url), 'utf8')
  const writes = source.slice(source.indexOf('export type WriteMethod'))
  assert.doesNotMatch(writes, /viewScheduler|dashboard-cache|createContractReader|\.read\(/)
})

test('latest Observation transient exhaustion still enters automatic recovery, retaining progressive Watch data', async () => {
  const clock = new Clock(), input = reads(1); let calls = 0, watches = 0
  input.getWatch = async id => { watches++; return watch(id) }
  input.getObservation = async id => { if (++calls === 1) throw { status: 503 }; return { watch_id: id, verdict: 2 } }
  const state = ui(input, clock); state.recovery.start(); await clock.advance(0)
  assert.equal(state.state.data.rows[0].watch.target_question, 'Question 1'); assert.equal(state.state.error, '')
  await clock.advance(2000); assert.equal(state.state.data.rows[0].latest.verdict, 2); assert.equal(watches, 1); assert.equal(calls, 2)
})
