import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyError, explainError, technicalError } from '../src/lib/errors.ts'
import { createContractReader, retryTransientRead } from '../src/lib/rpc.ts'
import { loadDashboard, enrichDashboard, retainedLoad } from '../src/lib/dashboard.ts'
import { connectInjectedWallet, observeWallet, submissionProvider } from '../src/lib/wallet.ts'
import { submitOnceAndTrack } from '../src/lib/transactions.ts'
import { studionet } from 'genlayer-js/chains'
import { createClient } from 'genlayer-js'
const account = '0x' + '1'.repeat(40), other = '0x' + '2'.repeat(40), hash = '0x' + 'a'.repeat(64)
const transient = () => ({ message: 'An unknown RPC error occurred.', cause: { code: -32000 } })
const delays = [], fast = { sleep: async ms => { delays.push(ms) }, random: () => 0 }
function provider(flags = {}) {
  const p = { ...flags, account, chain: '0xf22f', calls: [], listeners: {},
    async request({ method, params }) {
      this.calls.push(method)
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return this.account ? [this.account] : []
      if (method === 'eth_chainId') return this.chain
      if (method === 'wallet_switchEthereumChain') { this.chain = params[0].chainId; return null }
      if (method === 'wallet_addEthereumChain') { this.metadata = params[0]; return null }
      if (method === 'wallet_getSnaps') throw { code: -32601, message: 'Method not found: wallet_getSnaps' }
      throw new Error(`Unexpected method: ${method}`)
    }, on(event, fn) { this.listeners[event] = fn }, removeListener(event) { delete this.listeners[event] },
  }
  return p
}
const verify = p => async () => await createClient({ chain: studionet, account, provider: p }).request({ method: 'eth_accounts' })
const tick = () => new Promise(resolve => setImmediate(resolve))

