/** Unit tests for the shared API request helper behind every query and mutation. */
import assert from 'node:assert/strict'
import test, { afterEach, mock } from 'node:test'
import { apiRequest } from './apiQuery'

const numberBody = {
  parse: (value: unknown) => {
    if (typeof (value as { n?: unknown })?.n !== 'number')
      throw new Error('bad shape')
    return value as { n: number }
  },
}

afterEach(() => {
  mock.restoreAll()
})

function stubFetch(status: number, body: unknown) {
  return mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  )
}

test('a good response is parsed and requests carry credentials and a JSON content type', async () => {
  const fetchMock = stubFetch(200, { n: 3 })
  const result = await apiRequest('/api/x', numberBody, 'fallback', {
    method: 'POST',
    body: '{}',
  })
  assert.deepEqual(result, { n: 3 })
  const [, init] = fetchMock.mock.calls[0]!.arguments as [string, RequestInit]
  assert.equal(init.credentials, 'include')
  assert.equal(
    new Headers(init.headers).get('Content-Type'),
    'application/json',
  )
})

test('an error response throws the server message, or the fallback without one', async () => {
  stubFetch(400, { error: 'That game is already in your library.' })
  await assert.rejects(
    apiRequest('/api/x', numberBody, 'fallback'),
    /already in your library/,
  )
  stubFetch(500, 'not json at all')
  await assert.rejects(
    apiRequest('/api/x', numberBody, 'Unable to load.'),
    /^Error: Unable to load\.$/,
  )
})

test('a body that does not match the schema fails loudly', async () => {
  stubFetch(200, { n: 'three' })
  await assert.rejects(
    apiRequest('/api/x', numberBody, 'fallback'),
    /bad shape/,
  )
})
