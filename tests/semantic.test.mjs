import { test } from 'node:test'
import assert from 'node:assert/strict'
import { changeFlags, disposition, driftVerdict, isAdoptable, presence, semanticRelation, sourceStatus } from '../src/lib/semantic.ts'

test('frozen enums decode all four semantic axes and source status', () => {
  assert.equal(sourceStatus(3), 'TOO_LARGE')
  assert.equal(presence(2), 'NOT_STATED')
  assert.equal(disposition(3), 'REQUIRED')
  assert.equal(semanticRelation(6), 'REDUCED')
  assert.equal(driftVerdict(4), 'UNVERIFIABLE')
  assert.equal(presence(9), 'UNKNOWN_9')
})

test('u32 material flag parsing preserves simultaneous and unknown bits', () => {
  assert.deepEqual(changeFlags(0), [])
  assert.deepEqual(changeFlags((1 << 0) | (1 << 5) | (1 << 12)), [
    'RULE_APPEARED', 'CONDITION_CHANGED', 'QUANTITATIVE_TERM_CHANGED',
  ])
  assert.deepEqual(changeFlags(0x80000000), ['UNKNOWN_BITS_0x80000000'])
  assert.throws(() => changeFlags(0x100000000), /Invalid u32/)
})

test('adoption guard requires the latest material observation on the active baseline', () => {
  const watch = { active_baseline_id: 4, last_observation_id: 9 }
  const observation = { watch_id: 2, baseline_id: 4, verdict: 2, source_status: 1, current_presence: 1 }
  assert.equal(isAdoptable(2, 9, watch, observation), true)
  assert.equal(isAdoptable(2, 8, watch, observation), false)
  assert.equal(isAdoptable(2, 9, watch, { ...observation, verdict: 1 }), false)
  assert.equal(isAdoptable(2, 9, watch, { ...observation, baseline_id: 3 }), false)
})
