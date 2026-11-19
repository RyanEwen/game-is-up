/**
 * Web analytics: the self-hosted, cookieless Umami that PrintStream also runs on this server.
 *
 * Analytics is on only when both UMAMI_SCRIPT_URL and UMAMI_WEBSITE_ID are set. Then the web app
 * gets the tracker's settings from `/api/bootstrap`, and the Content Security Policy allows the
 * tracker's origin for its script and its event requests; otherwise neither appears. Tracking is
 * limited to the public host (CLIENT_ORIGIN), so a local or staging build never reports, and the
 * web app strips identifiers from every tracked URL before it is sent (`apps/web/src/lib/analytics.ts`).
 */
import type { ClientAnalyticsConfig } from '@game-is-up/shared'

type AnalyticsEnvironment = {
  CLIENT_ORIGIN: string
  UMAMI_SCRIPT_URL?: string
  UMAMI_WEBSITE_ID?: string
}

/** The tracker settings for the web app, or null when analytics is off. */
export function getClientAnalyticsConfig(
  environment: AnalyticsEnvironment,
): ClientAnalyticsConfig | null {
  if (!environment.UMAMI_SCRIPT_URL || !environment.UMAMI_WEBSITE_ID) {
    return null
  }

  return {
    scriptUrl: environment.UMAMI_SCRIPT_URL,
    websiteId: environment.UMAMI_WEBSITE_ID,
    domains: [new URL(environment.CLIENT_ORIGIN).hostname],
  }
}

/** The origin the CSP must allow for the tracker, or an empty list when analytics is off. */
export function analyticsCspSources(
  environment: AnalyticsEnvironment,
): string[] {
  const config = getClientAnalyticsConfig(environment)
  return config ? [new URL(config.scriptUrl).origin] : []
}
