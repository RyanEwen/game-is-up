/**
 * The one way the app calls its API for TanStack Query: a same-origin, cookie-carrying fetch
 * whose JSON is checked against the shared schema. A non-OK response throws an `Error` with
 * the server's message (`extractErrorMessage`), or the caller's fallback when there is none. A
 * success whose body is not JSON, or does not match the schema, throws a "could not parse" error
 * (the schema's error is kept as its `cause`).
 */
import { extractErrorMessage } from '@game-is-up/shared'
import { buildApiUrl } from './apiUrl'

/** Anything with a zod-style `parse`; the shared schemas all qualify. */
export interface ResponseParser<T> {
  parse: (value: unknown) => T
}

/** For endpoints that answer with no body (204) or one the caller does not read. */
export const noResponseBody: ResponseParser<void> = {
  parse: () => undefined,
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

  let body: unknown = null
  let bodyIsJson = true
  try {
    body = await response.json()
  } catch {
    bodyIsJson = false
  }

  if (!response.ok) {
    throw new Error(extractErrorMessage(body, fallbackError))
  }

  // A success that is not the expected JSON (for example an HTML page from a proxy) is an
  // invalid API response; the message says "parse" so the dashboard's notice reads that way.
  if (!bodyIsJson && schema !== noResponseBody) {
    throw new Error('Could not parse the API response as JSON.')
  }

  try {
    return schema.parse(body)
  } catch (error) {
    throw new Error(
      'Could not parse the API response into the expected shape.',
      {
        cause: error,
      },
    )
  }
}
