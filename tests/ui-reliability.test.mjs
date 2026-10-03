// DOM integration tests: actual React pages + pinned SDK, synthetic RPC/provider only.
// These tests never reach Studio and are not a substitute for real browser verification.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { JSDOM } from 'jsdom'
import { act, createElement, StrictMode } from 'react'
import { abi } from 'genlayer-js'
import { fromRlp } from 'viem'

const source = new URL('../src/', import.meta.url).href
registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.startsWith(source) && specifier.startsWith('.')) {
      const candidate = new URL(specifier, context.parentURL)
      for (const suffix of ['.ts', '.tsx']) if (existsSync(fileURLToPath(candidate) + suffix)) return next(candidate.href + suffix, context)
    }
    return next(specifier, context)
  },
  load(url, context, next) {
    if (url.startsWith(source) && url.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true }
    if (url.startsWith(source) && /\.tsx?$/.test(url)) return { format: 'module', shortCircuit: true,
      source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), { fileName: fileURLToPath(url), compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText }
    return next(url, context)
  },
})
const address = '0x' + '1'.repeat(40), other = '0x' + '2'.repeat(40)
const policy = 'https://halihalibt.github.io/policydrift/demo/policy.html'
const questions = { 3: 'Is commercial use of API data allowed subject to any required condition?', 4: 'Is independent redistribution of API data prohibited?', 5: 'Is API data allowed for AI model training?' }
function baseline(id) {
  return { watch_id: id, version: 1, created_at: id, created_by: address, origin_observation_id: 0,
    presence: id === 5 ? 2 : 1, disposition: id === 5 ? 0 : id === 4 ? 2 : 1,
    conditions: id === 3 ? 'attribution is displayed' : 'NONE', scope: id === 4 ? 'Independent redistribution of API data' : id === 5 ? 'NONE' : 'Commercial applications',
    exceptions: 'NONE', quantitative_terms: 'NONE', evidence_excerpt: '', semantic_digest: 'test-baseline' }
}
function observation(id) {
  const b = baseline(id)
  return { watch_id: id, baseline_id: id, checked_at: 100, checked_by: address, source_status: 1, verdict: id === 4 ? 1 : 2, change_flags: id === 3 ? 32 : id === 5 ? 1 : 0,
    current_presence: 1, current_disposition: id === 3 ? 1 : 2, condition_relation: id === 3 ? 4 : 1, scope_relation: 1, exception_relation: 1, quantitative_relation: 1,
    current_conditions: id === 3 ? 'prior written approval' : b.conditions, current_scope: id === 5 ? 'API data used for AI model training.' : b.scope,
    current_exceptions: 'NONE', current_quantitative_terms: 'NONE', evidence_excerpt: id === 5 ? 'API data may not be used for AI model training.' : '', semantic_digest: 'test-observation' }
}
function response(method, id) {
  if (method === 'get_protocol_version') return 'PolicyDrift-V1.1-Studio'
  if (method === 'get_watch_count') return 5
  if (method === 'get_watch') return { owner: address, source_url: policy, target_question: questions[id] ?? `Validation fixture ${id}`, active_baseline_id: id,
    baseline_version: 1, created_at: id, last_check_at: 100, baseline_count: 1, observation_count: 1, check_count: 1, last_observation_id: id, last_observation_fingerprint: 'test' }
  if (method === 'get_watch_observation_ids' || method === 'get_watch_baseline_ids') return [id]
  if (method === 'get_active_baseline' || method === 'get_baseline') return baseline(id)
  if (method === 'get_observation') return observation(id)
  throw new Error(`Non-view or unexpected contract method: ${method}`)
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
function fakeTimers(t) {
  t.mock.timers.enable({ apis: ['Date'], now: 0 })
  const jobs = new Map(); let next = 0
  t.mock.method(globalThis, 'setTimeout', (callback, ms = 0) => { const id = ++next; jobs.set(id, { due: Date.now() + ms, callback }); return id })
  t.mock.method(globalThis, 'clearTimeout', id => jobs.delete(id))
  return { async advance(ms) {
    const end = Date.now() + ms
    for (let i = 0; i < 120; i++) await Promise.resolve()
    let guard = 0
    while (true) {
      const item = [...jobs].filter(([, job]) => job.due <= end).sort((a,b) => a[1].due-b[1].due || a[0]-b[0])[0]
      if (!item) break
      assert.ok(++guard < 10_000, 'bounded timer scheduling')
      jobs.delete(item[0]); t.mock.timers.setTime(item[1].due); item[1].callback()
      for (let i = 0; i < 120; i++) await Promise.resolve()
    }
    t.mock.timers.setTime(end)
    for (let i = 0; i < 120; i++) await Promise.resolve()
  } }
}
async function advance(timers, ms) { await act(async () => { await timers.advance(ms) }) }
async function settle(predicate, timers, timeout = 180_000, check = () => {}) {
  let elapsed = 0
  while (!predicate()) {
    if (elapsed > timeout) throw new Error('DOM condition did not settle')
    await advance(timers, 25); elapsed += 25; check()
  }
}
function mockProvider(flags = {}) {
  return { ...flags, authorised: false, account: address, chain: '0xf22f', calls: [], listeners: {}, reject: false,
    async request({ method, params }) {
      this.calls.push(method)
      if (method === 'eth_requestAccounts') { if (this.reject) throw { code: 4001 }; this.authorised = true; return [this.account] }
      if (method === 'eth_accounts') return this.authorised ? [this.account] : []
      if (method === 'eth_chainId') return this.chain
      if (method === 'wallet_switchEthereumChain') { this.chain = params[0].chainId; return null }
      if (method === 'wallet_getSnaps') { if (this.snapSupported) return {}; throw { code: -32601, message: 'Method not found: wallet_getSnaps' } }
      if (method === 'wallet_requestSnaps') return {}
      throw new Error(`Unexpected wallet request: ${method}`)
    },
    on(name, cb) { this.listeners[name] = cb }, removeListener(name) { delete this.listeners[name] },
  }
}
async function mount({ timers, failures = 0, delay = 0, provider, route = '/', strict = false, rateFailures = 0, session = {} } = {}) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: `https://example.test/#${route}` })
  const previous = new Map(['window', 'document', 'navigator', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT', 'fetch'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]))
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  for (const [key, value] of Object.entries(session)) dom.window.sessionStorage.setItem(key, value)
  if (provider) dom.window.ethereum = provider
  const network = { rateFailures, failHistoryId: 0, failures, delay, calls: 0, active: 0, peak: 0, writes: 0 }
  globalThis.fetch = async (_url, options) => {
    network.calls++; network.active++; network.peak = Math.max(network.active, network.peak)
    try {
      const request = JSON.parse(options.body)
      if (request.method !== 'gen_call') { network.writes++; throw new Error(`Forbidden RPC ${request.method}`) }
      const call = abi.calldata.decode(fromRlp(request.params[0].data, 'bytes')[0])
      if (network.delay) await sleep(network.delay)
      if (network.rateFailures > 0) { network.rateFailures--; return new Response('Too Many Requests', { status: 429, headers: { 'Retry-After': '10' } }) }
      if (call.get('method') === 'get_watch_observation_ids' && Number(call.get('args')?.[0]) === network.failHistoryId) return Response.json({ error: { message: 'temporary RPC failure' } })
      if (network.failures > 0) { network.failures--; return Response.json({ error: { code: -32000, message: 'An unknown RPC error occurred.' } }) }
      const result = response(call.get('method'), Number(call.get('args')?.[0]))
      return Response.json({ result: Buffer.from(abi.calldata.encode(result)).toString('hex') })
    } finally { network.active-- }
  }
  const { default: App } = await import('../src/App.tsx')
  const { createRoot } = await import('react-dom/client')
  const root = createRoot(dom.window.document.getElementById('root'))
  await act(async () => { root.render(strict ? createElement(StrictMode, null, createElement(App)) : createElement(App)) })
  await advance(timers, 0)
  const doc = dom.window.document
  return { network, doc, session: () => Object.fromEntries(Array.from({ length: dom.window.sessionStorage.length }, (_, i) => { const key = dom.window.sessionStorage.key(i); return [key, dom.window.sessionStorage.getItem(key)] })), text: () => doc.body.textContent, alert: () => doc.querySelector('[role="alert"]'),
    async click(label) { const button = [...doc.querySelectorAll('button')].find(b => b.textContent.includes(label)); assert.ok(button, label); assert.equal(button.disabled, false); await act(async () => { button.click(); await Promise.resolve() }) },
    async close() {
      assert.equal(network.writes, 0)
      assert.equal(provider?.calls.some(c => /sendTransaction|signTransaction|personal_sign|signTypedData/.test(c)) ?? false, false)
      await act(async () => root.unmount())
      // The SDK has no fetch abort; settle its existing bounded read retries under fake time.
      await advance(timers, 2000)
      assert.equal(network.writes, 0)
      dom.window.close()
      for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] }
    } }
}
const loaded = ui => ui.doc.querySelectorAll('.watch-row').length === 5 && !ui.doc.querySelector('[role="status"]')

