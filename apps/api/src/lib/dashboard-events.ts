import {
  dashboardInvalidationEventSchema,
  type DashboardInvalidationDomain,
  type DashboardInvalidationEvent,
} from '@game-is-up/shared'

type DashboardEventSubscriber = {
  userId: string
  listener: (event: DashboardInvalidationEvent) => void
}

type PublishDashboardInvalidationOptions = {
  domains: DashboardInvalidationDomain[]
  userIds?: string[]
}

type PublishPlayIntentInvalidationOptions = {
  userIds?: string[]
}

const dashboardEventSubscribers = new Set<DashboardEventSubscriber>()
let nextDashboardEventId = 0

function buildDashboardInvalidationEvent(
  domains: DashboardInvalidationDomain[],
) {
  return dashboardInvalidationEventSchema.parse({
    id: `${Date.now()}-${nextDashboardEventId++}`,
    occurredAt: new Date().toISOString(),
    domains: [...new Set(domains)],
  })
}

export function subscribeToDashboardInvalidations(
  userId: string,
  listener: (event: DashboardInvalidationEvent) => void,
) {
  const subscriber: DashboardEventSubscriber = {
    userId,
    listener,
  }

  dashboardEventSubscribers.add(subscriber)

  return () => {
    dashboardEventSubscribers.delete(subscriber)
  }
}

export function publishDashboardInvalidation(
  options: PublishDashboardInvalidationOptions,
) {
  if (options.domains.length === 0 || dashboardEventSubscribers.size === 0) {
    return
  }

  const event = buildDashboardInvalidationEvent(options.domains)
  const targetedUserIds = options.userIds ? new Set(options.userIds) : null

  for (const subscriber of dashboardEventSubscribers) {
    if (targetedUserIds && !targetedUserIds.has(subscriber.userId)) {
      continue
    }

    subscriber.listener(event)
  }
}

export function publishPlayIntentInvalidation(
  options: PublishPlayIntentInvalidationOptions = {},
) {
  publishDashboardInvalidation({
    domains: ['play-intents', 'discovery'],
    userIds: options.userIds,
  })
}
