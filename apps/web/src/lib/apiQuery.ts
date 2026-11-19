/**
 * The one way the app calls its API for TanStack Query: a same-origin, cookie-carrying fetch
 * whose JSON is checked against the shared schema. A non-OK response throws an `Error` with
 * the server's message (`extractErrorMessage`), or the caller's fallback when there is none.
 */
import { extractErrorMessage } from '@game-is-up/shared'
import { buildApiUrl } from './apiUrl'

/** Anything with a zod-style `parse`; the shared schemas all qualify. */
export interface ResponseParser<T> {
  parse: (value: unknown) => T
}

/**
 * Fetch an API path and return its parsed body.
 * @param path API path, such as `/api/library/me`.
 * @param schema Parses the JSON body; a mismatch throws, so a contract drift fails loudly.
 * @param fallbackError Message used when an error response carries none of its own.
 * @param init Extra fetch options: method, body, headers. JSON bodies get their content type.
 */
export async function apiRequest<T>(
  path: string,
  schema: ResponseParser<T>,
  fallbackError: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers)
  if (typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(buildApiUrl(path), {
    ...init,
    headers,
    credentials: 'include',
  })

  const body: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(extractErrorMessage(body, fallbackError))
  }

  return schema.parse(body)
}
