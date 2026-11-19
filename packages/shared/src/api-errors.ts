import { z } from 'zod'

/**
 * The one error shape every failed API request answers with (PLAT-15): a message safe to show the
 * user, a stable machine-readable code, and the request id that matches the server's log lines
 * (absent only when a response is built outside a request).
 */
export const apiErrorResponseSchema = z.object({
  error: z.string(),
  code: z.string(),
  requestId: z.string().optional(),
})

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>

/**
 * Pull a user-presentable error message out of an arbitrary fetch response body.
 *
 * The API returns `ApiErrorResponse` on failure. Callers receive
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
