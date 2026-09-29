export type TransactionProgress = {
  hash: string; status: string; consensus: string; execution: string
  returnedId?: number; error?: string
}

export type StudioTransaction = {
  statusName?: string; status?: number; result_name?: string; resultName?: string
  consensus_data?: { leader_receipt?: {
    execution_result?: string
    result?: { status?: string; payload?: { readable?: string } }
    error?: string | null
  }[] }
}

export function classifyTransaction(tx: StudioTransaction, hash: string): TransactionProgress {
  const status = tx.statusName ?? `STATUS_${tx.status ?? 'UNKNOWN'}`
  // Studio currently returns snake_case result_name despite the SDK's resultName type.
  const consensus = tx.result_name ?? tx.resultName ?? 'PENDING'
  const leader = tx.consensus_data?.leader_receipt?.at(-1)
  const execution = leader?.execution_result ?? 'PENDING'
  const id = leader?.result?.status === 'return' ? Number(leader.result.payload?.readable) : NaN
  const returnedId = Number.isSafeInteger(id) && id > 0 ? id : undefined
  const error = typeof leader?.error === 'string' && leader.error
    ? leader.error
    : leader?.result?.status === 'error' ? leader.result.payload?.readable : undefined
  return { hash, status, consensus, execution, returnedId, error }
}

export function isFinalSuccess(tx: TransactionProgress): boolean {
  return tx.status === 'FINALIZED' && tx.consensus === 'MAJORITY_AGREE' && tx.execution === 'SUCCESS'
}
