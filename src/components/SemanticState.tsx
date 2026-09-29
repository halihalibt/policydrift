import { disposition, presence } from '../lib/semantic'
import type { SemanticSnapshot } from '../lib/semantic'

export function SemanticState({ state }: { state: SemanticSnapshot }) {
  return <dl className="semantic-list">
    <dt>Presence</dt><dd><span className="badge">{presence(state.presence)}</span></dd>
    <dt>Disposition</dt><dd><span className="badge">{disposition(state.disposition)}</span></dd>
    <dt>Conditions</dt><dd>{state.conditions}</dd>
    <dt>Scope</dt><dd>{state.scope}</dd>
    <dt>Exceptions</dt><dd>{state.exceptions}</dd>
    <dt>Quantitative Terms</dt><dd>{state.quantitative_terms}</dd>
    <dt>Semantic Digest</dt><dd className="mono digest">{state.semantic_digest || 'Unavailable'}</dd>
  </dl>
}
