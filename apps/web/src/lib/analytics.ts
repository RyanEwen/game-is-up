/**
 * Loads the self-hosted, cookieless Umami tracker when the API says analytics is on
 * (`/api/bootstrap`; configured by UMAMI_SCRIPT_URL and UMAMI_WEBSITE_ID on the server).
 *
 * What reaches Umami is limited on purpose:
 * - Query strings and hashes are never sent (`data-exclude-search`, `data-exclude-hash`), so
 *   invite parameters, sign-in results and anything else in a query stays out.
 * - Every event passes through `sanitizeTrackedPayload` (`data-before-send`), which also drops
 *   them as a backstop and replaces path segments that identify something (a call to play's id,
 *   a long token) with `:id`, so `/play/<id>` is tracked as `/play/:id`. Referrers lose their
 *   query string too, and a page title is sent only when it is one of the app's fixed titles
 *   (a call to play's page carries the call's own title).
 * - Tracking runs only on the public host (`data-domains`) and honours Do Not Track.
 *
 * Umami calls `data-before-send` by the name of a function on `window`, so the sanitiser is
 * exposed under one namespaced property; nothing else is global.
 */
import {
  clientBootstrapSchema,
  type ClientAnalyticsConfig,
} from '@game-is-up/shared'
import type { QueryClient } from '@tanstack/react-query'
import { apiRequest } from './apiQuery'
import { queryKeys } from './queryKeys'

/** The window property Umami calls before sending each event. */
const beforeSendName = 'gamesUpAnalyticsBeforeSend'

/** A path segment that identifies one thing: a UUID, a long number or a long token. */
const identifyingSegment =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{6,}|[A-Za-z0-9_-]{20,})$/i

/**
 * Page titles that may be tracked: the app's fixed titles only. A call to play's page is titled
 * with the call's own (user-written) title, so any title not listed here is sent as the app name.
 * A page added later without being listed is tracked under the app name, never its own title.
 */
const trackableTitle =
  /^Game's Up(?: \u2022 (?:Home|Network|Friends|Library|Play|Discovery|Admin and Debug|Invite|Invite Accepted|Privacy))?$/

/** The title to track for a page: its own when it is one of the app's fixed titles. */
export function sanitizeTrackedTitle(title: string): string {
  return trackableTitle.test(title) ? title : "Game's Up"
}

/** The fields of an Umami event this app rewrites; the rest pass through unchanged. */
type TrackedPayload = {
  url?: string
  referrer?: string
  title?: string
  [key: string]: unknown
}

/**
 * A URL or path reduced to what may be tracked: no query string or hash, and identifying path
 * segments replaced with `:id`. A full URL keeps its origin.
 */
export function sanitizeTrackedUrl(value: string): string {
  const isAbsolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(value)
  const parsed = new URL(value, 'https://placeholder.invalid')
  const path = parsed.pathname
    .split('/')
    .map((segment) =>
      identifyingSegment.test(decodeURIComponent(segment)) ? ':id' : segment,
    )
    .join('/')

  return isAbsolute ? `${parsed.origin}${path}` : path
}

/**
 * Umami's before-send hook: the event with its URL and referrer sanitised. Returning the payload
 * sends it.
 */
export function sanitizeTrackedPayload(
  _type: string,
  payload: TrackedPayload,
): TrackedPayload {
  return {
    ...payload,
    ...(typeof payload.url === 'string'
      ? { url: sanitizeTrackedUrl(payload.url) }
      : {}),
    ...(typeof payload.referrer === 'string' && payload.referrer
      ? { referrer: sanitizeTrackedUrl(payload.referrer) }
      : {}),
    ...(typeof payload.title === 'string'
      ? { title: sanitizeTrackedTitle(payload.title) }
      : {}),
  }
}

/** The tracker's script element, with the privacy settings above. */
export function buildTrackerScript(
  config: ClientAnalyticsConfig,
  doc: Document = document,
): HTMLScriptElement {
  const script = doc.createElement('script')
  script.defer = true
  script.src = config.scriptUrl
  script.dataset.websiteId = config.websiteId
  script.dataset.domains = config.domains.join(',')
  script.dataset.excludeSearch = 'true'
  script.dataset.excludeHash = 'true'
  script.dataset.doNotTrack = 'true'
  script.dataset.beforeSend = beforeSendName
  return script
}

/**
 * Load the tracker if the API has analytics configured. Failures are ignored: analytics must
 * never break the app.
 */
export async function startAnalytics(queryClient: QueryClient): Promise<void> {
  try {
    const bootstrap = await queryClient.fetchQuery({
      queryKey: queryKeys.bootstrap(),
      queryFn: () =>
        apiRequest(
          '/api/bootstrap',
          clientBootstrapSchema,
          'Unable to load the app configuration.',
        ),
    })

    if (!bootstrap.analytics) {
      return
    }

    Object.assign(window, { [beforeSendName]: sanitizeTrackedPayload })
    document.head.append(buildTrackerScript(bootstrap.analytics))
  } catch {
    // Analytics is optional; the app works the same without it.
  }
}
