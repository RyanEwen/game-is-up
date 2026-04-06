import type { DiscoveryPerson } from '@game-is-up/shared'
import { AuthProvider, DiscordActivityType, type Prisma } from '@prisma/client'
import { findOrCreateGameByTitle } from './game-catalog.js'
import { prisma } from './prisma.js'

type DiscordPresenceActivityInput = {
  name: string;
  applicationId: string | null;
  activityType: DiscordActivityType;
  details: string | null;
  state: string | null;
  startedAt: Date | null;
  rawPayload: Prisma.InputJsonValue;
};

type DiscordActivityObservationRecord = {
  activityName: string;
  applicationId: string | null;
  activityType: DiscordActivityType;
  details: string | null;
  state: string | null;
  startedAt: Date | null;
  firstObservedAt: Date;
  lastObservedAt: Date;
  sourceServer: {
    name: string;
  } | null;
};

function activityTypeToClientLabel(activityType: DiscordActivityType): 'playing' | 'competing' {
  return activityType === DiscordActivityType.COMPETING ? 'competing' : 'playing'
}

function toDiscordActivitySummary(
  observation: DiscordActivityObservationRecord
): NonNullable<DiscoveryPerson['discordActivity']> {
  return {
    title: observation.activityName,
    applicationId: observation.applicationId,
    activityType: activityTypeToClientLabel(observation.activityType),
    details: observation.details,
    state: observation.state,
    startedAt: observation.startedAt?.toISOString() ?? null,
    firstObservedAt: observation.firstObservedAt.toISOString(),
    lastObservedAt: observation.lastObservedAt.toISOString(),
    sourceServerName: observation.sourceServer?.name ?? null
  }
}

function activityMatches(
  existing: {
    activityName: string;
    applicationId: string | null;
    activityType: DiscordActivityType;
    startedAt: Date | null;
  },
  nextActivity: DiscordPresenceActivityInput
) {
  const existingStart = existing.startedAt?.toISOString() ?? null
  const nextStart = nextActivity.startedAt?.toISOString() ?? null

  return existing.activityName === nextActivity.name
    && existing.applicationId === nextActivity.applicationId
    && existing.activityType === nextActivity.activityType
    && existingStart === nextStart
}

async function getAppUserIdForDiscordUser(discordUserId: string) {
  const identity = await prisma.userIdentity.findUnique({
    where: {
      provider_providerUserId: {
        provider: AuthProvider.DISCORD,
        providerUserId: discordUserId
      }
    },
    select: {
      userId: true
    }
  })

  return identity?.userId ?? null
}

export async function recordDiscordPresence(
  discordUserId: string,
  sourceServerId: string | null,
  activities: DiscordPresenceActivityInput[]
) {
  const userId = await getAppUserIdForDiscordUser(discordUserId)

  if (!userId) {
    return false
  }

  const now = new Date()
  const activeObservations = await prisma.discordActivityObservation.findMany({
    where: {
      userId,
      isActive: true
    },
    select: {
      id: true,
      activityName: true,
      applicationId: true,
      activityType: true,
      startedAt: true
    }
  })
  const matchedObservationIds = new Set<string>()

  for (const activity of activities) {
    const matchingObservation = activeObservations.find((existingObservation) => activityMatches(existingObservation, activity))
    const game = await findOrCreateGameByTitle(activity.name)

    if (matchingObservation) {
      matchedObservationIds.add(matchingObservation.id)

      await prisma.discordActivityObservation.update({
        where: {
          id: matchingObservation.id
        },
        data: {
          gameId: game.id,
          sourceServerId,
          details: activity.details,
          state: activity.state,
          lastObservedAt: now,
          endedAt: null,
          isActive: true,
          rawPayload: activity.rawPayload
        }
      })

      continue
    }

    const createdObservation = await prisma.discordActivityObservation.create({
      data: {
        userId,
        gameId: game.id,
        sourceServerId,
        activityName: activity.name,
        applicationId: activity.applicationId,
        activityType: activity.activityType,
        details: activity.details,
        state: activity.state,
        startedAt: activity.startedAt,
        firstObservedAt: now,
        lastObservedAt: now,
        rawPayload: activity.rawPayload
      },
      select: {
        id: true
      }
    })

    matchedObservationIds.add(createdObservation.id)
  }

  const staleObservationIds = activeObservations
    .filter((existingObservation) => !matchedObservationIds.has(existingObservation.id))
    .map((existingObservation) => existingObservation.id)

  if (staleObservationIds.length > 0) {
    await prisma.discordActivityObservation.updateMany({
      where: {
        id: {
          in: staleObservationIds
        }
      },
      data: {
        isActive: false,
        endedAt: now,
        lastObservedAt: now
      }
    })
  }

  return true
}

export async function getLatestDiscordActivityForUser(userId: string) {
  const latestObservation = await prisma.discordActivityObservation.findFirst({
    where: {
      userId
    },
    orderBy: {
      lastObservedAt: 'desc'
    },
    include: {
      sourceServer: {
        select: {
          name: true
        }
      }
    }
  })

  if (!latestObservation) {
    return {
      currentActivity: null,
      lastObservedAt: null
    }
  }

  return {
    currentActivity: latestObservation.isActive ? toDiscordActivitySummary(latestObservation) : null,
    lastObservedAt: latestObservation.lastObservedAt.toISOString()
  }
}

export async function getLatestActiveDiscordActivitiesForUsers(userIds: string[]) {
  if (userIds.length === 0) {
    return new Map<string, NonNullable<DiscoveryPerson['discordActivity']>>()
  }

  const observations = await prisma.discordActivityObservation.findMany({
    where: {
      userId: {
        in: userIds
      },
      isActive: true
    },
    orderBy: [
      {
        userId: 'asc'
      },
      {
        lastObservedAt: 'desc'
      }
    ],
    include: {
      sourceServer: {
        select: {
          name: true
        }
      }
    }
  })
  const latestByUserId = new Map<string, NonNullable<DiscoveryPerson['discordActivity']>>()

  for (const observation of observations) {
    if (!latestByUserId.has(observation.userId)) {
      latestByUserId.set(observation.userId, toDiscordActivitySummary(observation))
    }
  }

  return latestByUserId
}