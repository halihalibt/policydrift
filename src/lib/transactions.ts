import { retryTransientRead, pause } from './rpc.ts'
import type { RetryOptions } from './rpc.ts'
import { classifyError, TransactionReviewError } from './errors.ts'
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

/** The send function is deliberately outside every retry/poll loop. */
export async function submitOnceAndTrack(
  send: () => Promise<string>, statusRead: (hash: string) => Promise<TransactionProgress>,
  progress: (state: TransactionProgress) => void,
  options: RetryOptions & { maxPolls?: number; interval?: number } = {},
): Promise<TransactionProgress> {
  let hash: string
  try { hash = await send() }
  catch (cause) {
    if (classifyError(cause) === 'WALLET_REJECTED') throw cause
    throw new TransactionReviewError('Transaction submission could not be confirmed. Inspect the wallet and Studio Explorer before any manual retry.', { cause })
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new TransactionReviewError('Wallet returned an invalid transaction hash after submission. Inspect the wallet and Studio Explorer before any manual retry.')
  progress({ hash, status: 'SUBMITTED', consensus: 'PENDING', execution: 'PENDING' })
  for (let attempt = 0; attempt < (options.maxPolls ?? 180); attempt++) {
    await (options.sleep ?? pause)(options.interval ?? 3000)
    let state: TransactionProgress
    try { state = await retryTransientRead(() => statusRead(hash), 'submitted transaction status', options) }
    catch (cause) {
      throw new TransactionReviewError(`Transaction ${hash} was submitted, but its status could not be retrieved. Inspect Studio Explorer before any manual retry.`, { cause })
    }
    progress(state)
    if (state.status === 'FINALIZED' || state.status === 'CANCELED') return state
  }
  throw new TransactionReviewError(`Finalization timed out for ${hash}; inspect it in Studio Explorer before any manual retry.`)
}