test('actual Dashboard and SDK: three cold mounts recover silently, then repeated Refresh remains deduplicated', async t => {
  const timers = fakeTimers(t)
  for (let i = 0; i < 3; i++) {
    const ui = await mount({ timers, failures: i + 1 })
    try {
      assert.equal(Boolean(ui.alert()), false); await settle(() => loaded(ui), timers); assert.equal(Boolean(ui.alert()), false)
      for (let n = 0; n < 3; n++) { ui.network.failures = 1; await ui.click('Refresh'); assert.equal(ui.doc.querySelectorAll('.watch-row').length, 5); await settle(() => loaded(ui), timers); assert.equal(Boolean(ui.alert()), false) }
      assert.equal(ui.network.peak, 1)
    } finally { await ui.close() }
  }
})
test('actual Dashboard: persistent initial failure surfaces actionable error and manual Refresh recovers', async t => {
  const timers = fakeTimers(t)
  const ui = await mount({ timers, failures: 24 })
  try {
    await settle(() => ui.alert(), timers); assert.match(ui.alert().textContent, /temporarily unavailable\. Retry/); assert.ok(ui.network.calls >= 20 && ui.network.calls <= 24)
    assert.equal(ui.doc.querySelectorAll('.watch-row').length, 0); ui.network.failures = 0; await ui.click('Refresh'); await settle(() => loaded(ui), timers); assert.equal(Boolean(ui.alert()), false)
  } finally { await ui.close() }
})
test('actual Dashboard: exhausted Refresh keeps last known good rows, slow Refresh keeps data visible', async t => {
  const timers = fakeTimers(t)
  const ui = await mount({ timers })
  try {
    await settle(() => loaded(ui), timers); ui.network.failures = 24; await ui.click('Refresh'); await settle(() => ui.alert(), timers)
    assert.equal(ui.doc.querySelectorAll('.watch-row').length, 5); assert.match(ui.alert().textContent, /last successfully read data/)
    ui.network.failures = 0; ui.network.delay = 20; await ui.click('Refresh'); assert.equal(ui.doc.querySelectorAll('.watch-row').length, 5)
    await settle(() => loaded(ui), timers); assert.equal(Boolean(ui.alert()), false)
  } finally { await ui.close() }
})
test('actual Watch Details: all three comparisons and history readable without any wallet, RPC concurrency bounded', async t => {
  const timers = fakeTimers(t)
  for (const id of [3, 4, 5]) {
    const ui = await mount({ timers, route: `/watch/${id}`, delay: 10, failures: 1 })
    try {
      await settle(() => ui.doc.querySelector('.comparison-panel'), timers)
      assert.ok(ui.doc.querySelector('.history-panel')); assert.equal(Boolean(ui.alert()), false); assert.ok(ui.network.peak <= 2)
      assert.match(ui.text(), new RegExp(id === 3 ? 'CONDITION_CHANGED' : id === 4 ? 'NO_MATERIAL_DRIFT' : 'RULE_APPEARED'))
      assert.equal([...ui.doc.querySelectorAll('button')].find(b => b.textContent === 'CHECK NOW').disabled, true)
    } finally { await ui.close() }
  }
})
test('actual App: generic wallet skips Snaps, wrong-chain state leaves Dashboard readable, events and reconnect recover', async t => {
  const timers = fakeTimers(t)
  const p = mockProvider({ isMetaMask: true, isOkxWallet: true }), ui = await mount({ timers, provider: p })
  try {
    await settle(() => loaded(ui), timers); await ui.click('Connect Wallet'); await settle(() => ui.doc.querySelector('.wallet').textContent.includes('0x1111'), timers)
    assert.equal(Boolean(ui.alert()), false); assert.equal(p.calls.includes('wallet_getSnaps'), false)
    await act(async () => { p.chain = '0x1'; p.listeners.chainChanged(p.chain); await Promise.resolve() })
    assert.match(ui.alert().textContent, /61999/); assert.equal(ui.doc.querySelectorAll('.watch-row').length, 5)
    await act(async () => { p.chain = '0xf22f'; p.listeners.chainChanged(p.chain); await Promise.resolve() }); assert.equal(Boolean(ui.alert()), false)
    await act(async () => { p.account = other; p.listeners.accountsChanged([other]); await Promise.resolve() }); assert.match(ui.doc.querySelector('.wallet').textContent, /0x2222/)
    await act(async () => { p.authorised = false; p.listeners.accountsChanged([]); await Promise.resolve() }); assert.equal(ui.doc.querySelector('.wallet').textContent, 'Connect Wallet')
    await ui.click('Connect Wallet'); await settle(() => ui.doc.querySelector('.wallet').textContent.includes('0x2222'), timers); assert.equal(Boolean(ui.alert()), false)
  } finally { await ui.close() }
})
test('actual App: MetaMask supported Snap path and unsupported-capability fallback both finish without false alerts', async t => {
  const timers = fakeTimers(t)
  for (const supported of [true, false]) {
    const p = mockProvider({ isMetaMask: true }); p.snapSupported = supported
    const ui = await mount({ timers, provider: p })
    try {
      await settle(() => loaded(ui), timers); await ui.click('Connect Wallet'); await settle(() => ui.doc.querySelector('.wallet').textContent.includes('0x1111'), timers)
      assert.equal(Boolean(ui.alert()), false); assert.ok(p.calls.includes('wallet_getSnaps')); assert.equal(p.calls.includes('wallet_requestSnaps'), supported)
    } finally { await ui.close() }
  }
})
test('actual App: rejected wallet request remains visible, later successful connection clears stale error', async t => {
  const timers = fakeTimers(t)
  const p = mockProvider(), ui = await mount({ timers, provider: p }); p.reject = true
  try {
    await settle(() => loaded(ui), timers); await ui.click('Connect Wallet'); await settle(() => ui.alert(), timers); assert.match(ui.alert().textContent, /rejected/)
    p.reject = false; await ui.click('Connect Wallet'); await settle(() => ui.doc.querySelector('.wallet').textContent.includes('0x1111'), timers); assert.equal(Boolean(ui.alert()), false)
  } finally { await ui.close() }
})

