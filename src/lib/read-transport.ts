import { abi } from 'genlayer-js'
import { READ_METHODS } from './rpc.ts'
import type { ReadScheduler } from './read-scheduler.ts'
import type { TransactionHashVariant } from 'genlayer-js/types'

function jsonSafe(value: unknown): unknown {
  if (typeof value === 'bigint') return value >= -9007199254740991n && value <= 9007199254740991n ? Number(value) : value.toString()
  if (value instanceof Uint8Array) return `0x${Array.from(value, n => n.toString(16).padStart(2, '0')).join('')}`
  if (Array.isArray(value)) return value.map(jsonSafe)
  if (value instanceof Map) return Object.fromEntries([...value].map(([key, item]) => [key, jsonSafe(item)]))
  return value ?? null
}
/** Pinned 1.1.8 ABI/wire format, read-only HTTP boundary retaining status/headers.
 * SDK's custom transport parses JSON without checking HTTP status. No wallet/provider is used here.
 */
export function createHttpViewClient(api: string, scheduler: ReadScheduler, fetcher: typeof fetch = (...args) => fetch(...args)) {
  return { async readContract(params: { address: `0x${string}`; functionName: string; args: number[]; transactionHashVariant: TransactionHashVariant.LATEST_FINAL; jsonSafeReturn: true; signal?: AbortSignal }) {
    if (!(READ_METHODS as readonly string[]).includes(params.functionName)) throw new Error('Only allowlisted view methods can use the HTTP read transport')
    const data = abi.transactions.serialize([abi.calldata.encode(abi.calldata.makeCalldataObject(params.functionName, params.args, undefined)), false])
    const response = await fetcher(api, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      signal: params.signal ? AbortSignal.any([params.signal, AbortSignal.timeout(12_000)]) : AbortSignal.timeout(12_000),
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'gen_call', params: [{ type: 'read', to: params.address,
        from: '0x0000000000000000000000000000000000000000', data, transaction_hash_variant: params.transactionHashVariant }] }) })
    scheduler.observeHeaders(response.headers)
    if (!response.ok) throw Object.assign(new Error(`Studio HTTP ${response.status} ${response.statusText}`), { status: response.status, headers: Object.fromEntries(response.headers.entries()) })
    const body = await response.json()
    if (body.error) throw Object.assign(new Error(body.error.message ?? 'Studio RPC request failed'), { cause: body.error, headers: Object.fromEntries(response.headers.entries()) })
    const result = body.result
    if (result && typeof result === 'object' && result.status && result.status.code !== 0) throw new Error(`gen_call failed: ${result.status.message}`)
    const hex = typeof result === 'string' ? result : result?.data
    if (typeof hex !== 'string') throw new Error(`Unexpected gen_call response: ${JSON.stringify(result)}`)
    if (!/^(?:[0-9a-fA-F]{2})*$/.test(hex)) throw new Error('Invalid gen_call encoded result')
    return jsonSafe(abi.calldata.decode(Uint8Array.from(hex.match(/../g) ?? [], pair => parseInt(pair, 16))))
  } }
}
