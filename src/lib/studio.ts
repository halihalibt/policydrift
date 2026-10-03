import { createHttpViewClient } from './read-transport'
import { createReadScheduler, sessionStore } from './read-scheduler'
import { createClient } from 'genlayer-js'
import { studionet } from 'genlayer-js/chains'
import { TransactionStatus } from 'genlayer-js/types'
import type { TransactionHash } from 'genlayer-js/types'
import type { Baseline, Observation, Watch } from './semantic'
import { classifyTransaction, submitOnceAndTrack } from './transactions'
import { createContractReader, retryTransientRead } from './rpc'
import { assertChain, connectInjectedWallet, submissionProvider } from './wallet'
import type { Wallet } from './wallet'
import type { StudioTransaction, TransactionProgress } from './transactions'
import { TransactionReviewError } from './errors'
export { isFinalSuccess } from './transactions'
export type { TransactionProgress } from './transactions'

export const STUDIO_API = 'https://studio.genlayer.com/api'
export const STUDIO_CHAIN_ID = 61999
export const CONTRACT_ADDRESS = '0x4bBF1Eaa4947686F2291605Caf1DC4e19F55C3C2' as const
export const CONTRACT_EXPLORER = `https://explorer-studio.genlayer.com/address/${CONTRACT_ADDRESS}`
if (studionet.id !== STUDIO_CHAIN_ID || studionet.rpcUrls.default.http[0] !== STUDIO_API) {
  throw new Error('Installed genlayer-js Studio configuration differs from the frozen network')
}

declare global { interface Window { ethereum?: Wallet } }

export const reader = createClient({ chain: studionet })

export function walletProvider(): Wallet {
  if (!window.ethereum) throw new Error('No injected EIP-1193 wallet found. Install or enable a compatible wallet.')
  return window.ethereum
}

export async function connectWallet(): Promise<string> {
  const provider = walletProvider()
  return connectInjectedWallet(provider, studionet,
    async () => { await createClient({ chain: studionet, provider }).connect('studionet') },
    async account => {
      const client = createClient({ chain: studionet, account: account as `0x${string}`, provider })
      // Read-only SDK provider routing plus a public finalized contract read; never sign here.
      const accounts = await client.request({ method: 'eth_accounts' })
      await protocolVersion()
      return accounts
    })
}
export async function assertStudioNetwork(provider = walletProvider()): Promise<void> {
  assertChain(await provider.request({ method: 'eth_chainId' }), studionet)
}
export const viewScheduler = createReadScheduler({ storage: sessionStore, key: `policydrift-reads-${STUDIO_CHAIN_ID}-${CONTRACT_ADDRESS}` })
const read = createContractReader(createHttpViewClient(STUDIO_API, viewScheduler), CONTRACT_ADDRESS, { scheduler: viewScheduler })

export const protocolVersion = (signal?: AbortSignal) => read<string>('get_protocol_version', [], signal)
export const watchCount = (signal?: AbortSignal) => read<number>('get_watch_count', [], signal)
export const getWatch = (id: number, signal?: AbortSignal) => read<Watch>('get_watch', [id], signal)
export const getActiveBaseline = (id: number, signal?: AbortSignal) => read<Baseline>('get_active_baseline', [id], signal)
export const getBaseline = (id: number, signal?: AbortSignal) => read<Baseline>('get_baseline', [id], signal)
export const getObservation = (id: number, signal?: AbortSignal) => read<Observation>('get_observation', [id], signal)
export const getBaselineIds = (id: number, signal?: AbortSignal) => read<number[]>('get_watch_baseline_ids', [id], signal)
export const getObservationIds = (id: number, signal?: AbortSignal) => read<number[]>('get_watch_observation_ids', [id], signal)

export type WriteMethod = 'register_watch' | 'check_drift' | 'adopt_observation'

async function rawTransaction(hash: string): Promise<TransactionProgress> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error('Invalid transaction hash')
  const tx = await reader.getTransaction({ hash: hash as TransactionHash }) as StudioTransaction
  return classifyTransaction(tx, hash)
}
export async function transaction(hash: string): Promise<TransactionProgress> {
  return retryTransientRead(() => rawTransaction(hash), 'transaction status')
}
export async function writeAndFinalize(
  address: string, method: WriteMethod, args: (string | number)[],
  onProgress: (progress: TransactionProgress) => void,
): Promise<TransactionProgress> {
  const provider = walletProvider()
  await assertStudioNetwork(provider)
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error('Invalid wallet address')
  const client = createClient({ chain: studionet, account: address as `0x${string}`, provider: submissionProvider(provider) })
  const state = await submitOnceAndTrack(
    async () => await client.writeContract({ address: CONTRACT_ADDRESS, functionName: method, args, value: 0n }) as string,
    rawTransaction, onProgress,
  )
  if (state.status === 'FINALIZED') {
    try {
      await retryTransientRead(() => reader.waitForTransactionReceipt({ hash: state.hash as TransactionHash, status: TransactionStatus.FINALIZED, retries: 0 }), 'finalized receipt')
    } catch (cause) {
      throw new TransactionReviewError(`Transaction ${state.hash} reached FINALIZED, but its receipt could not be retrieved. Inspect Studio Explorer before any manual retry.`, { cause })
    }
  }
  return state
}

// Studio's gas quote is diagnostic; the SDK estimates exact encoded call gas again when sending.
export async function estimateNetworkGas(from: string): Promise<{ gas: bigint; gasPriceWei: bigint; maxWei: bigint }> {
  const gas = await reader.estimateTransactionGas({ from: from as `0x${string}`, to: CONTRACT_ADDRESS, data: '0x', value: 0n })
  const hex = await reader.request({ method: 'eth_gasPrice' }) as string
  const gasPriceWei = BigInt(hex)
  return { gas, gasPriceWei, maxWei: gas * gasPriceWei }
}
