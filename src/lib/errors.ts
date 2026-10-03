export type ErrorKind = 'RATE_LIMITED' | 'TRANSIENT_RPC' | 'WALLET_REJECTED' | 'WRONG_NETWORK' | 'WALLET_CAPABILITY_UNSUPPORTED' | 'CONTRACT_ERROR' | 'UNKNOWN'
/** Submission may already have happened. Never suggest a blind resend. */
export class TransactionReviewError extends Error {}
function errorParts(value: unknown, seen = new Set<unknown>()): Record<string, unknown>[] {
  if (!value || seen.has(value)) return []
  seen.add(value)
  if (typeof value === 'string') return [{ message: value }]
  if (typeof value !== 'object') return []
  const e = value as Record<string, unknown>
  return [e, ...['error', 'cause', 'data', 'response'].flatMap(key => errorParts(e[key], seen))]
}
export function technicalError(value: unknown): string {
  return errorParts(value).map(e => ['name', 'code', 'status', 'shortMessage', 'message', 'details', 'retryAfterMs', 'headers']
    .filter(key => e[key] !== undefined).map(key => `${key}: ${key === 'headers' ? JSON.stringify(e[key]) : String(e[key])}`).join('\n')).filter(Boolean).join('\nCaused by:\n') || String(value)
}
export function classifyError(value: unknown): ErrorKind {
  const parts = errorParts(value), text = technicalError(value), codes = parts.map(e => Number(e.code))
  if (codes.includes(4001)) return 'WALLET_REJECTED'
  if (/\bPD\d{3}\b|execution reverted|contract.*revert|invalid (arguments?|params)|invalid.*ID/i.test(text) || codes.includes(-32602)) return 'CONTRACT_ERROR'
  if (/wrong.network|Wallet is on chain|switch.*Studionet/i.test(text) || codes.includes(4902)) return 'WRONG_NETWORK'
  if (codes.includes(-32601) || codes.includes(4200) || /(?:method not found|unsupported method).*wallet_getSnaps|wallet_getSnaps.*(?:not supported|unsupported)/i.test(text)) return 'WALLET_CAPABILITY_UNSUPPORTED'
  if (parts.some(e => Number(e.status) === 429 || Number(e.statusCode) === 429 || Number(e.code) === 429) || /\b429\b|too many requests|rate.?limit.*(?:exceeded|reached)/i.test(text)) return 'RATE_LIMITED'
  if (parts.some(e => [ 502, 503, 504].includes(Number(e.status)) || [502, 503, 504].includes(Number(e.code))) ||
      /failed to fetch|fetch failed|network.?error|network (request|connection).*fail|timeout|timed out|temporar|\b(502|503|504)\b|unknown RPC error|HTTP request failed|ECONNRESET|ENOTFOUND|Unexpected gen_call response: undefined/i.test(text) ||
      (parts.some(e => e.name === 'SyntaxError') && /JSON/i.test(text))) return 'TRANSIENT_RPC'
  return 'UNKNOWN'
}
export function explainError(value: unknown, fallback = 'Operation failed'): string {
  // Once submitted, the hash and manual-inspection instruction must survive a nested RPC failure.
  if (value instanceof TransactionReviewError) return value.message
  const kind = classifyError(value)
  if (kind === 'WALLET_REJECTED') return 'Wallet request was rejected'
  if (kind === 'RATE_LIMITED') return 'Studio is rate-limiting reads. Please wait, then retry.'
  if (kind === 'TRANSIENT_RPC') return 'Studio RPC is temporarily unavailable. Retry.'
  if (kind === 'WRONG_NETWORK') return 'Switch your wallet to Studionet (chain 61999), then reconnect.'
  if (kind === 'WALLET_CAPABILITY_UNSUPPORTED') return 'This wallet does not support the requested capability. Use a compatible wallet or retry the supported connection path.'
  if (kind === 'CONTRACT_ERROR') {
    const detail = errorParts(value).find(e => /\bPD\d{3}\b|revert|invalid (arguments?|params)|invalid.*ID/i.test(String(e.message ?? e.shortMessage ?? '')))
    if (detail) return String(detail.message ?? detail.shortMessage)
    return 'The contract rejected this request. Check the arguments and try again.'
  }
  for (const e of errorParts(value)) for (const key of ['shortMessage', 'message', 'details', 'retryAfterMs', 'headers']) {
    if (typeof e[key] === 'string' && e[key].trim() && e[key] !== '[object Object]') return e[key]
  }
  return fallback
}
const diagnostics: { at: string; context: string; kind: ErrorKind; detail: string }[] = []
export function recordDiagnostic(context: string, value: unknown) {
  diagnostics.push({ at: new Date().toISOString(), context, kind: classifyError(value), detail: technicalError(value) })
  if (diagnostics.length > 20) diagnostics.shift()
}
export const readDiagnostics = () => [...diagnostics]

/** HTTP seconds/date Retry-After and observed reset-seconds; headers may be hidden by CORS. */
export function rateLimitDelay(value: unknown, now = Date.now()): number {
  for (const part of errorParts(value)) {
    if (typeof part.retryAfterMs === 'number' && part.retryAfterMs > 0) return part.retryAfterMs
    const headers = part.headers as Headers | Record<string, string> | undefined
    const get = (name: string) => headers && ('get' in headers && typeof headers.get === 'function'
      ? headers.get(name) : Object.entries(headers).find(([key]) => key.toLowerCase() === name)?.[1])
    const retry = get('retry-after')
    if (retry) {
      const ms = /^\d+(?:\.\d+)?$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - now
      if (Number.isFinite(ms) && ms > 0) return ms
    }
    const reset = Number(get('x-ratelimit-reset'))
    if (reset > 0) return reset > 1e9 ? Math.max(1000, reset * 1000 - now) : reset * 1000
  }
  return 12_000
}
