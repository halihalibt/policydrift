import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { SemanticState } from '../components/SemanticState'
import { TransactionPanel } from '../components/TransactionPanel'
import { explainError } from '../lib/errors'
import { sameAddress, sourceDomain, timeLabel } from '../lib/format'
import { baselineSnapshot, changeFlags, disposition, driftVerdict, isAdoptable, observationSnapshot, presence, semanticRelation, sourceStatus, verdictTone } from '../lib/semantic'
import type { Baseline, Observation, Watch } from '../lib/semantic'
import { getActiveBaseline, getBaseline, getBaselineIds, getObservation, getObservationIds, getWatch, isFinalSuccess, writeAndFinalize } from '../lib/studio'
import type { TransactionProgress, WriteMethod } from '../lib/studio'

type HistoryItem<T> = { id: number; record: T }
type DetailData = {
  watch: Watch; activeBaseline: Baseline
  baselines: HistoryItem<Baseline>[]; observations: HistoryItem<Observation>[]
}

const comparisonFields = [
  ['Presence', 'presence'], ['Disposition', 'disposition'], ['Conditions', 'conditions'],
  ['Scope', 'scope'], ['Exceptions', 'exceptions'], ['Quantitative Terms', 'quantitative_terms'],
] as const

export default function WatchDetail({ wallet, onConnect }: { wallet: string; onConnect: () => void }) {
  const { id } = useParams()
  const watchId = Number(id)
  const [data, setData] = useState<DetailData>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [writeError, setWriteError] = useState('')
  const [progress, setProgress] = useState<TransactionProgress>()
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    if (!Number.isSafeInteger(watchId) || watchId < 1) { setError('Invalid Watch ID'); setLoading(false); return }
    setLoading(true); setError('')
    try {
      const [watch, activeBaseline, baselineIds, observationIds] = await Promise.all([
        getWatch(watchId), getActiveBaseline(watchId), getBaselineIds(watchId), getObservationIds(watchId),
      ])
      const [baselines, observations] = await Promise.all([
        Promise.all(baselineIds.map(async baselineId => ({ id: baselineId, record: await getBaseline(baselineId) }))),
        Promise.all(observationIds.map(async observationId => ({ id: observationId, record: await getObservation(observationId) }))),
      ])
      setData({ watch, activeBaseline, baselines, observations })
    } catch (cause) { setError(explainError(cause, 'Could not load Watch from Studio')) }
    finally { setLoading(false) }
  }, [watchId])

  useEffect(() => {
    const timer = window.setTimeout(() => { void reload() }, 0)
    return () => window.clearTimeout(timer)
  }, [reload])

  async function submit(method: WriteMethod, args: number[]) {
    if (!wallet) { setWriteError('Connect a wallet to sign this transaction'); return }
    setBusy(true); setWriteError(''); setProgress(undefined)
    try {
      const final = await writeAndFinalize(wallet, method, args, setProgress)
      if (!isFinalSuccess(final)) { setWriteError(final.error || `Transaction did not succeed: ${final.consensus} / ${final.execution}`); return }
      await reload()
    } catch (cause) { setWriteError(explainError(cause, 'Studio transaction failed')) }
    finally { setBusy(false) }
  }

  const latestId = data?.watch.last_observation_id ?? 0
  const latest = data?.observations.find(item => item.id === latestId)?.record
  const comparisonBaseline = data?.baselines.find(item => item.id === latest?.baseline_id)?.record
  const owner = data ? sameAddress(wallet, data.watch.owner) : false
  const adoptable = Boolean(data && latest && owner && isAdoptable(watchId, latestId, data.watch, latest))
  const flags = latest ? changeFlags(latest.change_flags) : []

  return <>
    <Link className="back-link" to="/">← Dashboard</Link>
    <div className="page-head">
      <div><span className="eyebrow">Watch / #{Number.isSafeInteger(watchId) ? watchId : id}</span>
        <h1>Semantic record</h1><p className="lead">The active reference, latest observation and historical record are read from Studio.</p>
      </div>
      <button className="secondary" onClick={reload} disabled={loading || busy}>↻ Refresh chain data</button>
    </div>
    {loading && <p className="muted">Reading finalized Studio state…</p>}
    {error && <p className="notice error" role="alert">{error}</p>}
    {data && <>
      <section className="panel identity-panel">
        <span className="eyebrow">Tracked source</span>
        <h2>{data.watch.target_question}</h2>
        <dl className="kv">
          <dt>Source</dt><dd><a href={data.watch.source_url} target="_blank" rel="noreferrer">{data.watch.source_url}</a> <span className="muted">({sourceDomain(data.watch.source_url)})</span></dd>
          <dt>Target</dt><dd>{data.watch.target_question}</dd>
          <dt>Owner</dt><dd className="mono">{data.watch.owner} {owner && <span className="badge">CONNECTED OWNER</span>}</dd>
          <dt>Active Baseline</dt><dd>V{data.watch.baseline_version} · ID {data.watch.active_baseline_id}</dd>
          <dt>Created</dt><dd>{timeLabel(data.watch.created_at)}</dd>
          <dt>Checks</dt><dd>{data.watch.check_count} · {data.watch.observation_count} distinct Observations</dd>
        </dl>
        <div className="actions">
          <button onClick={() => submit('check_drift', [watchId])} disabled={!wallet || busy}>{busy ? 'Waiting for Studio…' : 'CHECK NOW'}</button>
          {!wallet && <button className="secondary" onClick={onConnect}>Connect wallet to check</button>}
          {adoptable && <button className="secondary" onClick={() => submit('adopt_observation', [watchId, latestId])} disabled={busy}>ADOPT AS BASELINE V{data.watch.baseline_version + 1}</button>}
        </div>
        {adoptable && <p className="muted small">Sets this observed semantic state as the reference for future checks. Historical records stay unchanged.</p>}
        <TransactionPanel progress={progress} error={writeError} />
      </section>

      <div className="grid detail-grid">
        <section className="panel">
          <span className="eyebrow">Active reference / V{data.activeBaseline.version}</span>
          <h2>Current Active Baseline</h2>
          <SemanticState state={baselineSnapshot(data.activeBaseline)} />
          <div className="evidence"><span className="label">Evidence quote</span>
            <blockquote>{data.activeBaseline.evidence_excerpt || 'No direct excerpt recorded.'}</blockquote>
          </div>
        </section>
        <section className="panel">
          <span className="eyebrow">Latest observation {latest ? `/ #${latestId}` : ''}</span>
          <h2 className={latest ? `verdict-title ${verdictTone(latest.verdict)}` : ''}>{latest ? driftVerdict(latest.verdict) : 'No checks yet'}</h2>
          {latest ? <>
            <p className="muted small">{timeLabel(latest.checked_at)} · Source {sourceStatus(latest.source_status)} · Baseline ID {latest.baseline_id}</p>
            <div className="flag-list">{flags.length ? flags.map(flag => <span key={flag} className="badge danger">{flag}</span>) : <span className="badge">NO MATERIAL FLAGS</span>}</div>
            <SemanticState state={observationSnapshot(latest)} />
            <div className="evidence"><span className="label">Evidence quote</span>
              <blockquote>{latest.evidence_excerpt || 'No direct excerpt recorded.'}</blockquote>
            </div>
            <p className="muted small">Relations · Condition {semanticRelation(latest.condition_relation)} · Scope {semanticRelation(latest.scope_relation)} · Exception {semanticRelation(latest.exception_relation)} · Quantitative {semanticRelation(latest.quantitative_relation)}</p>
          </> : <p className="muted">Use CHECK NOW to create the first Observation. Repeated semantic states may reuse an earlier Observation ID.</p>}
        </section>
      </div>

      {latest && comparisonBaseline && <section className="panel comparison-panel">
        <div className="section-head"><div><span className="eyebrow">Semantic difference</span><h2>Baseline vs Current</h2></div><span className="muted mono">Observation #{latestId} compared to Baseline #{latest.baseline_id}</span></div>
        <div className="table-scroll"><table><thead><tr><th>Field</th><th>Baseline V{comparisonBaseline.version}</th><th>Current Observation</th></tr></thead>
          <tbody>{comparisonFields.map(([label, key]) => {
            const before = key === 'presence' ? presence(comparisonBaseline.presence) : key === 'disposition' ? disposition(comparisonBaseline.disposition) : comparisonBaseline[key]
            const current = key === 'presence' ? presence(latest.current_presence) : key === 'disposition' ? disposition(latest.current_disposition)
              : key === 'conditions' ? latest.current_conditions : key === 'scope' ? latest.current_scope
                : key === 'exceptions' ? latest.current_exceptions : latest.current_quantitative_terms
            return <tr key={key} className={before !== current ? 'changed' : ''}><th>{label}</th><td>{before}</td><td>{current}</td></tr>
          })}</tbody></table></div>
      </section>}

      <section className="panel history-panel">
        <span className="eyebrow">Append-only / chain record</span><h2>Semantic History</h2>
        {data.baselines.map(({ id: baselineId, record: baseline }) => <div className="history-group" key={baselineId}>
          <div className="baseline-marker"><span className="badge">BASELINE V{baseline.version}</span>
            <span className="muted small">#{baselineId} · {timeLabel(baseline.created_at)} · {presence(baseline.presence)} / {disposition(baseline.disposition)}</span>
          </div>
          <p className="muted small mono">Digest {baseline.semantic_digest}</p>
          {baseline.origin_observation_id > 0 && <p className="muted small">Adopted from Observation #{baseline.origin_observation_id} by <span className="mono">{baseline.created_by}</span></p>}
          <div className="timeline">
            {data.observations.filter(item => item.record.baseline_id === baselineId).map(({ id: observationId, record }) => <div className="timeline-item" key={observationId}>
              <div><strong>Observation #{observationId}</strong> <span className={`badge ${verdictTone(record.verdict)}`}>{driftVerdict(record.verdict)}</span></div>
              <div className="muted small">{timeLabel(record.checked_at)} · {sourceStatus(record.source_status)} · {changeFlags(record.change_flags).join(', ') || 'NO MATERIAL FLAGS'}</div>
              <div className="muted small">Evidence: {record.evidence_excerpt || 'No excerpt recorded.'}</div>
            </div>)}
            {!data.observations.some(item => item.record.baseline_id === baselineId) && <p className="muted small">No distinct Observations for this Baseline.</p>}
          </div>
        </div>)}
      </section>
    </>}
  </>
}
