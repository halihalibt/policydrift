import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { SemanticState } from '../components/SemanticState'
import { TransactionPanel } from '../components/TransactionPanel'
import { explainError } from '../lib/errors'
import type { Baseline } from '../lib/semantic'
import { getActiveBaseline, isFinalSuccess, writeAndFinalize } from '../lib/studio'
import type { TransactionProgress } from '../lib/studio'

const examples = [
  'Is redistribution prohibited?',
  'Are users required to provide attribution?',
  'Is API data allowed for AI model training?',
]

export default function CreateWatch({ wallet, onConnect }: { wallet: string; onConnect: () => void }) {
  const [source, setSource] = useState('')
  const [target, setTarget] = useState('')
  const [progress, setProgress] = useState<TransactionProgress>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [watchId, setWatchId] = useState<number>()
  const [baseline, setBaseline] = useState<Baseline>()

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(''); setProgress(undefined); setWatchId(undefined); setBaseline(undefined)
    if (!wallet) { setError('Connect a wallet before establishing a Baseline'); return }
    const sourceUrl = source.trim()
    const question = target.trim()
    try {
      if (new URL(sourceUrl).protocol !== 'https:') throw new Error('Policy Source must be a public HTTPS URL')
      if (!question) throw new Error('Enter a specific normative Watch Target')
    } catch (cause) { setError(explainError(cause, 'Enter a valid HTTPS policy URL')); return }
    setBusy(true)
    try {
      const final = await writeAndFinalize(wallet, 'register_watch', [sourceUrl, question], setProgress)
      if (!isFinalSuccess(final)) { setError(final.error || `Registration did not succeed: ${final.consensus} / ${final.execution}`); return }
      if (!final.returnedId) { setError('Registration finalized, but the Watch ID was not decoded. Inspect the transaction in Studio Explorer.'); return }
      setWatchId(final.returnedId)
      setBaseline(await getActiveBaseline(final.returnedId))
    } catch (cause) { setError(explainError(cause, 'Registration failed')) }
    finally { setBusy(false) }
  }

  return <>
    <Link className="back-link" to="/">← Dashboard</Link>
    <span className="eyebrow">01 / Establish reference</span>
    <h1>Create a Watch</h1>
    <p className="lead">Choose one public policy URL and one focused normative question. GenLayer validators establish the first semantic Baseline.</p>
    <div className="grid create-grid">
      <section className="panel">
        <form onSubmit={submit}>
          <label className="field">Policy Source
            <input type="url" required placeholder="https://example.com/developer-policy" value={source} onChange={event => setSource(event.target.value)} disabled={busy} />
            <small className="muted">One direct HTTPS source. The contract's source boundary rules apply.</small>
          </label>
          <label className="field">Watch Target
            <textarea required placeholder="Is commercial use of API data allowed subject to any required condition?" value={target} onChange={event => setTarget(event.target.value)} disabled={busy} />
            <small className="muted">Ask whether the policy permits, prohibits or requires a specific action.</small>
          </label>
          <div className="examples"><span className="label">Good examples</span>
            {examples.map(example => <button key={example} type="button" className="example" onClick={() => setTarget(example)} disabled={busy}>{example}</button>)}
          </div>
          <div className="actions create-actions">
            <button type="submit" disabled={busy || !wallet}>{busy ? 'Awaiting Studio consensus…' : 'ESTABLISH BASELINE'}</button>
            {!wallet && <button type="button" className="secondary" onClick={onConnect}>Connect wallet</button>}
          </div>
        </form>
        <TransactionPanel progress={progress} error={error} />
      </section>
      <div className="side-stack">
        <section className="panel"><span className="eyebrow">What happens on chain</span>
          <ol className="steps">
            <li>Validate the target</li><li>Read the public source</li><li>Extract semantic state</li>
            <li>GenLayer validators verify</li><li>Establish Baseline V1</li>
          </ol>
          <p className="muted small">Studio reports transaction status and consensus; it does not expose each internal step as a live progress event.</p>
        </section>
        {watchId && <section className="panel success-panel">
          <span className="eyebrow">Finalized on Studio</span><h2>Baseline established · Watch #{watchId}</h2>
          {baseline ? <><SemanticState state={baseline} />
            <p className="muted small">Evidence quote: {baseline.evidence_excerpt || 'No excerpt recorded for this semantic state.'}</p>
          </> : <p>Reading the new Baseline…</p>}
          <Link className="button-link primary" to={`/watch/${watchId}`}>Open Watch →</Link>
        </section>}
      </div>
    </div>
  </>
}
