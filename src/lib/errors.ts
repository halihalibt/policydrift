/** Wallet providers sometimes reject with a plain object rather than Error. */
export function explainError(value: unknown, fallback = 'Operation failed'): string {
  if (typeof value === 'string' && value.trim() && value !== '[object Object]') return value
  if (value && typeof value === 'object') {
    const error = value as Record<string, unknown>
    if (error.code === 4001 || error.code === '4001') return 'Wallet request was rejected'
    for (const field of ['shortMessage', 'message', 'details']) {
      const message = error[field]
      if (typeof message === 'string' && message.trim() && message !== '[object Object]') return message
    }
    for (const field of ['error', 'cause', 'data']) {
      if (error[field] && error[field] !== value) {
        const nested = explainError(error[field], '')
        if (nested) return nested
      }
    }
    if (typeof error.code === 'number' || typeof error.code === 'string') {
      return `${fallback} (code ${error.code})`
    }
  }
  return fallback
}
