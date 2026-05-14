import assert from 'node:assert/strict'
import test from 'node:test'

import {
  maximumPlayIntentGameSelectionCount,
  upsertPlayIntentRequestSchema
} from '../src/index.js'

const validRequest = {
  selectionMode: 'subset' as const,
  notifyScope: 'network' as const,
  durationMinutes: 60,
  gameIds: ['11111111-1111-4111-8111-111111111111']
}

test('upsertPlayIntentRequestSchema requires selected-games mode', () => {
  const result = upsertPlayIntentRequestSchema.safeParse({
    ...validRequest,
    selectionMode: 'library'
  })

  assert.equal(result.success, false)
})

test('upsertPlayIntentRequestSchema requires at least one selected game', () => {
  const result = upsertPlayIntentRequestSchema.safeParse({
    ...validRequest,
    gameIds: []
  })

  assert.equal(result.success, false)
})

test('upsertPlayIntentRequestSchema caps selected games at five', () => {
  const gameIds = Array.from({ length: maximumPlayIntentGameSelectionCount + 1 }, (_, index) => {
    const suffix = String(index + 1).padStart(12, '0')

    return `11111111-1111-4111-8111-${suffix}`
  })
  const result = upsertPlayIntentRequestSchema.safeParse({
    ...validRequest,
    gameIds
  })

  assert.equal(result.success, false)
})