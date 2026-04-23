/**
 * Pull a user-presentable error message out of an arbitrary fetch response body.
 *
 * Our API conventionally returns `{ error: string }` on failure. Callers receive
 * `unknown` from `response.json()`, so this helper safely narrows the body and
 * falls back to a caller-supplied default when the shape doesn't match.
 */
export function extractErrorMessage(body: unknown, fallback: string): string {
  if (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof (body as { error: unknown }).error === 'string'
  ) {
    return (body as { error: string }).error
  }
  return fallback
}
