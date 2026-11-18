import assert from 'node:assert/strict'
import test from 'node:test'

import { extractErrorMessage } from '../src/api-errors.js'

test('returns the body.error string when present', () => {
  assert.equal(
    extractErrorMessage({ error: 'Invite expired.' }, 'fallback'),
    'Invite expired.',
  )
})

test('falls back when body is null', () => {
  assert.equal(extractErrorMessage(null, 'fallback'), 'fallback')
})

test('falls back when body is not an object', () => {
  assert.equal(extractErrorMessage('oops', 'fallback'), 'fallback')
  assert.equal(extractErrorMessage(42, 'fallback'), 'fallback')
  assert.equal(extractErrorMessage(undefined, 'fallback'), 'fallback')
})

test('falls back when body lacks an error key', () => {
  assert.equal(extractErrorMessage({ message: 'nope' }, 'fallback'), 'fallback')
})

test('falls back when body.error is not a string', () => {
  assert.equal(extractErrorMessage({ error: 123 }, 'fallback'), 'fallback')
  assert.equal(
    extractErrorMessage({ error: { nested: true } }, 'fallback'),
    'fallback',
  )
  assert.equal(extractErrorMessage({ error: null }, 'fallback'), 'fallback')
})

test('preserves an empty error string verbatim', () => {
  // Caller intent: surface whatever the server sent, including empty string.
  assert.equal(extractErrorMessage({ error: '' }, 'fallback'), '')
})
