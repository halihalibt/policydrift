import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { explainError } from '../lib/errors'
import { sourceDomain, timeLabel } from '../lib/format'
import { driftVerdict, verdictTone } from '../lib/semantic'
import type { Observation, Watch } from '../lib/semantic'
import { getObservation, getObservationIds, getWatch, protocolVersion, watchCount } from '../lib/studio'

type Row = { id: number; watch: Watch; latest?: Observation; semanticChanges: number }
type DashboardData = { version: string; count: number; rows: Row[] }

export default function Dashboard() {
  const [data, setData] = useState<DashboardData>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [version, count] = await Promise.all([protocolVersion(), watchCount()])
      const rows = await Promise.all(Array.from({ length: count }, async (_, index): Promise<Row> => {
        const id = index + 1
        const [watch, observationIds] = await Promise.all([getWatch(id), getObservationIds(id)])
        const observations = await Promise.all(observationIds.map(getObservation))
        const latestIndex = observationIds.indexOf(watch.last_observation_id)
        return {
          id, watch,
          latest: observations[latestIndex]
            ?? (watch.last_observation_id ? await getObservation(watch.last_observation_id) : undefined),
          semanticChanges: observations.filter(observation => observation.verdict === 2).length,
        }
      }))
      rows.sort((a, b) => b.watch.created_at - a.watch.created_at || b.id - a.id)
      setData({ version, count, rows })
    } catch (cause) { setError(explainError(cause, 'Could not read Studio contract')) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void reload() }, 0)
    return () => window.clearTimeout(timer)
  }, [reload])

  return <>
    <div className="page-head">
      <div><span className="eyebrow">Semantic policy monitoring / Studio</span>
        <h1>Text changes are noisy.<br /><em>Policy changes matter.</em></h1>
        <p className="lead">Consensus-backed semantic change monitoring for public policies. Each Watch, Baseline and Observation below is read from the deployed contract.</p>
      </div>
      <Link className="button-link primary" to="/create">+ Create Watch</Link>
    </div>
    {error && <p className="notice error" role="alert">{error}</p>}
    <div className="section-head"><span className="eyebrow">Live registry</span><button className="secondary" onClick={reload} disabled={loading}>↻ Refresh</button></div>
    {loading && <p className="muted">Reading finalized Studio state…</p>}
    {data && <>
      <div className="metric-grid">
        <div className="metric"><span>Watches</span><strong>{data.count}</strong></div>
        <div className="metric"><span>Checks</span><strong>{data.rows.reduce((sum, row) => sum + row.watch.check_count, 0)}</strong></div>
        <div className="metric"><span>Semantic Changes</span><strong>{data.rows.reduce((sum, row) => sum + row.semanticChanges, 0)}</strong></div>
        <div className="metric"><span>Active Baselines</span><strong>{data.rows.filter(row => row.watch.active_baseline_id > 0).length}</strong></div>
      </div>
      <section className="panel registry-panel">
        <div className="section-head"><div><span className="eyebrow">Registry</span><h2>Recent Watches</h2></div><span className="muted mono">{data.version}</span></div>
        {data.rows.length === 0 ? <div className="empty">No Watches on Studio yet. <Link to="/create">Establish the first baseline →</Link></div> :
          <div className="watch-list">{data.rows.map(({ id, watch, latest }) => <Link className="watch-row" to={`/watch/${id}`} key={id}>
            <span className="row-id mono">#{String(id).padStart(3, '0')}</span>
            <span className="row-main"><strong>{watch.target_question}</strong><span className="muted mono">{sourceDomain(watch.source_url)}</span></span>
            <span className="row-status"><span className={`badge ${latest ? verdictTone(latest.verdict) : 'neutral'}`}>{latest ? driftVerdict(latest.verdict) : 'NOT_CHECKED'}</span><small className="muted">{timeLabel(watch.last_check_at)}</small></span>
            <span aria-hidden="true" className="row-arrow">↗</span>
          </Link>)}</div>}
      </section>
    </>}
  </>
}
