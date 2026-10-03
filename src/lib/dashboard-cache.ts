import type { DashboardData } from './dashboard.ts'
import { sessionStore } from './read-scheduler.ts'
import type { StorageLike } from './read-scheduler.ts'
export const DASHBOARD_CACHE_TTL_MS = 60_000
export const CACHE_REVALIDATION_GAP_MS = 30_000
export function createDashboardCache(key: string, storage: () => StorageLike | undefined = sessionStore, now = () => Date.now()) {
  function read(): DashboardData | undefined {
    try {
      const saved = JSON.parse(storage()?.getItem(key) ?? 'null')
      if (!saved || saved.schema !== 3 || !Number.isFinite(saved.at) || saved.at > now() || now() - saved.at >= DASHBOARD_CACHE_TTL_MS) return undefined
      const data = saved.data as DashboardData
      if (!data || data.partial || typeof data.version !== 'string' || !Number.isInteger(data.count) || data.count < 0 || !Array.isArray(data.rows) || data.rows.length > 5) return undefined
      const ids = new Set<number>()
      for (const row of data.rows) {
        if (!Number.isInteger(row.id) || row.id <= 0 || row.id > data.count || ids.has(row.id) || typeof row.watch?.target_question !== 'string' || typeof row.watch.source_url !== 'string' || !['active_baseline_id', 'last_observation_id', 'baseline_version', 'created_at', 'last_check_at', 'check_count'].every(key => Number.isInteger((row.watch as unknown as Record<string, unknown>)[key]) && Number((row.watch as unknown as Record<string, unknown>)[key]) >= 0) || (row.latest && (row.latest.watch_id !== row.id || !Number.isInteger(row.latest.verdict)))) return undefined
        ids.add(row.id)
      }
      return { ...data, cached: true, syncedAt: saved.at }
    } catch { return undefined }
  }
  function save(data: DashboardData) {
    if (data.partial) return
    try { storage()?.setItem(key, JSON.stringify({ schema: 3, at: data.syncedAt ?? now(), data: { ...data, cached: false } })) } catch { /* Optional UI continuity, never a source of contract/write authority. */ }
  }
  return { read, save }
}
