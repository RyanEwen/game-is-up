/**
 * The zod setup applied on load: outside a browser (the API) zod keeps its generated fast
 * parsers, and the schemas still parse. In a browser `validation-config.ts` turns on `jitless`.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { config } from 'zod'
import { playIntentFriendInviteRequestSchema } from '../src/index.js'

test('outside a browser zod keeps its fast parsers and schemas still parse', () => {
  assert.notEqual(config().jitless, true)
  assert.deepEqual(
    playIntentFriendInviteRequestSchema.parse({
      friendUserId: '33333333-3333-4333-8333-333333333333',
    }),
    { friendUserId: '33333333-3333-4333-8333-333333333333' },
  )
})
