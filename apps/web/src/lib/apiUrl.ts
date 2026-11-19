// `import.meta.env` exists only under Vite; Node's test runner imports this module without it.
const configuredApiBaseUrl = import.meta.env?.VITE_API_BASE_URL?.trim()
const apiBaseUrl =
  configuredApiBaseUrl != null ? configuredApiBaseUrl.replace(/\/$/, '') : ''

/**
 * Resolve a relative API path against the configured `VITE_API_BASE_URL`. When
 * no base URL is configured we either return the path as-is (SSR / non-browser
 * contexts) or resolve it against the current window origin.
 */
export function buildApiUrl(path: string): string {
  if (!apiBaseUrl) {
    if (typeof window === 'undefined') {
      return path
    }

    return new URL(path, window.location.origin).toString()
  }

  return `${apiBaseUrl}${path}`
}

/**
 * Resolve a relative API path to an absolute URL string, falling back to the
 * relative form when no `window` is available. Use this when the caller must
 * hand the URL to an external system (e.g. an OAuth `returnTo` redirect).
 */
export function buildAbsoluteApiUrl(path: string): string {
  if (typeof window !== 'undefined') {
    return new URL(buildApiUrl(path), window.location.origin).toString()
  }

  return buildApiUrl(path)
}
