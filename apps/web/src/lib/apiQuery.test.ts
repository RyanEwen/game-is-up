/** Unit tests for the shared API request helper behind every query and mutation. */
import assert from 'node:assert/strict'
import test, { afterEach, mock } from 'node:test'
import { ApiError, apiRequest, noResponseBody } from './apiQuery'

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
    /^ApiError: Unable to load\.$/,
  )
})

test('an error response carries its HTTP status', async () => {
  stubFetch(404, { error: 'Not found.' })
  await assert.rejects(
    apiRequest('/api/x', numberBody, 'fallback'),
    (error: unknown) => error instanceof ApiError && error.status === 404,
  )
})

test('a body that does not match the schema fails loudly, keeping the schema error', async () => {
  stubFetch(200, { n: 'three' })
  await assert.rejects(
    apiRequest('/api/x', numberBody, 'fallback'),
    (error: Error) => {
      assert.match(error.message, /Could not parse the API response/)
      assert.match(String((error.cause as Error).message), /bad shape/)
      return true
    },
  )
})

test('a success that is not JSON is an invalid response, but a no-body endpoint is fine', async () => {
  mock.method(
    globalThis,
    'fetch',
    async () => new Response('<!doctype html>', { status: 200 }),
  )
  await assert.rejects(
    apiRequest('/api/x', numberBody, 'fallback'),
    /Could not parse the API response as JSON/,
  )
  assert.equal(
    await apiRequest('/api/x', noResponseBody, 'fallback'),
    undefined,
  )
})
