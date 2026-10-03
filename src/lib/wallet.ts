import { classifyError, explainError, recordDiagnostic } from './errors.ts'
export type Wallet = {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>
  isMetaMask?: boolean; isOkxWallet?: boolean; isOKXWallet?: boolean; isRabby?: boolean; isCoinbaseWallet?: boolean
  on?(event: string, listener: (value: unknown) => void): void
  removeListener?(event: string, listener: (value: unknown) => void): void
}
type Chain = { id: number; name: string; rpcUrls: { default: { http: readonly string[] } }; nativeCurrency: { name: string; symbol: string; decimals: number }; blockExplorers?: { default: { url: string } } }
export function accountFrom(value: unknown): string {
  const address = Array.isArray(value) ? value[0] : undefined
  return typeof address === 'string' && /^0x[0-9a-fA-F]{40}$/.test(address) ? address : ''
}
export function assertChain(value: unknown, chain: Chain) {
  if (typeof value !== 'string' || !/^0x[0-9a-f]+$/i.test(value) || BigInt(value) !== BigInt(chain.id)) {
    throw new Error(`Wallet is on chain ${String(value)}; switch to Studionet (chain ${chain.id})`)
  }
}
export async function ensureChain(provider: Wallet, chain: Chain) {
  const hex = `0x${chain.id.toString(16)}`
  const current = await provider.request({ method: 'eth_chainId' })
  if (typeof current === 'string' && current.toLowerCase() === hex) return
  try { await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] }) }
  catch (error) {
    if (!error || typeof error !== 'object' || Number((error as { code?: unknown }).code) !== 4902) throw error
    await provider.request({ method: 'wallet_addEthereumChain', params: [{
      chainId: hex, chainName: chain.name, rpcUrls: [...chain.rpcUrls.default.http], nativeCurrency: chain.nativeCurrency,
      ...(chain.blockExplorers ? { blockExplorerUrls: [chain.blockExplorers.default.url] } : {}),
    }] })
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] })
  }
  assertChain(await provider.request({ method: 'eth_chainId' }), chain)
}
export async function connectInjectedWallet(provider: Wallet, chain: Chain,
  snapConnect: () => Promise<void>, verifyClient: (account: string) => Promise<unknown>): Promise<string> {
  const account = accountFrom(await provider.request({ method: 'eth_requestAccounts' }))
  if (!account) throw new Error('Wallet did not return a valid address')
  const metaMaskCandidate = provider.isMetaMask === true && !provider.isOkxWallet && !provider.isOKXWallet && !provider.isRabby && !provider.isCoinbaseWallet
  if (metaMaskCandidate) {
    let supportsSnaps = true
    try { await provider.request({ method: 'wallet_getSnaps' }) }
    catch (error) {
      // Some injected providers advertise isMetaMask without implementing Snaps.
      if (classifyError(error) !== 'WALLET_CAPABILITY_UNSUPPORTED') throw error
      recordDiagnostic('Optional Snap capability unavailable; verifying EIP-1193 path', error)
      supportsSnaps = false
    }
    if (supportsSnaps) await snapConnect() // Actual SDK 1.1.8 installs the official Snap when necessary.
    else await ensureChain(provider, chain)
  } else await ensureChain(provider, chain)
  assertChain(await provider.request({ method: 'eth_chainId' }), chain)
  const authorised = accountFrom(await provider.request({ method: 'eth_accounts' }))
  if (!authorised || authorised.toLowerCase() !== account.toLowerCase()) throw new Error('Wallet account changed during connection. Reconnect.')
  const clientAccount = accountFrom(await verifyClient(account))
  if (clientAccount.toLowerCase() !== account.toLowerCase()) throw new Error('SDK provider account could not be verified. Reconnect.')
  // Verification can take time; reject an account/network change during that read.
  assertChain(await provider.request({ method: 'eth_chainId' }), chain)
  if (accountFrom(await provider.request({ method: 'eth_accounts' })).toLowerCase() !== account.toLowerCase()) throw new Error('Wallet account changed during connection. Reconnect.')
  return account
}
export type WalletState = { account: string; error: string }
export function observeWallet(provider: Wallet, chain: Chain, update: (state: WalletState) => void) {
  let sequence = 0, closed = false
  async function refresh(accountsOverride?: unknown, chainOverride?: unknown) {
    const request = ++sequence
    try {
      const accounts = accountsOverride ?? await provider.request({ method: 'eth_accounts' })
      const account = accountFrom(accounts)
      if (!account) { if (!closed && request === sequence) update({ account: '', error: '' }); return }
      const activeChain = chainOverride ?? await provider.request({ method: 'eth_chainId' })
      assertChain(activeChain, chain)
      if (!closed && request === sequence) update({ account, error: '' })
    } catch (error) {
      recordDiagnostic('Wallet state', error)
      if (!closed && request === sequence) update({ account: '', error: explainError(error, 'Could not read wallet state. Reconnect.') })
    }
  }
  const accountsChanged = (value: unknown) => { void refresh(value) }
  const chainChanged = (value: unknown) => { void refresh(undefined, value) }
  provider.on?.('accountsChanged', accountsChanged)
  provider.on?.('chainChanged', chainChanged)
  void refresh()
  return () => {
    closed = true; sequence++
    provider.removeListener?.('accountsChanged', accountsChanged)
    provider.removeListener?.('chainChanged', chainChanged)
  }
}
/** Enforce one submission attempt even if an SDK fallback tries to send again. */
export function submissionProvider(provider: Wallet): Wallet {
  let attempted = false
  return { request: async args => {
    if (['eth_sendTransaction', 'eth_signTransaction', 'personal_sign', 'eth_signTypedData_v4'].includes(args.method)) {
      if (attempted) throw new Error('A transaction submission was already attempted. Inspect the wallet and Explorer before retrying manually.')
      attempted = true
    }
    return provider.request(args)
  } }
}