test('first transient view fails then succeeds with original data and no write', async () => {
  let calls = 0, writes = 0
  const result = { count: 5 }
  const read = createContractReader({ readContract: async () => { if (++calls === 1) throw transient(); return result }, writeContract: () => { writes++ } }, account, fast)
  assert.equal(await read('get_watch_count'), result); assert.equal(calls, 2); assert.equal(writes, 0)
  await assert.rejects(read('register_watch'), /allowlisted/); assert.equal(calls, 2)
})
test('three transient failures recover on attempt four with exponential delays', async () => {
  let calls = 0; const elapsed = []
  const result = await retryTransientRead(async () => { if (++calls < 4) throw { status: 503 }; return 7 }, 'read', { sleep: async ms => elapsed.push(ms), random: () => 0 })
  assert.equal(result, 7); assert.deepEqual(elapsed, [250, 500, 1000])
})
test('persistent transport failure stops after four attempts with actionable message and raw cause', async () => {
  let calls = 0
  await assert.rejects(retryTransientRead(async () => { calls++; throw transient() }, 'read', fast), error => {
    assert.equal(explainError(error), 'Studio RPC is temporarily unavailable. Retry.')
    assert.match(technicalError(error), /-32000/); return true
  }); assert.equal(calls, 4)
})
test('contract revert inside generic SDK wrapper and invalid arguments are not retried', async () => {
  for (const error of [{ message: 'An unknown RPC error occurred.', cause: { message: 'PD003 WATCH_NOT_FOUND' } }, { code: -32602 }]) {
    let calls = 0; await assert.rejects(retryTransientRead(async () => { calls++; throw error }, 'read', fast))
    assert.equal(calls, 1); assert.equal(classifyError(error), 'CONTRACT_ERROR')
  }
})
test('shared read queue serializes requests including delayed reads', async () => {
  let active = 0, peak = 0
  const read = createContractReader({ readContract: async () => { active++; peak = Math.max(peak, active); await tick(); active--; return 1 } }, account, fast)
  assert.deepEqual(await Promise.all(Array.from({ length: 12 }, () => read('get_watch_count'))), Array(12).fill(1)); assert.equal(peak, 1)
})
test('dashboard loader stages reads and retry never duplicates Watch or Observation rows', async () => {
  let calls = 0
  const getWatch = id => retryTransientRead(async () => { if (++calls === 1) throw transient(); return { created_at: id, last_observation_id: id } }, 'watch', fast)
  const input = { protocolVersion: async () => 'V1.1', watchCount: async () => 3, getWatch,
    getObservationIds: async id => [id], getObservation: async () => ({ verdict: 2 }) }
  const core = await loadDashboard(input)
  assert.ok(core.rows.every(row => row.semanticChanges === undefined))
  const data = await enrichDashboard(core, input)
  assert.deepEqual(data.rows.map(r => r.id), [3, 2, 1]); assert.equal(data.rows.length, 3); assert.equal(data.rows.reduce((n, r) => n + r.semanticChanges, 0), 3)
})
test('Refresh failure retains last known good data and a later success clears the error', () => {
  const data = { rows: [3, 4, 5] }; let state = { data, loading: false, error: '' }
  state = retainedLoad(state, { type: 'start' }); assert.equal(state.data, data); assert.equal(state.error, '')
  state = retainedLoad(state, { type: 'failure', error: 'Retry.' }); assert.equal(state.data, data); assert.equal(state.error, 'Retry.')
  state = retainedLoad(state, { type: 'success', data }); assert.equal(state.error, ''); assert.equal(state.loading, false)
})
test('generic EIP-1193 wallet connects through real SDK provider routing without Snap calls', async () => {
  const p = provider({ isOkxWallet: true, isMetaMask: true }); let snap = 0
  assert.equal(await connectInjectedWallet(p, studionet, async () => { snap++ }, verify(p)), account)
  assert.equal(snap, 0); assert.equal(p.calls.includes('wallet_getSnaps'), false)
})
test('MetaMask with supported Snap capability retains official SDK connect path', async () => {
  const p = provider({ isMetaMask: true }); const original = p.request.bind(p)
  p.request = async args => { if (args.method === 'wallet_getSnaps') { p.calls.push(args.method); return { 'npm:genlayer-wallet-plugin': { id: 'npm:genlayer-wallet-plugin' } } } return original(args) }
  globalThis.window = { ethereum: p }
  try {
    const client = createClient({ chain: studionet, account, provider: p })
    assert.equal(await connectInjectedWallet(p, studionet, () => client.connect('studionet'), verify(p)), account)
    assert.equal(p.calls.filter(m => m === 'wallet_getSnaps').length, 2)
  } finally { delete globalThis.window }
})
test('MetaMask without installed GenLayer Snap uses official wallet_requestSnaps path', async () => {
  const p = provider({ isMetaMask: true }); const original = p.request.bind(p)
  p.request = async args => { if (args.method === 'wallet_getSnaps') return {}; if (args.method === 'wallet_requestSnaps') { p.calls.push(args.method); assert.ok(args.params['npm:genlayer-wallet-plugin']); return {} } return original(args) }
  globalThis.window = { ethereum: p }
  try { await connectInjectedWallet(p, studionet, () => createClient({ chain: studionet, account, provider: p }).connect('studionet'), verify(p)); assert.ok(p.calls.includes('wallet_requestSnaps')) }
  finally { delete globalThis.window }
})
test('unsupported optional Snap capability falls back only after valid chain/account/SDK checks', async () => {
  const p = provider({ isMetaMask: true })
  assert.equal(await connectInjectedWallet(p, studionet, async () => { throw new Error('must not invoke SDK Snap path') }, verify(p)), account)
  await assert.rejects(connectInjectedWallet(p, studionet, async () => {}, async () => []), /SDK provider account/)
})
test('non-capability Snap errors are not ignored or downgraded', async () => {
  const p = provider({ isMetaMask: true }); const original = p.request.bind(p)
  p.request = async args => { if (args.method === 'wallet_getSnaps') throw { code: 4001 }; return original(args) }
  await assert.rejects(connectInjectedWallet(p, studionet, async () => {}, verify(p)), e => classifyError(e) === 'WALLET_REJECTED')
})
test('generic network add/switch uses exact SDK chain metadata', async () => {
  const p = provider(); p.chain = '0x1'; let unknown = true; const original = p.request.bind(p)
  p.request = async args => { if (args.method === 'wallet_switchEthereumChain' && unknown) { unknown = false; throw { code: 4902 } } return original(args) }
  await connectInjectedWallet(p, studionet, async () => {}, verify(p))
  assert.deepEqual(p.metadata.rpcUrls, studionet.rpcUrls.default.http); assert.equal(p.metadata.chainName, studionet.name); assert.deepEqual(p.metadata.nativeCurrency, studionet.nativeCurrency)
})
test('wrong chain after attempted switch fails explicitly', async () => {
  const p = provider(); p.chain = '0x1'; const original = p.request.bind(p)
  p.request = async args => args.method === 'wallet_switchEthereumChain' ? null : original(args)
  await assert.rejects(connectInjectedWallet(p, studionet, async () => {}, verify(p)), e => /61999/.test(explainError(e)))
})
test('accountsChanged updates account, disconnects, and clears stale wallet errors', async () => {
  const p = provider(); let state = { account: '', error: 'old error' }
  const stop = observeWallet(p, studionet, next => { state = next }); await tick()
  assert.equal(state.error, ''); p.account = other; p.listeners.accountsChanged([other]); await tick(); assert.equal(state.account, other)
  p.account = ''; p.listeners.accountsChanged([]); await tick(); assert.deepEqual(state, { account: '', error: '' })
  stop(); assert.deepEqual(p.listeners, {})
})
test('chainChanged disables writes on wrong chain and restores a connected account on Studionet', async () => {
  const p = provider(); let state
  const stop = observeWallet(p, studionet, next => { state = next }); await tick()
  p.chain = '0x1'; p.listeners.chainChanged('0x1'); await tick(); assert.equal(state.account, ''); assert.match(state.error, /61999/)
  p.chain = '0xf22f'; p.listeners.chainChanged(p.chain); await tick(); assert.equal(state.account, account); assert.equal(state.error, '')
  stop()
})
test('transaction polling transient errors recover without repeating send', async () => {
  let writes = 0, polls = 0
  const result = await submitOnceAndTrack(async () => { writes++; return hash }, async () => { if (++polls < 3) throw transient(); return { hash, status: 'FINALIZED' } }, () => {}, fast)
  assert.equal(result.status, 'FINALIZED'); assert.equal(writes, 1); assert.equal(polls, 3)
})
test('exhausted polling keeps submitted hash and never resends writeContract', async () => {
  let writes = 0, polls = 0
  await assert.rejects(submitOnceAndTrack(async () => { writes++; return hash }, async () => { polls++; throw transient() }, () => {}, fast), e => e.message.includes(hash))
  assert.equal(writes, 1); assert.equal(polls, 4)
})
test('submission/signature rejection is never retried', async () => {
  let writes = 0
  await assert.rejects(submitOnceAndTrack(async () => { writes++; throw { code: 4001 } }, async () => { throw new Error('must not poll') }, () => {}, fast))
  assert.equal(writes, 1)
})
test('provider guard blocks any second SDK submission attempt', async () => {
  let calls = 0; const p = submissionProvider({ request: async () => { calls++; throw transient() } })
  await assert.rejects(p.request({ method: 'eth_sendTransaction' })); await assert.rejects(p.request({ method: 'eth_sendTransaction' }), /already attempted/)
  assert.equal(calls, 1)
})

