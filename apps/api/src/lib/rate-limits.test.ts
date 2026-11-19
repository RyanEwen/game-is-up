/**
 * Unit test for the rate limits: past the budget a client gets 429 in the API's error shape with
 * the standard headers, and other clients (told apart by the proxy's forwarded address) keep theirs.
 */
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import express from 'express'
import { apiErrorResponseSchema } from '@game-is-up/shared'
import { signInLimit } from './rate-limits.js'

test('past the sign-in budget a client gets 429 in the error shape; another client does not', async (context) => {
  context.mock.method(console, 'warn', () => {})
  const app = express()
  app.set('trust proxy', 1)
  app.get('/sign-in', signInLimit, (_request, response) => {
    response.status(204).end()
  })
  const server = app.listen(0)
  context.after(() => server.close())
  const { port } = server.address() as AddressInfo

  /** One request as the given client, the way nginx forwards it. */
  const signIn = (client: string) =>
    fetch(`http://127.0.0.1:${port}/sign-in`, {
      headers: { 'X-Forwarded-For': client },
    })

  for (let attempt = 0; attempt < 30; attempt += 1) {
    assert.equal((await signIn('203.0.113.5')).status, 204)
  }

  const rejected = await signIn('203.0.113.5')
  assert.equal(rejected.status, 429)
  assert.ok(rejected.headers.get('ratelimit'))
  const body = apiErrorResponseSchema.parse(await rejected.json())
  assert.equal(body.code, 'rate_limited')

  assert.equal((await signIn('198.51.100.9')).status, 204)
})
