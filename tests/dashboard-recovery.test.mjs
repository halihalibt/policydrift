import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDashboardRecovery, retainedLoad, DASHBOARD_RECOVERY_WINDOW_MS } from '../src/lib/dashboard.ts'
import { createContractReader } from '../src/lib/rpc.ts'
const transient = () => ({ message: 'An unknown RPC error occurred.', cause: { code: -32000 } })
const flush = async () => { for (let i = 0; i < 120; i++) await Promise.resolve() }
class Clock {
  time = 0; next = 0; jobs = new Map()
  now = () => this.time
  schedule = (callback, ms) => {
    const id = ++this.next
    this.jobs.set(id, { due: this.time + ms, callback })
    return () => this.jobs.delete(id)
  }
  async advance(ms) {
    const end = this.time + ms
    await flush()
    while (true) {
      const next = [...this.jobs].filter(([, job]) => job.due <= end).sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0]
      if (!next) break
      const [id, job] = next; this.jobs.delete(id); this.time = job.due; job.callback(); await flush()
    }
    this.time = end; await flush()
  }
}
function reads(version = async () => 'PolicyDrift-V1.1-Studio') {
  return { protocolVersion: version, watchCount: async () => 0,
    getWatch: async () => { throw new Error('unexpected Watch read') }, getObservationIds: async () => [], getObservation: async () => { throw new Error('unexpected Observation read') } }
}
function setup(input, clock, data) {
  let state = { loading: false, error: '', ...(data ? { data } : {}) }; const actions = []
  const recovery = createDashboardRecovery(input, action => { actions.push(action); state = retainedLoad(state, action) }, clock)
  return { recovery, actions, get state() { return state } }
}