test('submitted hash remains in user-facing message even when cause is transient RPC', async () => {
  await assert.rejects(submitOnceAndTrack(async () => hash, async () => { throw transient() }, () => {}, fast), e => {
    assert.match(explainError(e), new RegExp(hash)); assert.match(explainError(e), /submitted.*manual retry/); assert.match(technicalError(e), /-32000/); return true
  })
})
test('network or account changes during SDK verification cannot become a successful connection', async () => {
  const p = provider()
  await assert.rejects(connectInjectedWallet(p, studionet, async () => {}, async () => { p.chain = '0x1'; return [account] }), /chain/)
  p.chain = '0xf22f'
  await assert.rejects(connectInjectedWallet(p, studionet, async () => {}, async () => { p.account = other; return [account] }), /account changed/)
})

test('HTTP/timeout and malformed transport JSON errors have finite read retry, contract errors take priority', async () => {
  const errors = [502, 503, 504].map(status => ({ status }))
  errors.push(new SyntaxError('Unexpected token <, response is not valid JSON'), new Error('Request timed out'))
  for (const error of errors) {
    let calls = 0
    assert.equal(await retryTransientRead(async () => { if (++calls === 1) throw error; return 'ok' }, 'transport', fast), 'ok'); assert.equal(calls, 2)
  }
  assert.equal(classifyError({ status: 503, cause: { message: 'execution reverted: PD001' } }), 'CONTRACT_ERROR')
})
test('Snap method-not-found message without a numeric code still requires valid generic connection checks', async () => {
  const p = provider({ isMetaMask: true }), original = p.request.bind(p)
  p.request = async args => { if (args.method === 'wallet_getSnaps') throw new Error('Method not found: wallet_getSnaps'); return original(args) }
  assert.equal(await connectInjectedWallet(p, studionet, async () => { throw new Error('must not call Snap connect') }, verify(p)), account)
})

test('pinned SDK ABI fallback cannot repeat an underlying wallet submission', async () => {
  const previous = globalThis.fetch; let sends = 0
  globalThis.fetch = async (_url, options) => {
    const { method } = JSON.parse(options.body)
    const values = { eth_getTransactionCount: '0x0', eth_estimateGas: '0x30d40', eth_gasPrice: '0x1' }
    assert.ok(method in values, `Only mocked pre-submission reads are permitted: ${method}`)
    return { json: async () => ({ result: values[method] }) }
  }
  const p = submissionProvider({ request: async ({ method }) => {
    assert.equal(method, 'eth_sendTransaction'); sends++
    throw new Error('invalid pointer in tuple') // Triggers the pinned SDK ABI fallback.
  } })
  try {
    const client = createClient({ chain: studionet, account, provider: p })
    await assert.rejects(client.writeContract({ address: account, functionName: 'check_drift', args: [3], value: 0n }), e => /already attempted/.test(technicalError(e)))
    assert.equal(sends, 1)
  } finally { globalThis.fetch = previous }
})

test('uncertain submission transport failure does not tell the user to blindly resend', async () => {
  let writes = 0
  await assert.rejects(submitOnceAndTrack(async () => { writes++; throw transient() }, async () => { throw new Error('must not poll without hash') }, () => {}, fast), e => {
    assert.match(explainError(e), /could not be confirmed.*Inspect the wallet/); assert.match(technicalError(e), /unknown RPC/); return true
  })
  assert.equal(writes, 1)
})
