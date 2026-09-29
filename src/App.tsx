import { useEffect, useState } from 'react'
import { HashRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
import DebugPage from './pages/DebugPage'
import Dashboard from './pages/Dashboard'
import CreateWatch from './pages/CreateWatch'
import WatchDetail from './pages/WatchDetail'
import { explainError } from './lib/errors'
import { connectWallet, CONTRACT_ADDRESS, CONTRACT_EXPLORER, STUDIO_API, STUDIO_CHAIN_ID, walletProvider } from './lib/studio'
import './App.css'

export default function App() {
  const [wallet, setWallet] = useState('')
  const [walletError, setWalletError] = useState('')
  const [walletBusy, setWalletBusy] = useState(false)

  useEffect(() => {
    try {
      const provider = walletProvider()
      const accountsChanged = (value: unknown) => {
        const account = Array.isArray(value) && typeof value[0] === 'string' ? value[0] : ''
        setWallet(account)
        if (account) setWalletError('')
      }
      provider.request({ method: 'eth_accounts' }).then(value => {
        accountsChanged(value)
      }).catch(() => { /* Connection remains user initiated. */ })
      provider.on?.('accountsChanged', accountsChanged)
      return () => provider.removeListener?.('accountsChanged', accountsChanged)
    } catch { /* Read access does not require a browser wallet. */ }
  }, [])

  async function connect() {
    setWalletBusy(true); setWalletError('')
    try { setWallet(await connectWallet()) }
    catch (error) { setWalletError(explainError(error, 'Wallet connection failed')) }
    finally { setWalletBusy(false) }
  }

  return <HashRouter>
    <div className="shell">
      <header className="topbar">
        <Link className="brand" to="/">POLICY<span>DRIFT</span><small> / STUDIO</small></Link>
        <nav><Link to="/">Dashboard</Link><Link to="/create">Create Watch</Link><Link to="/debug">Debug</Link></nav>
        <button className="wallet" onClick={connect} disabled={walletBusy}>
          {walletBusy ? 'Connecting…' : wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : 'Connect Wallet'}
        </button>
      </header>
      {walletError && <div role="alert" className="notice error">Wallet: {walletError}</div>}
      <main>
        <Routes>
          <Route path="/debug" element={<DebugPage wallet={wallet} onConnect={connect} />} />
          <Route path="/" element={<Dashboard />} />
          <Route path="/create" element={<CreateWatch wallet={wallet} onConnect={connect} />} />
          <Route path="/watch/:id" element={<WatchDetail wallet={wallet} onConnect={connect} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer>STUDIONET · CHAIN {STUDIO_CHAIN_ID} · <a href={CONTRACT_EXPLORER} target="_blank" rel="noreferrer">{CONTRACT_ADDRESS}</a> · <a href={STUDIO_API} target="_blank" rel="noreferrer">API</a></footer>
    </div>
  </HashRouter>
}
