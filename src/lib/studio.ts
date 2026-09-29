import { createClient } from 'genlayer-js'
import { studionet } from 'genlayer-js/chains'
import { TransactionHashVariant, TransactionStatus } from 'genlayer-js/types'
import type { TransactionHash } from 'genlayer-js/types'
import type { Baseline, Observation, Watch } from './semantic'
import { classifyTransaction } from './transactions'
import type { StudioTransaction, TransactionProgress } from './transactions'
export { isFinalSuccess } from './transactions'
export type { TransactionProgress } from './transactions'

export const STUDIO_API = 'https://studio.genlayer.com/api'
export const STUDIO_CHAIN_ID = 61999
export const CONTRACT_ADDRESS = '0x4bBF1Eaa4947686F2291605Caf1DC4e19F55C3C2' as const
export const CONTRACT_EXPLORER = `https://explorer-studio.genlayer.com/address/${CONTRACT_ADDRESS}`
const chainHex = `0x${STUDIO_CHAIN_ID.toString(16)}`

if (studionet.id !== STUDIO_CHAIN_ID || studionet.rpcUrls.default.http[0] !== STUDIO_API) {
  throw new Error('Installed genlayer-js Studio configuration differs from the frozen network')
}

type Wallet = {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>
  on?(event: string, listener: (value: unknown) => void): void
  removeListener?(event: string, listener: (value: unknown) => void): void
}
declare global { interface Window { ethereum?: Wallet } }

export const reader = createClient({ chain: studionet })

export function walletProvider(): Wallet {
  if (!window.ethereum) throw new Error('No injected MetaMask wallet found in this browser')
  return window.ethereum
}

export async function connectWallet(): Promise<string> {
  const provider = walletProvider()
  const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[]
  if (!accounts[0]) throw new Error('Wallet did not return an address')
  const client = createClient({ chain: studionet, account: accounts[0] as `0x${string}`, provider })
  await client.connect('studionet') // Studio chain switch/add and the official GenLayer MetaMask Snap.
  await assertStudioNetwork(provider)
  return accounts[0]
}

export async function assertStudioNetwork(provider = walletProvider()): Promise<void> {
  const activeChain = await provider.request({ method: 'eth_chainId' }) as string
  if (activeChain.toLowerCase() !== chainHex) throw new Error(`Wallet is on chain ${activeChain}; Studio requires ${chainHex}`)
}

async function read<T>(method: string, args: number[] = []): Promise<T> {
  return await reader.readContract({
    address: CONTRACT_ADDRESS, functionName: method, args,
    transactionHashVariant: TransactionHashVariant.LATEST_FINAL, jsonSafeReturn: true,
  }) as T
}

export const protocolVersion = () => read<string>('get_protocol_version')
export const watchCount = () => read<number>('get_watch_count')
export const getWatch = (id: number) => read<Watch>('get_watch', [id])
export const getActiveBaseline = (id: number) => read<Baseline>('get_active_baseline', [id])
export const getBaseline = (id: number) => read<Baseline>('get_baseline', [id])
export const getObservation = (id: number) => read<Observation>('get_observation', [id])
export const getBaselineIds = (id: number) => read<number[]>('get_watch_baseline_ids', [id])
export const getObservationIds = (id: number) => read<number[]>('get_watch_observation_ids', [id])

export type WriteMethod = 'register_watch' | 'check_drift' | 'adopt_observation'

export async function transaction(hash: string): Promise<TransactionProgress> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error('Invalid transaction hash')
  const tx = await reader.getTransaction({ hash: hash as TransactionHash }) as StudioTransaction
  return classifyTransaction(tx, hash)
}

export async function writeAndFinalize(
  address: string, method: WriteMethod, args: (string | number)[],
  onProgress: (progress: TransactionProgress) => void,
): Promise<TransactionProgress> {
  const provider = walletProvider()
  await assertStudioNetwork(provider)
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error('Invalid wallet address')
  const client = createClient({ chain: studionet, account: address as `0x${string}`, provider })
  const hash = await client.writeContract({ address: CONTRACT_ADDRESS, functionName: method, args, value: 0n }) as string
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error(`Wallet returned an invalid transaction hash: ${hash}`)
  onProgress({ hash, status: 'SUBMITTED', consensus: 'PENDING', execution: 'PENDING' })

  for (let attempt = 0; attempt < 180; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 3000))
    let state: TransactionProgress
    try { state = await transaction(hash) }
    catch (error) {
      if (attempt >= 5) throw error
      continue // Studio may not expose the submitted hash on the first few polls.
    }
    onProgress(state)
    if (state.status === 'FINALIZED') {
      // The SDK defaults to ACCEPTED; force FINALIZED even after an Undetermined decision.
      await reader.waitForTransactionReceipt({ hash: hash as TransactionHash, status: TransactionStatus.FINALIZED, retries: 0 })
      return state
    }
    if (state.status === 'CANCELED') return state
  }
  throw new Error(`Finalization timed out for ${hash}; inspect it in Studio Explorer`)
}

// Studio's gas quote is diagnostic; the SDK estimates exact encoded call gas again when sending.
export async function estimateNetworkGas(from: string): Promise<{ gas: bigint; gasPriceWei: bigint; maxWei: bigint }> {
  const gas = await reader.estimateTransactionGas({ from: from as `0x${string}`, to: CONTRACT_ADDRESS, data: '0x', value: 0n })
  const hex = await reader.request({ method: 'eth_gasPrice' }) as string
  const gasPriceWei = BigInt(hex)
  return { gas, gasPriceWei, maxWei: gas * gasPriceWei }
}