test('actual initial load: exhausted four-read retry shows neutral reconnecting then recovers without clicking Refresh', async t => {
  const timers = fakeTimers(t), ui = await mount({ timers, failures: 4 })
  try {
    assert.match(ui.text(), /Connecting to Studio/)
    await settle(() => ui.text().includes('Reconnecting automatically'), timers)
    assert.equal(ui.network.calls, 4); assert.equal(Boolean(ui.alert()), false); assert.match(ui.doc.querySelector('[role="status"]').textContent, /Reconnecting automatically/)
    await settle(() => loaded(ui), timers, 180_000, () => assert.equal(Boolean(ui.alert()), false))
    assert.equal(ui.network.calls, 16); assert.equal(ui.doc.querySelectorAll('.watch-row').length, 5); assert.equal(Boolean(ui.alert()), false)
  } finally { await ui.close() }
})
test('actual StrictMode: two exhausted Dashboard attempts recover automatically through only one loop', async t => {
  const timers = fakeTimers(t), ui = await mount({ timers, failures: 8, delay: 10, strict: true })
  try {
    await settle(() => loaded(ui), timers, 180_000, () => assert.equal(Boolean(ui.alert()), false))
    assert.equal(ui.network.calls, 20); assert.equal(ui.network.peak, 1); assert.equal(ui.doc.querySelectorAll('.watch-row').length, 5)
    const calls = ui.network.calls; await advance(timers, 60_000); assert.equal(ui.network.calls, calls)
  } finally { await ui.close() }
})
test('actual Refresh: last-known-good rows remain throughout automatic recovery without a fatal banner', async t => {
  const timers = fakeTimers(t), ui = await mount({ timers })
  try {
    await settle(() => loaded(ui), timers); ui.network.failures = 8; await ui.click('Refresh')
    await settle(() => ui.text().includes('Reconnecting automatically'), timers)
    assert.equal(ui.doc.querySelectorAll('.watch-row').length, 5); assert.match(ui.text(), /Showing the last successfully read data/); assert.equal(Boolean(ui.alert()), false)
    await settle(() => loaded(ui), timers, 180_000, () => { assert.equal(ui.doc.querySelectorAll('.watch-row').length, 5); assert.equal(Boolean(ui.alert()), false) })
    assert.equal(ui.network.calls, 32)
  } finally { await ui.close() }
})
test('actual manual Refresh: supersedes a pending background retry and prevents a stale extra load', async t => {
  const timers = fakeTimers(t), ui = await mount({ timers, failures: 4 })
  try {
    await settle(() => ui.text().includes('Reconnecting automatically'), timers); await ui.click('Refresh')
    await settle(() => loaded(ui), timers); const calls = ui.network.calls
    assert.equal(calls, 16); await advance(timers, 60_000); assert.equal(ui.network.calls, calls); assert.equal(Boolean(ui.alert()), false)
  } finally { await ui.close() }
})
test('actual route unmount: pending Dashboard recovery is cancelled and issues no further reads', async t => {
  const timers = fakeTimers(t), ui = await mount({ timers, failures: 4 })
  try {
    await settle(() => ui.text().includes('Reconnecting automatically'), timers)
    const calls = ui.network.calls, link = ui.doc.querySelector('nav a[href="#/create"]'); assert.ok(link)
    await act(async () => { link.click(); await Promise.resolve() }); assert.match(ui.text(), /Create a Watch/)
    await advance(timers, 60_000); assert.equal(ui.network.calls, calls)
    assert.equal([...ui.doc.querySelectorAll('button')].find(b => b.textContent === 'ESTABLISH BASELINE').disabled, true)
  } finally { await ui.close() }
})

