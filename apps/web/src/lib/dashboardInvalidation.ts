/**
 * Which dashboard queries a server-sent invalidation event makes stale.
 *
 * The server tags each event with the domains it touched. Every domain maps to the queries whose
 * data can depend on it, generously, because a stale view is worse than one extra request: for
 * example a library change can change which calls to play apply to the viewer, so it refreshes
 * those too. `auth` refreshes everything, since signing in or out changes what each query returns.
 */
import type { DashboardInvalidationDomain } from '@game-is-up/shared'
import type { QueryKey } from '@tanstack/react-query'
import { queryKeys } from './queryKeys'

/** The queries the dashboard loads, which `refreshDashboard()` refetches as one set. */
export const dashboardResourceKeys = {
  health: queryKeys.health(),
  authProviders: queryKeys.authProviders(),
  session: queryKeys.session(),
  discoveryFeed: queryKeys.discoveryFeed(),
  playIntentFeed: queryKeys.playIntentFeed(),
  currentPlayIntent: queryKeys.currentPlayIntent(),
  library: queryKeys.library(),
  friendsLists: queryKeys.friendsLists(),
  discordServers: queryKeys.discordServers(),
  debugAdmin: queryKeys.debugAdmin(),
} as const

type DashboardResource = keyof typeof dashboardResourceKeys

const allResources = Object.keys(dashboardResourceKeys) as DashboardResource[]

/** Admin diagnostics reflect every kind of change, so they refresh on any event. */
const resourcesByDomain: Record<
  DashboardInvalidationDomain,
  readonly DashboardResource[]
> = {
  auth: allResources,
  profile: ['session', 'library', 'discoveryFeed', 'debugAdmin'],
  library: [
    'library',
    'discoveryFeed',
    'playIntentFeed',
    'currentPlayIntent',
    'debugAdmin',
  ],
  network: [
    'friendsLists',
    'discordServers',
    'discoveryFeed',
    'playIntentFeed',
    'debugAdmin',
  ],
  discovery: ['discoveryFeed', 'playIntentFeed', 'debugAdmin'],
  'play-intents': ['playIntentFeed', 'currentPlayIntent', 'debugAdmin'],
}

/**
 * The query keys to invalidate for a set of event domains, each key once. An unknown domain
 * (a newer server than this page) refreshes everything rather than nothing.
 */
export function invalidationKeysForDomains(
  domains: readonly string[],
): QueryKey[] {
  const resources = new Set<DashboardResource>()

  for (const domain of domains) {
    const mapped =
      resourcesByDomain[domain as DashboardInvalidationDomain] ?? allResources
    for (const resource of mapped) {
      resources.add(resource)
    }
  }

  return allResources
    .filter((resource) => resources.has(resource))
    .map((resource) => dashboardResourceKeys[resource])
}

/**
 * Query families outside the dashboard set that a domain also makes stale, matched by prefix:
 * an open call-to-play detail page (and its invite list) follows play-intent changes.
 */
export function invalidationPrefixesForDomains(
  domains: readonly string[],
): QueryKey[] {
  const known = new Set(Object.keys(resourcesByDomain))
  const refreshesPlayIntents = domains.some(
    (domain) =>
      domain === 'play-intents' || domain === 'auth' || !known.has(domain),
  )
  return refreshesPlayIntents ? [['play-intents', 'detail']] : []
}
