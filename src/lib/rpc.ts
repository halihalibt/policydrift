import { TransactionHashVariant } from 'genlayer-js/types'
import { createReadScheduler } from './read-scheduler.ts'
import type { ReadScheduler } from './read-scheduler.ts'
import { classifyError, recordDiagnostic } from './errors.ts'
export const READ_METHODS = ['get_protocol_version', 'get_watch_count', 'get_watch', 'get_active_baseline', 'get_baseline', 'get_observation', 'get_watch_baseline_ids', 'get_watch_observation_ids'] as const
export type ReadMethod = typeof READ_METHODS[number]
export type RetryOptions = { scheduler?: ReadScheduler; sleep?: (ms: number) => Promise<void>; random?: () => number }
export const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
/** Callers must supply an idempotent read. Never wrap a wallet request or submission. */
export async function retryTransientRead<T>(read: () => Promise<T>, context: string, options: RetryOptions = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await read() }
    catch (error) {
      recordDiagnostic(`${context}, attempt ${attempt + 1}`, error)
      if (attempt === 3 || classifyError(error) !== 'TRANSIENT_RPC') throw error
      await (options.sleep ?? pause)(250 * 2 ** attempt + Math.floor((options.random ?? Math.random)() * 50))
    }
  }
}
export function createReadQueue(limit = 2) {
  let active = 0
  const waiting: (() => void)[] = []
  return async function queue<T>(operation: () => Promise<T>): Promise<T> {
    await new Promise<void>(resolve => {
      const start = () => { active++; resolve() }
      if (active < limit) start()
      else waiting.push(start)
    })
    try { return await operation() }
    finally { active--; waiting.shift()?.() }
  }
}
type ReadClient = { readContract: (params: { address: `0x${string}`; functionName: string; args: number[]; transactionHashVariant: TransactionHashVariant.LATEST_FINAL; jsonSafeReturn: true; signal?: AbortSignal }) => Promise<unknown> }
export function createContractReader(client: ReadClient, address: `0x${string}`, options: RetryOptions = {}) {
  const scheduler = options.scheduler ?? createReadScheduler({ budget: Number.MAX_SAFE_INTEGER, spacingMs: 0 })
  return async <T>(method: ReadMethod, args: number[] = [], signal?: AbortSignal): Promise<T> => {
    if (!(READ_METHODS as readonly string[]).includes(method)) throw new Error('Only allowlisted view methods can be retried')
    return retryTransientRead(() => scheduler.run(() => { signal?.throwIfAborted(); return client.readContract({ address, functionName: method, args, transactionHashVariant: TransactionHashVariant.LATEST_FINAL, jsonSafeReturn: true, signal }) }, signal), method, options) as Promise<T>
  }
}
