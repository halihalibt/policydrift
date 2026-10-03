import { classifyError, rateLimitDelay } from './errors.ts'
export type ReadClock = { now: () => number; schedule: (callback: () => void, ms: number) => () => void }
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export function sessionStore(): StorageLike | undefined {
  try { return typeof window === 'undefined' ? undefined : window.sessionStorage } catch { return undefined }
}
const realClock: ReadClock = { now: () => Date.now(), schedule: (callback, ms) => { const id = setTimeout(callback, ms); return () => clearTimeout(id) } }
type Job = { operation: () => Promise<unknown>; resolve: (value: unknown) => void; reject: (reason: unknown) => void; signal?: AbortSignal; detach: () => void }
/** One shared view-only gate. Budget is a conservative client policy, not a Studio protocol limit. */
export function createReadScheduler(options: { clock?: ReadClock; storage?: () => StorageLike | undefined; key?: string; budget?: number; spacingMs?: number } = {}) {
  const clock = options.clock ?? realClock, storage = options.storage ?? (() => undefined)
  const key = options.key ?? 'policydrift-read-budget-v3'
  let bucket: { starts: number[]; cooldown: number; budget: number; last: number } = { starts: [], cooldown: 0, budget: options.budget ?? 18, last: -Infinity }
  let store: StorageLike | undefined, active = false, stopTimer: (() => void) | undefined
  const jobs: Job[] = []
  function load() {
    const next = storage()
    if (next === store) return
    store = next
    bucket = { starts: [], cooldown: 0, budget: options.budget ?? 18, last: -Infinity }
    try {
      const saved = JSON.parse(store?.getItem(key) ?? 'null')
      if (saved && Array.isArray(saved.starts) && saved.starts.every((n: unknown) => typeof n === 'number' && Number.isFinite(n)) && Number.isFinite(saved.cooldown) && Number.isFinite(saved.last) && Number.isInteger(saved.budget) && saved.budget > 0 && saved.budget <= 18) bucket = saved
    } catch { /* Invalid persisted budget is discarded; live enforcement still applies. */ }
  }
  function save() { try { store?.setItem(key, JSON.stringify(bucket)) } catch { /* Storage is optional, never authoritative. */ } }
  function remaining() {
    load()
    const now = clock.now()
    bucket.starts = bucket.starts.filter(n => n > now - 60_000 && n <= now)
    return Math.max(0, bucket.cooldown - now, bucket.last + (options.spacingMs ?? 350) - now,
      bucket.starts.length >= bucket.budget ? bucket.starts[0] + 60_000 - now : 0)
  }
  function pump() {
    stopTimer?.(); stopTimer = undefined
    if (active || !jobs.length) return
    const delay = remaining()
    if (delay > 0) { stopTimer = clock.schedule(pump, delay); return }
    const job = jobs.shift()!
    if (job.signal?.aborted) { job.detach(); job.reject(job.signal.reason); pump(); return }
    active = true; bucket.starts.push(clock.now()); bucket.last = clock.now(); save()
    void (async () => {
      try { job.resolve(await job.operation()) }
      catch (error) {
        if (classifyError(error) === 'RATE_LIMITED') { bucket.cooldown = Math.max(bucket.cooldown, clock.now() + rateLimitDelay(error, clock.now())); save() }
        job.reject(error)
      } finally { job.detach(); active = false; pump() }
    })()
  }
  function run<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(signal.reason)
    return new Promise<T>((resolve, reject) => {
      const job: Job = { operation, resolve: value => resolve(value as T), reject, signal, detach: () => signal?.removeEventListener('abort', abort) }
      function abort() {
        const index = jobs.indexOf(job)
        if (index >= 0) { jobs.splice(index, 1); job.detach(); reject(signal?.reason); pump() }
      }
      signal?.addEventListener('abort', abort, { once: true }); jobs.push(job); pump()
    })
  }
  function observeHeaders(headers: Headers) {
    load()
    const limit = Number(headers.get('x-ratelimit-limit'))
    if (limit > 0) bucket.budget = Math.max(1, Math.min(bucket.budget, Math.floor(limit * 0.6)))
    if (headers.get('x-ratelimit-remaining') === '0') bucket.cooldown = Math.max(bucket.cooldown, clock.now() + rateLimitDelay({ headers }, clock.now()))
    save()
  }
  return { run, remaining, observeHeaders, cooldownRemaining: () => { load(); return Math.max(0, bucket.cooldown - clock.now()) } }
}
export type ReadScheduler = ReturnType<typeof createReadScheduler>
