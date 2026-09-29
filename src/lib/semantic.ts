// On-chain u8/u32 protocol values from the frozen SemanticDriftRegistry.
const sourceStatuses = ['UNSET', 'OK', 'UNAVAILABLE', 'TOO_LARGE'] as const
const presences = ['UNSET', 'PRESENT', 'NOT_STATED', 'AMBIGUOUS'] as const
const dispositions = ['NONE', 'ALLOWED', 'PROHIBITED', 'REQUIRED'] as const
const relations = ['NOT_APPLICABLE', 'SAME', 'ADDED', 'REMOVED', 'CHANGED', 'EXPANDED', 'REDUCED', 'AMBIGUOUS'] as const
const verdicts = ['UNSET', 'NO_MATERIAL_DRIFT', 'MATERIAL_DRIFT', 'AMBIGUOUS', 'UNVERIFIABLE'] as const

const materialFlags = [
  'RULE_APPEARED', 'RULE_DISAPPEARED', 'DISPOSITION_CHANGED',
  'CONDITION_ADDED', 'CONDITION_REMOVED', 'CONDITION_CHANGED',
  'SCOPE_EXPANDED', 'SCOPE_REDUCED', 'SCOPE_CHANGED',
  'EXCEPTION_ADDED', 'EXCEPTION_REMOVED', 'EXCEPTION_CHANGED',
  'QUANTITATIVE_TERM_CHANGED',
] as const

function enumValue<T extends readonly string[]>(values: T, raw: number): T[number] | string {
  return values[raw] ?? `UNKNOWN_${raw}`
}

export const sourceStatus = (raw: number) => enumValue(sourceStatuses, raw)
export const presence = (raw: number) => enumValue(presences, raw)
export const disposition = (raw: number) => enumValue(dispositions, raw)
export const semanticRelation = (raw: number) => enumValue(relations, raw)
export const driftVerdict = (raw: number) => enumValue(verdicts, raw)

export function changeFlags(value: number): string[] {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new Error('Invalid u32 change_flags')
  const unsigned = value >>> 0
  const active = materialFlags.filter((_, bit) => (unsigned & (1 << bit)) !== 0)
  const unknown = (unsigned & ~((1 << materialFlags.length) - 1)) >>> 0
  return [...active, ...(unknown ? [`UNKNOWN_BITS_0x${unknown.toString(16)}`] : [])]
}

export type Watch = {
  owner: string; source_url: string; target_question: string; active_baseline_id: number
  baseline_version: number; created_at: number; last_check_at: number; baseline_count: number
  observation_count: number; check_count: number; last_observation_id: number
  last_observation_fingerprint: string
}

export type Baseline = {
  watch_id: number; version: number; created_at: number; created_by: string
  origin_observation_id: number; presence: number; disposition: number
  conditions: string; scope: string; exceptions: string; quantitative_terms: string
  evidence_excerpt: string; semantic_digest: string
}

export type Observation = {
  watch_id: number; baseline_id: number; checked_at: number; checked_by: string
  source_status: number; verdict: number; change_flags: number
  current_presence: number; current_disposition: number
  condition_relation: number; scope_relation: number; exception_relation: number; quantitative_relation: number
  current_conditions: string; current_scope: string; current_exceptions: string
  current_quantitative_terms: string; evidence_excerpt: string; semantic_digest: string
}

export function isAdoptable(watchId: number, observationId: number, watch: Watch, observation: Observation): boolean {
  return observation.watch_id === watchId
    && watch.last_observation_id === observationId
    && observation.baseline_id === watch.active_baseline_id
    && observation.verdict === 2 && observation.source_status === 1
    && (observation.current_presence === 1 || observation.current_presence === 2)
}
