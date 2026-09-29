import { isFinalSuccess } from '../lib/studio'
import type { TransactionProgress } from '../lib/studio'

export function TransactionPanel({ progress, error }: { progress?: TransactionProgress; error?: string }) {
  if (!progress && !error) return null
  return <section className="transaction-box" aria-live="polite">
    <h3>Transaction</h3>
    {progress && <dl className="kv">
      <dt>Hash</dt><dd className="mono"><a href={`https://explorer-studio.genlayer.com/tx/${progress.hash}`} target="_blank" rel="noreferrer">{progress.hash}</a></dd>
      <dt>Lifecycle</dt><dd>{progress.status}</dd>
      <dt>Consensus</dt><dd>{progress.consensus}</dd>
      <dt>GenVM execution</dt><dd>{progress.execution}</dd>
      <dt>Finalized result</dt><dd>{progress.status === 'FINALIZED'
        ? isFinalSuccess(progress) ? 'SUCCESS' : progress.consensus === 'MAJORITY_DISAGREE' ? 'UNDETERMINED' : 'FAILED'
        : 'Pending finalization'}</dd>
      <dt>Returned ID</dt><dd>{progress.returnedId ?? 'Pending or unavailable'}</dd>
      {progress.error && <><dt>Contract error</dt><dd>{progress.error}</dd></>}
    </dl>}
    {error && <p className="notice error" role="alert">{error}</p>}
  </section>
}
