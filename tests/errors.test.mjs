import { test } from 'node:test'
import assert from 'node:assert/strict'
import { explainError } from '../src/lib/errors.ts'

test('plain wallet rejection objects show a useful message', () => {
  assert.equal(explainError({ code: 4001, message: '[object Object]' }), 'Wallet request was rejected')
  assert.equal(explainError({ error: { message: 'Snap unavailable' } }), 'Snap unavailable')
  assert.equal(explainError({}), 'Operation failed')
  assert.equal(explainError(new Error('Network switch failed')), 'Network switch failed')
})
