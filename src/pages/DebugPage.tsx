import { useState } from 'react'
import { CONTRACT_ADDRESS, CONTRACT_EXPLORER, estimateNetworkGas, getActiveBaseline, getObservation, getWatch, isFinalSuccess, protocolVersion, STUDIO_API, STUDIO_CHAIN_ID, watchCount, writeAndFinalize } from '../lib/studio'
import type { TransactionProgress, WriteMethod } from '../lib/studio'

type ReadMethod = 'get_protocol_version' | 'get_watch_count' | 'get_watch' | 'get_active_baseline' | 'get_observation'
const readMethods: ReadMethod[] = ['get_protocol_version', 'get_watch_count', 'get_watch', 'get_active_baseline', 'get_observation']
const writeMethods: WriteMethod[] = ['register_watch', 'check_drift', 'adopt_observation']
const toId = (raw: string) => {
  const id = Number(raw)
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('ID must be a positive integer')
  return id
}

export default function DebugPage({ wallet, onConnect }: { wallet: string; onConnect: () => void }) {
  const [readMethod, setReadMethod] = useState<ReadMethod>('get_protocol_version')
  const [writeMethod, setWriteMethod] = useState<WriteMethod>('register_watch')
  const [watchId, setWatchId] = useState('1')
  const [observationId, setObservationId] = useState('1')
  const [source, setSource] = useState('')
  const [target, setTarget] = useState('')
  const [reading, setReading] = useState(false)
  const [writing, setWriting] = useState(false)
  const [readResult, setReadResult] = useState<unknown>()
  const [readError, setReadError] = useState('')
  const [writeError, setWriteError] = useState('')
  const [progress, setProgress] = useState<TransactionProgress>()
  const [gas, setGas] = useState('')

  async function doRead() {
    setReading(true); setReadError(''); setReadResult(undefined)
    try {
      const result = readMethod === 'get_protocol_version' ? await protocolVersion()
        : readMethod === 'get_watch_count' ? await watchCount()
        : readMethod === 'get_watch' ? await getWatch(toId(watchId))
        : readMethod === 'get_active_baseline' ? await getActiveBaseline(toId(watchId))
        : await getObservation(toId(observationId))
      setReadResult(result)
    } catch (error) { setReadError(error instanceof Error ? error.message : String(error)) }
    finally { setReading(false) }
  }

  async function doWrite() {
    setWriting(true); setWriteError(''); setProgress(undefined)
    try {
      if (!wallet) throw new Error('Connect an external wallet to sign this write')
      const args = writeMethod === 'register_watch' ? [source.trim(), target.trim()]
        : writeMethod === 'check_drift' ? [toId(watchId)] : [toId(watchId), toId(observationId)]
      const final = await writeAndFinalize(wallet, writeMethod, args, setProgress)
      if (!isFinalSuccess(final)) setWriteError(final.error || `Finalized without success: ${final.consensus} / ${final.execution}`)
    } catch (error) { setWriteError(error instanceof Error ? error.message : String(error)) }
    finally { setWriting(false) }
  }

  async function doEstimate() {
    try {
      if (!wallet) throw new Error('Connect the signing wallet first')
      const quote = await estimateNetworkGas(wallet)
      setGas(`${quote.gas} gas × ${quote.gasPriceWei} wei/gas = ${quote.maxWei} wei; generic Studio network diagnostic. The SDK estimates the encoded write again at send time.`)
    } catch (error) { setGas(error instanceof Error ? error.message : String(error)) }
  }

  return <>
    <span className="eyebrow">Integration / temporary</span>
    <h1>Studio contract debugger</h1>
    <p className="lead">Live reads and wallet signed writes against the deployed SemanticDriftRegistry. Every value below comes from Studio.</p>
    <section className="panel" style={{ marginBottom: 18 }}>
      <h2>Connection</h2>
      <dl className="kv">
        <dt>Wallet</dt><dd className="mono">{wallet || 'Disconnected'} {!wallet && <button onClick={onConnect}>Connect</button>}</dd>
        <dt>Network</dt><dd>GenLayer Studio / Studionet · chain {STUDIO_CHAIN_ID} · <span className="mono">{STUDIO_API}</span></dd>
        <dt>Contract</dt><dd className="mono"><a href={CONTRACT_EXPLORER} target="_blank" rel="noreferrer">{CONTRACT_ADDRESS}</a></dd>
        <dt>SDK</dt><dd className="mono">genlayer-js@1.1.8</dd>
      </dl>
    </section>
    <div className="grid">
      <section className="panel">
        <h2>READ / finalized chain state</h2>
        <label className="field">Method<select value={readMethod} onChange={e => setReadMethod(e.target.value as ReadMethod)}>{readMethods.map(method => <option key={method}>{method}</option>)}</select></label>
        {['get_watch', 'get_active_baseline'].includes(readMethod) && <label className="field">Watch ID<input inputMode="numeric" value={watchId} onChange={e => setWatchId(e.target.value)} /></label>}
        {readMethod === 'get_observation' && <label className="field">Observation ID<input inputMode="numeric" value={observationId} onChange={e => setObservationId(e.target.value)} /></label>}
        <button onClick={doRead} disabled={reading}>{reading ? 'Reading…' : 'Call view'}</button>
        {readError && <p role="alert" className="notice error">{readError}</p>}
        {readResult !== undefined && <><h3>Returned result</h3><pre>{JSON.stringify(readResult, null, 2)}</pre></>}
      </section>
      <section className="panel">
        <h2>WRITE / external wallet signature</h2>
        <label className="field">Method<select value={writeMethod} onChange={e => setWriteMethod(e.target.value as WriteMethod)}>{writeMethods.map(method => <option key={method}>{method}</option>)}</select></label>
        {writeMethod === 'register_watch' ? <>
          <label className="field">Policy source (HTTPS)<input type="url" value={source} onChange={e => setSource(e.target.value)} placeholder="https://example.com/policy" /></label>
          <label className="field">Watch target<textarea value={target} onChange={e => setTarget(e.target.value)} placeholder="Are users required to provide attribution?" /></label>
        </> : <label className="field">Watch ID<input inputMode="numeric" value={watchId} onChange={e => setWatchId(e.target.value)} /></label>}
        {writeMethod === 'adopt_observation' && <label className="field">Observation ID<input inputMode="numeric" value={observationId} onChange={e => setObservationId(e.target.value)} /></label>}
        <div className="actions"><button onClick={doWrite} disabled={!wallet || writing}>{writing ? 'Awaiting wallet / consensus…' : 'Sign and submit'}</button><button className="secondary" onClick={doEstimate} disabled={!wallet || writing}>Estimate network gas</button></div>
        {gas && <p className="muted mono">{gas}</p>}
        {writeError && <p role="alert" className="notice error">{writeError}</p>}
        {progress && <>
          <h3>Transaction lifecycle</h3>
          <dl className="kv">
            <dt>Hash</dt><dd className="mono"><a href={`https://explorer-studio.genlayer.com/tx/${progress.hash}`} target="_blank" rel="noreferrer">{progress.hash}</a></dd>
            <dt>Status</dt><dd>{progress.status}</dd><dt>Consensus</dt><dd>{progress.consensus}</dd>
            <dt>GenVM execution</dt><dd>{progress.execution}</dd>
            <dt>Finalized result</dt><dd>{progress.status === 'FINALIZED' ? isFinalSuccess(progress) ? 'SUCCESS' : progress.consensus === 'MAJORITY_DISAGREE' ? 'UNDETERMINED' : 'FAILED' : 'Pending finalization'}</dd>
            <dt>Returned ID</dt><dd>{progress.returnedId ?? 'Pending or unavailable'}</dd>
            {progress.error && <><dt>Contract error</dt><dd>{progress.error}</dd></>}
          </dl>
        </>}
      </section>
    </div>
  </>
}
