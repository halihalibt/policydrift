import type { Observation, Watch } from './semantic.ts'
import { classifyError, rateLimitDelay, explainError, recordDiagnostic } from './errors.ts'
import { createReadQueue } from './rpc.ts'
export const DASHBOARD_VISIBLE_LIMIT = 5
export type Row = { id: number; watch: Watch; latest?: Observation; latestPending?: boolean; latestError?: string; semanticChanges?: number }
export type DashboardData = { version: string; count: number; rows: Row[]; syncedAt?: number; cached?: boolean; partial?: boolean }
export type DashboardReads = {
  protocolVersion: (signal?: AbortSignal) => Promise<string>; watchCount: (signal?: AbortSignal) => Promise<number>
  getWatch: (id: number, signal?: AbortSignal) => Promise<Watch>; getObservationIds: (id: number, signal?: AbortSignal) => Promise<number[]>
  getObservation: (id: number, signal?: AbortSignal) => Promise<Observation>; waitMs?: () => number
}
export async function loadDashboard(reads: DashboardReads, signal?: AbortSignal, progress?: (data: DashboardData) => void): Promise<DashboardData> {
  async function checked<T>(read: () => Promise<T>): Promise<T> {
    signal?.throwIfAborted(); const value = await read(); signal?.throwIfAborted(); return value
  }
  const version = await checked(() => reads.protocolVersion(signal))
  const count = await checked(() => reads.watchCount(signal))
  const rows: Row[] = []
  const publish = () => progress?.({ version, count, rows: rows.map(row => ({ ...row })), partial: true })
  // Recent visible Watches only: 2 + N + at most N latest observations, N <= 5.
  for (let id = count; id > Math.max(0, count - DASHBOARD_VISIBLE_LIMIT); id--) {
    const watch = await checked(() => reads.getWatch(id, signal))
    const row: Row = { id, watch, latestPending: watch.last_observation_id > 0 }
    rows.push(row); publish()
    if (watch.last_observation_id) {
      try { row.latest = await checked(() => reads.getObservation(watch.last_observation_id, signal)) }
      catch (error) {
        signal?.throwIfAborted()
        if (classifyError(error) === 'RATE_LIMITED') throw error
        recordDiagnostic(`Dashboard latest Observation ${watch.last_observation_id}`, error)
        row.latestError = explainError(error)
        if (classifyError(error) === 'TRANSIENT_RPC') { publish(); throw error }
      }
      row.latestPending = false; publish()
    }
  }
  return { version, count, rows }
}
/** Optional history metric; never blocks the core list. Unknown counts remain undefined. */
export async function enrichDashboard(data: DashboardData, reads: DashboardReads, signal?: AbortSignal): Promise<DashboardData> {
  const rows: Row[] = []
  for (const row of data.rows) {
    signal?.throwIfAborted()
    try {
      const ids = await reads.getObservationIds(row.id, signal)
      let changes = 0
      for (const id of new Set(ids)) {
        signal?.throwIfAborted()
        const observation = id === row.watch.last_observation_id && row.latest ? row.latest : await reads.getObservation(id, signal)
        if (observation.verdict === 2) changes++
      }
      rows.push({ ...row, semanticChanges: changes })
    } catch (error) {
      signal?.throwIfAborted(); recordDiagnostic(`Dashboard history metric ${row.id}`, error)
      rows.push({ ...row, semanticChanges: undefined })
      // Don't walk the remaining history when the shared gate has entered cooldown.
      if (classifyError(error) === 'RATE_LIMITED') { rows.push(...data.rows.slice(rows.length)); break }
    }
  }
  return { ...data, rows }
}
export type LoadState<T> = { data?: T; loading: boolean; error: string; reconnecting?: boolean; rateLimited?: boolean }
export type LoadAction<T> = { type: 'start' } | { type: 'reconnect'; rateLimited?: boolean } | { type: 'progress'; data: T } | { type: 'success'; data: T } | { type: 'failure'; error: string }
export function retainedLoad<T>(state: LoadState<T>, action: LoadAction<T>): LoadState<T> {
  if (action.type === 'progress') return state.data && !(state.data as unknown as { partial?: boolean }).partial ? state : { ...state, data: action.data }
  if (action.type === 'start') return { ...state, loading: true, error: '', reconnecting: false, rateLimited: false }
  if (action.type === 'reconnect') return { ...state, loading: true, error: '', reconnecting: true, rateLimited: action.rateLimited }
  if (action.type === 'failure') return { ...state, loading: false, error: action.error, reconnecting: false, rateLimited: false }
  return { data: action.data, loading: false, error: '', reconnecting: false, rateLimited: false }
}