test('actual Dashboard HTTP 429: neutral cooldown, no rapid retries, automatic controlled recovery', async t => {
  const timers = fakeTimers(t), ui = await mount({ timers, rateFailures: 1, strict: true })
  try {
    await settle(() => ui.text().includes('rate-limiting reads'), timers)
    assert.equal(Boolean(ui.alert()), false); assert.equal(ui.network.calls, 1)
    await advance(timers, 9000); assert.equal(ui.network.calls, 1); assert.equal(Boolean(ui.alert()), false)
    await settle(() => loaded(ui), timers, 120_000, () => assert.equal(Boolean(ui.alert()), false))
    assert.equal(ui.network.calls, 13); assert.equal(ui.network.peak, 1)
  } finally { await ui.close() }
})
test('actual hard reload restores stamped cache, revalidates in background, and manual Refresh cancels deferred load', async t => {
  const timers = fakeTimers(t), first = await mount({ timers })
  let session
  try { await settle(() => loaded(first), timers); session = first.session(); assert.equal(first.network.calls, 12) } finally { await first.close() }
  const ui = await mount({ timers, session })
  try {
    assert.equal(ui.doc.querySelectorAll('.watch-row').length, 5); assert.match(ui.text(), /Cached snapshot.*Last synced/); assert.equal(ui.network.calls, 0)
    await ui.click('Refresh')
    await settle(() => loaded(ui), timers, 120_000, () => { assert.equal(ui.doc.querySelectorAll('.watch-row').length, 5); assert.equal(Boolean(ui.alert()), false) })
    assert.equal(ui.network.calls, 12); assert.doesNotMatch(ui.text(), /Cached snapshot/)
    const calls = ui.network.calls; await advance(timers, 60_000); assert.equal(ui.network.calls, calls)
  } finally { await ui.close() }
})
test('actual optional Semantic Changes failure leaves Watches rendered and unknown metric honest', async t => {
  const timers = fakeTimers(t), ui = await mount({ timers })
  try {
    await settle(() => loaded(ui), timers); assert.equal(ui.network.calls, 12)
    assert.match(ui.text(), /Semantic Changes—/); ui.network.failHistoryId = 5
    await ui.click('Load semantic metrics')
    await settle(() => !ui.text().includes('Loading history metrics'), timers, 120_000)
    assert.equal(ui.doc.querySelectorAll('.watch-row').length, 5); assert.equal(Boolean(ui.alert()), false); assert.match(ui.text(), /Semantic Changes—/)
  } finally { await ui.close() }
})

test('actual cached hard reload automatically revalidates without a manual Refresh', async t => {
  const timers = fakeTimers(t), first = await mount({ timers })
  let session
  try { await settle(() => loaded(first), timers); session = first.session() } finally { await first.close() }
  const ui = await mount({ timers, session })
  try {
    assert.match(ui.text(), /Cached snapshot/); assert.equal(ui.network.calls, 0)
    await advance(timers, 10_000); assert.equal(ui.network.calls, 0)
    await settle(() => loaded(ui), timers, 120_000, () => { assert.equal(ui.doc.querySelectorAll('.watch-row').length, 5); assert.equal(Boolean(ui.alert()), false) })
    assert.equal(ui.network.calls, 12); assert.doesNotMatch(ui.text(), /Cached snapshot/); assert.match(ui.text(), /Last synced/)
  } finally { await ui.close() }
})
