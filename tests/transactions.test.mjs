import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyTransaction, isFinalSuccess } from '../src/lib/transactions.ts'

const hash = '0x' + 'a'.repeat(64)
const receipt = (execution_result, status = 'return', readable = '9') => ({
  execution_result, result: { status, payload: { readable } },
})

test('Studio finalized majority agreement with a successful leader is success and carries the returned ID', () => {
  const result = classifyTransaction({
    status: 7, statusName: 'FINALIZED', result_name: 'MAJORITY_AGREE',
    consensus_data: { leader_receipt: [receipt('SUCCESS')] },
  }, hash)
  assert.equal(isFinalSuccess(result), true)
  assert.equal(result.returnedId, 9)
})

test('finalized disagreement stays undetermined despite successful GenVM execution', () => {
  const result = classifyTransaction({
    status: 7, statusName: 'FINALIZED', result_name: 'MAJORITY_DISAGREE',
    consensus_data: { leader_receipt: [receipt('SUCCESS')] },
  }, hash)
  assert.equal(isFinalSuccess(result), false)
})

test('accepted without finalization and GenVM errors never count as success', () => {
  const accepted = classifyTransaction({
    statusName: 'ACCEPTED', result_name: 'MAJORITY_AGREE',
    consensus_data: { leader_receipt: [receipt('SUCCESS')] },
  }, hash)
  const failed = classifyTransaction({
    statusName: 'FINALIZED', result_name: 'MAJORITY_AGREE',
    consensus_data: { leader_receipt: [receipt('ERROR', 'error', 'PD006 NOT_WATCH_OWNER')] },
  }, hash)
  assert.equal(isFinalSuccess(accepted), false)
  assert.equal(isFinalSuccess(failed), false)
  assert.equal(failed.error, 'PD006 NOT_WATCH_OWNER')
})