test('per-read four-attempt exhaustion automatically retries the whole Dashboard and succeeds', async () => {
  const clock = new Clock(); let calls = 0, writes = 0
  const read = createContractReader({ readContract: async ({ functionName }) => {
    if (++calls <= 4) throw transient()
    return functionName === 'get_protocol_version' ? 'PolicyDrift-V1.1-Studio' : 0
  }, writeContract: () => { writes++ } }, '0x' + '1'.repeat(40), { sleep: ms => new Promise(resolve => clock.schedule(resolve, ms)), random: () => 0 })
  const ui = setup({ ...reads(), protocolVersion: () => read('get_protocol_version'), watchCount: () => read('get_watch_count') }, clock)
  ui.recovery.start(); await clock.advance(1750)
  assert.equal(calls, 4); assert.equal(ui.state.reconnecting, true); assert.equal(ui.state.error, '')
  await clock.advance(1999); assert.equal(calls, 4)
  await clock.advance(1); assert.equal(ui.state.data.version, 'PolicyDrift-V1.1-Studio'); assert.equal(calls, 6); assert.equal(writes, 0); assert.equal(clock.jobs.size, 0)
})
test('several Dashboard failures recover later without a manual Refresh', async () => {
  const clock = new Clock(); let calls = 0
  const ui = setup(reads(async () => { if (++calls <= 3) throw transient(); return 'recovered' }), clock)
  ui.recovery.start(); await clock.advance(9000)
  assert.equal(calls, 4); assert.equal(ui.state.data.version, 'recovered'); assert.equal(ui.actions.filter(a => a.type === 'reconnect').length, 3)
  assert.equal(ui.actions.some(a => a.type === 'failure'), false); assert.equal(clock.jobs.size, 0)
})
test('initial recovery keeps fatal error empty throughout its active window', async () => {
  const clock = new Clock(); const ui = setup(reads(async () => { throw transient() }), clock)
  ui.recovery.start(); await clock.advance(19_999)
  assert.equal(ui.state.loading, true); assert.equal(ui.state.reconnecting, true); assert.equal(ui.state.error, ''); assert.equal(ui.state.data, undefined)
  assert.equal(ui.actions.some(a => a.type === 'failure'), false); ui.recovery.cancel(); assert.equal(clock.jobs.size, 0)
})
test('six failed Dashboard attempts exhaust recovery, show actionable error and stop permanently', async () => {
  const clock = new Clock(); let calls = 0
  const ui = setup(reads(async () => { calls++; throw transient() }), clock)
  ui.recovery.start(); await clock.advance(20_000)
  assert.equal(calls, 6); assert.equal(ui.state.loading, false); assert.equal(ui.state.reconnecting, false)
  assert.equal(ui.state.error, 'Studio RPC is temporarily unavailable. Retry.'); assert.equal(clock.jobs.size, 0)
  await clock.advance(100_000); assert.equal(calls, 6); assert.equal(ui.actions.filter(a => a.type === 'failure').length, 1)
})
test('last-known-good data stays visible during refresh recovery and is replaced only on success', async () => {
  const clock = new Clock(), previous = { version: 'old', count: 0, rows: [] }; let calls = 0
  const ui = setup(reads(async () => { if (++calls <= 2) throw transient(); return 'new' }), clock, previous)
  ui.recovery.start(); await clock.advance(0); assert.equal(ui.state.data, previous); assert.equal(ui.state.error, '')
  await clock.advance(2000); assert.equal(ui.state.data, previous); assert.equal(ui.state.reconnecting, true); assert.equal(ui.state.error, '')
  await clock.advance(3000); assert.equal(ui.state.data.version, 'new'); assert.equal(ui.state.reconnecting, false)
})
test('manual Refresh cancels the old retry timer and starts a fresh recovery generation', async () => {
  const clock = new Clock(); let calls = 0
  const ui = setup(reads(async () => { if (++calls === 1) throw transient(); return 'fresh' }), clock)
  ui.recovery.start(); await clock.advance(1000); ui.recovery.start(); await clock.advance(0)
  assert.equal(ui.state.data.version, 'fresh'); await clock.advance(60_000)
  assert.equal(calls, 2); assert.equal(clock.jobs.size, 0); assert.equal(ui.actions.filter(a => a.type === 'success').length, 1)
})
test('unmount cancellation clears recovery/deadline timers and prevents subsequent updates or loads', async () => {
  const clock = new Clock(); let calls = 0
  const ui = setup(reads(async () => { calls++; throw transient() }), clock)
  ui.recovery.start(); await clock.advance(0); ui.recovery.cancel(); const count = ui.actions.length
  assert.equal(clock.jobs.size, 0); await clock.advance(100_000); assert.equal(calls, 1); assert.equal(ui.actions.length, count)
})
test('StrictMode setup-cleanup-setup never launches two initial or retry loops', async () => {
  const clock = new Clock(); let calls = 0
  const ui = setup(reads(async () => { if (++calls === 1) throw transient(); return 'ok' }), clock)
  ui.recovery.start(); ui.recovery.cancel(); ui.recovery.start(); await clock.advance(2000)
  assert.equal(calls, 2); assert.equal(ui.actions.filter(a => a.type === 'reconnect').length, 1)
  assert.equal(ui.actions.filter(a => a.type === 'success').length, 1); assert.equal(clock.jobs.size, 0)
})
test('Dashboard recovery uses view methods only and cannot invoke supplied write callbacks', async () => {
  const clock = new Clock(); let writes = 0, calls = 0
  const forbidden = () => { writes++; throw new Error('write forbidden') }
  const ui = setup({ ...reads(async () => { if (++calls === 1) throw transient(); return 'ok' }),
    register_watch: forbidden, check_drift: forbidden, adopt_observation: forbidden, writeContract: forbidden, signature: forbidden }, clock)
  ui.recovery.start(); await clock.advance(2000); assert.equal(writes, 0); assert.equal(ui.state.data.version, 'ok')
})
test('contract errors stop immediately instead of entering background retry', async () => {
  const clock = new Clock(); let calls = 0
  const ui = setup(reads(async () => { calls++; throw { message: 'An unknown RPC error occurred.', cause: { message: 'PD003 WATCH_NOT_FOUND' } } }), clock)
  ui.recovery.start(); await clock.advance(0)
  assert.match(ui.state.error, /PD003/); assert.equal(ui.state.loading, false); assert.equal(clock.jobs.size, 0)
  await clock.advance(60_000); assert.equal(calls, 1)
})
test('manual replacement waits for the cancelled in-flight load, then ignores its stale result', async () => {
  const clock = new Clock(); let resolve, calls = 0, counts = 0
  const old = new Promise(r => { resolve = r })
  const input = { ...reads(async () => ++calls === 1 ? old : 'fresh'), watchCount: async () => { counts++; return 0 } }
  const ui = setup(input, clock); ui.recovery.start(); await clock.advance(0)
  ui.recovery.start(); await clock.advance(0); assert.equal(calls, 1)
  resolve('stale'); await flush()
  assert.equal(calls, 2); assert.equal(counts, 1); assert.equal(ui.state.data.version, 'fresh'); assert.equal(ui.actions.filter(a => a.type === 'success').length, 1)
})
test('30-second deadline stops a stalled cycle and ignores its late successful result', async () => {
  const clock = new Clock(); let resolve, calls = 0, counts = 0
  const input = { ...reads(async () => { calls++; return new Promise(r => { resolve = r }) }), watchCount: async () => { counts++; return 0 } }
  const ui = setup(input, clock); ui.recovery.start(); await clock.advance(DASHBOARD_RECOVERY_WINDOW_MS)
  assert.equal(ui.state.loading, false); assert.equal(ui.state.error, 'Studio RPC is temporarily unavailable. Retry.'); assert.equal(clock.jobs.size, 0)
  resolve('late'); await flush(); assert.equal(ui.state.data, undefined); assert.equal(counts, 0); assert.equal(calls, 1)
})
test('a real remount is serialized behind the cancelled old load without publishing old data', async () => {
  const clock = new Clock(); let resolve, active = 0, peak = 0
  const old = setup(reads(async () => { active++; peak = Math.max(active, peak); const value = await new Promise(r => { resolve = r }); active--; return value }), clock)
  old.recovery.start(); await clock.advance(0); old.recovery.cancel(); const events = old.actions.length
  const next = setup(reads(async () => { active++; peak = Math.max(active, peak); active--; return 'remounted' }), clock)
  next.recovery.start(); await clock.advance(0); assert.equal(active, 1)
  resolve('old'); await flush(); assert.equal(peak, 1); assert.equal(next.state.data.version, 'remounted'); assert.equal(old.actions.length, events)
})
test('mid-list failure restarts the read-only snapshot without duplicating Watch rows', async () => {
  const clock = new Clock(), seen = []; let failed = false
  const ui = setup({ ...reads(), watchCount: async () => 2, getWatch: async id => {
    seen.push(id); if (id === 2 && !failed) { failed = true; throw transient() }
    return { created_at: id, last_observation_id: 0 }
  } }, clock)
  ui.recovery.start(); await clock.advance(2000)
  assert.deepEqual(seen, [2, 2, 1]); assert.deepEqual(ui.state.data.rows.map(row => row.id), [2, 1]); assert.equal(ui.state.data.rows.length, 2)
})
