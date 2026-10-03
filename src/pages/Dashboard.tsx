import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { sourceDomain, timeLabel } from '../lib/format'
import { driftVerdict, verdictTone } from '../lib/semantic'
import { createDashboardRecovery, enrichDashboard, retainedLoad } from '../lib/dashboard'
import type { DashboardData, LoadState, LoadAction } from '../lib/dashboard'
import { getObservation, getObservationIds, getWatch, protocolVersion, watchCount, viewScheduler, CONTRACT_ADDRESS, STUDIO_CHAIN_ID } from '../lib/studio'

import { recordDiagnostic } from '../lib/errors'
import { createDashboardCache, CACHE_REVALIDATION_GAP_MS } from '../lib/dashboard-cache'
const cache = createDashboardCache(`policydrift-dashboard-v3-${STUDIO_CHAIN_ID}-${CONTRACT_ADDRESS}`)
const reads = { protocolVersion, watchCount, getWatch, getObservationIds, getObservation, waitMs: viewScheduler.remaining }

export default function Dashboard() {
  const [{ data, loading, error, reconnecting, rateLimited }, dispatch] = useReducer(
    (state: LoadState<DashboardData>, action: LoadAction<DashboardData>) => retainedLoad(state, action),
    { loading: true, error: '' },
    state => ({ ...state, data: cache.read() }),
  )
  const [enriching, setEnriching] = useState(false)
  const initialTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const enrichment = useRef<AbortController | undefined>(undefined)
  const recovery = useMemo(() => createDashboardRecovery(
    reads, action => {
      if (action.type === 'success') { cache.save(action.data) }
      dispatch(action)
    },
  ), [])

  useEffect(() => {
    // Very recent snapshots do not cause another full burst on hard refresh.
    const saved = cache.read()
    const wait = saved?.syncedAt === undefined ? 0 : Math.max(0, saved.syncedAt + CACHE_REVALIDATION_GAP_MS - Date.now())
    initialTimer.current = setTimeout(() => { initialTimer.current = undefined; recovery.start() }, wait)
    return () => { clearTimeout(initialTimer.current); recovery.cancel(); enrichment.current?.abort() }
  }, [recovery])

  function refresh() { clearTimeout(initialTimer.current); initialTimer.current = undefined; enrichment.current?.abort(); setEnriching(false); recovery.start() }
  async function loadMetrics() {
    if (!data || loading || enriching) return
    const controller = new AbortController(); enrichment.current = controller; setEnriching(true)
    try {
      const enriched = await enrichDashboard(data, reads, controller.signal)
      if (!controller.signal.aborted) { cache.save(enriched); dispatch({ type: 'success', data: enriched }) }
    } catch (error) { if (!controller.signal.aborted) recordDiagnostic('Dashboard optional metrics', error) }
    finally { if (enrichment.current === controller) setEnriching(false) }
  }
  return <>
    <div className="page-head">
      <div><span className="eyebrow">Semantic policy monitoring / Studio</span>
        <h1>Text changes are noisy.<br /><em>Policy changes matter.</em></h1>
        <p className="lead">Consensus-backed semantic change monitoring for public policies. Each Watch, Baseline and Observation below is read from the deployed contract.</p>
      </div>
      <Link className="button-link primary" to="/create">+ Create Watch</Link>
    </div>
    {error && <p className={`notice ${data ? 'warning' : 'error'}`} role="alert">{error}{data && ' Showing the last successfully read data.'}</p>}
    <div className="section-head"><span className="eyebrow">Live registry</span><button className="secondary" onClick={refresh} disabled={loading && !reconnecting && !data?.cached}>↻ Refresh</button></div>
    {data?.syncedAt !== undefined && <p className="muted" role="note">{data.cached ? 'Cached snapshot. ' : ''}Last synced {new Date(data.syncedAt).toLocaleTimeString()}. {data.cached && 'Revalidating automatically; this is not a fresh chain read.'}</p>}
    {loading && <p className="muted" role="status">{reconnecting
      ? `${rateLimited ? 'Studio is rate-limiting reads. Retrying automatically…' : 'Studio is temporarily unavailable. Reconnecting automatically…'}${data ? ' Showing the last successfully read data.' : ''}`
      : data ? 'Reading finalized Studio state…' : 'Connecting to Studio…'}</p>}
    {data && <>
      <div className="metric-grid">
        <div className="metric"><span>Watches</span><strong>{data.count}</strong></div>
        <div className="metric"><span>{data.count > data.rows.length ? 'Visible Checks' : 'Checks'}</span><strong>{data.rows.reduce((sum, row) => sum + row.watch.check_count, 0)}</strong></div>
        <div className="metric"><span>{data.count > data.rows.length ? 'Visible Semantic Changes' : 'Semantic Changes'}</span><strong>{data.rows.every(row => row.semanticChanges !== undefined) ? data.rows.reduce((sum, row) => sum + (row.semanticChanges ?? 0), 0) : '—'}</strong></div>
        <div className="metric"><span>{data.count > data.rows.length ? 'Visible Active Baselines' : 'Active Baselines'}</span><strong>{data.rows.filter(row => row.watch.active_baseline_id > 0).length}</strong></div>
      </div>
      <p className="muted">Showing {data.rows.length} recent Watches of {data.count}. History metrics are loaded separately. <button className="secondary" disabled={loading || enriching || !!data.partial} onClick={() => void loadMetrics()}>{enriching ? 'Loading history metrics…' : 'Load semantic metrics'}</button></p>
      <section className="panel registry-panel">
        <div className="section-head"><div><span className="eyebrow">Registry</span><h2>Recent Watches</h2></div><span className="muted mono">{data.version}</span></div>
        {data.rows.length === 0 ? <div className="empty">No Watches on Studio yet. <Link to="/create">Establish the first baseline →</Link></div> :
          <div className="watch-list">{data.rows.map(({ id, watch, latest, latestPending, latestError }) => <Link className="watch-row" to={`/watch/${id}`} key={id}>
            <span className="row-id mono">#{String(id).padStart(3, '0')}</span>
            <span className="row-main"><strong>{watch.target_question}</strong><span className="muted mono">{sourceDomain(watch.source_url)}</span></span>
            <span className="row-status"><span className={`badge ${latest ? verdictTone(latest.verdict) : 'neutral'}`}>{latest ? driftVerdict(latest.verdict) : latestPending ? 'LOADING' : latestError ? 'STATUS_UNAVAILABLE' : 'NOT_CHECKED'}</span><small className="muted">{timeLabel(watch.last_check_at)} · Baseline V{watch.baseline_version} / ID {watch.active_baseline_id}</small></span>
            <span aria-hidden="true" className="row-arrow">↗</span>
          </Link>)}</div>}
      </section>
    </>}
  </>
}