export const DASHBOARD_RECOVERY_DELAYS = [2000, 3000, 4000, 5000, 6000] as const
export const DASHBOARD_RECOVERY_WINDOW_MS = 30_000
export type RecoveryScheduler = { now: () => number; schedule: (callback: () => void, ms: number) => () => void }
const scheduler: RecoveryScheduler = {
  now: () => Date.now(),
  schedule: (callback, ms) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer) },
}
// Also serialize replacement cycles/remounts while an old SDK read is settling.
const dashboardLoads = createReadQueue(1)
type Cycle = { controller: AbortController; attempt: number; rateAttempts: number; memo: Map<string, unknown>; stopRetry?: () => void; stopDeadline?: () => void }

/** Dashboard views only. This API accepts no write method or transaction callback. */
export function createDashboardRecovery(reads: DashboardReads, update: (action: LoadAction<DashboardData>) => void, clock: RecoveryScheduler = scheduler) {
  let current: Cycle | undefined
  const live = (cycle: Cycle) => current === cycle && !cycle.controller.signal.aborted
  function cancel() {
    const cycle = current
    current = undefined // Invalidate stale results before clearing timers.
    if (!cycle) return
    cycle.stopRetry?.(); cycle.stopDeadline?.(); cycle.controller.abort()
  }
  function fail(cycle: Cycle, cause: unknown) {
    if (!live(cycle)) return
    cancel()
    update({ type: 'failure', error: explainError(cause, 'Could not read Studio contract. Retry.') })
  }
  async function attempt(cycle: Cycle) {
    if (!live(cycle)) return
    cycle.attempt++
    try {
      // Reuse successful views within this recovery cycle instead of rereading them after 429.
      const memo = async <T>(key: string, operation: () => Promise<T>): Promise<T> => {
        if (cycle.memo.has(key)) return cycle.memo.get(key) as T
        const value = await operation(); cycle.memo.set(key, value); return value
      }
      const input: DashboardReads = { ...reads,
        protocolVersion: signal => memo('version', () => reads.protocolVersion(signal)),
        watchCount: signal => memo('count', () => reads.watchCount(signal)),
        getWatch: (id, signal) => memo(`watch-${id}`, () => reads.getWatch(id, signal)),
        getObservation: (id, signal) => memo(`observation-${id}`, () => reads.getObservation(id, signal)),
      }
      const data = await dashboardLoads(() => loadDashboard(input, cycle.controller.signal, data => {
        if (live(cycle)) update({ type: 'progress', data })
      }))
      if (!live(cycle)) return
      cancel()
      update({ type: 'success', data: { ...data, syncedAt: clock.now(), cached: false } })
    } catch (cause) {
      if (!live(cycle)) return
      recordDiagnostic(`Dashboard recovery attempt ${cycle.attempt}`, cause)
      if (classifyError(cause) === 'RATE_LIMITED' && cycle.rateAttempts++ < 3) {
        const wait = Math.max(reads.waitMs?.() ?? 0, rateLimitDelay(cause, clock.now()))
        update({ type: 'reconnect', rateLimited: true })
        armDeadline(cycle, wait + DASHBOARD_RECOVERY_WINDOW_MS)
        cycle.stopRetry = clock.schedule(() => { cycle.stopRetry = undefined; void attempt(cycle) }, wait)
        return
      }
      const delay = DASHBOARD_RECOVERY_DELAYS[cycle.attempt - 1]
      if (classifyError(cause) !== 'TRANSIENT_RPC' || delay === undefined) {
        fail(cycle, cause); return
      }
      update({ type: 'reconnect' })
      cycle.stopRetry = clock.schedule(() => { cycle.stopRetry = undefined; void attempt(cycle) }, delay)
    }
  }
  function armDeadline(cycle: Cycle, ms: number) {
    cycle.stopDeadline?.()
    cycle.stopDeadline = clock.schedule(() => {
      if (!live(cycle)) return
      // Shared server/client-budget wait is not time spent failing a Dashboard request.
      const wait = reads.waitMs?.() ?? 0
      if (wait > 0) { armDeadline(cycle, wait + DASHBOARD_RECOVERY_WINDOW_MS); return }
      const cause = new Error('Dashboard recovery timed out after 30 seconds')
      recordDiagnostic('Dashboard recovery deadline', cause); fail(cycle, cause)
    }, ms)
  }
  function start() {
    cancel()
    const cycle: Cycle = { controller: new AbortController(), attempt: 0, rateAttempts: 0, memo: new Map() }
    current = cycle
    update({ type: 'start' })
    armDeadline(cycle, Math.max(0, reads.waitMs?.() ?? 0) + DASHBOARD_RECOVERY_WINDOW_MS)
    // Effect cleanup can cancel the first StrictMode setup before it issues a read.
    cycle.stopRetry = clock.schedule(() => { cycle.stopRetry = undefined; void attempt(cycle) }, 0)
  }
  return { start, cancel }
}
