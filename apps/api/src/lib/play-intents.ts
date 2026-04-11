import type {
  ActivePlayIntent,
  PlayIntentNotifyScope,
  PlayIntentSelectionMode,
  UpsertPlayIntentRequest,
  UpsertPlayIntentResponse
} from '@game-is-up/shared'
import {
  GameIntentType,
  NotificationType,
  PlayIntentScope,
  PlayIntentSelectionMode as PrismaPlayIntentSelectionMode
} from '@prisma/client'
import { getMutualDiscoveryAudienceUserIds } from './discord-servers.js'
import { prisma } from './prisma.js'

export class PlayIntentValidationError extends Error {}

const minimumPlayIntentDurationMinutes = 15
const maximumPlayIntentDurationMinutes = 24 * 60

const activePlayIntentInclude = {
  games: {
    include: {
      game: true
    }
  },
  platforms: true
} as const

function toClientSelectionMode(selectionMode: PrismaPlayIntentSelectionMode): PlayIntentSelectionMode {
  return selectionMode === PrismaPlayIntentSelectionMode.ENTIRE_LIBRARY ? 'library' : 'subset'
}

function toPrismaSelectionMode(selectionMode: PlayIntentSelectionMode): PrismaPlayIntentSelectionMode {
  return selectionMode === 'library'
    ? PrismaPlayIntentSelectionMode.ENTIRE_LIBRARY
    : PrismaPlayIntentSelectionMode.SELECTED_GAMES
}

function toClientNotifyScope(scope: PlayIntentScope): PlayIntentNotifyScope {
  switch (scope) {
    case PlayIntentScope.MUTUAL_FRIENDS:
      return 'discovery-and-friends'
    default:
      return 'friends-only'
  }
}

function toPrismaNotifyScope(scope: PlayIntentNotifyScope): PlayIntentScope {
  switch (scope) {
    case 'discovery-and-friends':
      return PlayIntentScope.MUTUAL_FRIENDS
    default:
      return PlayIntentScope.FRIENDS_ONLY
  }
}

function formatDurationLabel(durationMinutes: number) {
  if (durationMinutes % 60 === 0) {
    const hours = durationMinutes / 60
    return `${hours} hour${hours === 1 ? '' : 's'}`
  }

  return `${durationMinutes} minutes`
}

function summarizeTitles(titles: string[]) {
  if (titles.length === 0) {
    return 'your games'
  }

  if (titles.length === 1) {
    return titles[0]
  }

  if (titles.length === 2) {
    return `${titles[0]} and ${titles[1]}`
  }

  return `${titles[0]} and ${titles.length - 1} more`
}

function buildHeadline(selectionMode: PlayIntentSelectionMode, selectedTitles: string[]) {
  return selectionMode === 'library'
    ? 'Open to anything in my library right now'
    : `Looking to play ${summarizeTitles(selectedTitles)}`
}

function buildNotificationCopy(
  senderDisplayName: string,
  selectionMode: PlayIntentSelectionMode,
  selectedTitles: string[],
  durationMinutes: number
) {
  const durationLabel = formatDurationLabel(durationMinutes)

  if (selectionMode === 'library') {
    return {
      title: `${senderDisplayName} is looking to play`,
      body: `${senderDisplayName} opened up their full library for the next ${durationLabel}.`
    }
  }

  const summarizedTitles = summarizeTitles(selectedTitles)
  return {
    title: `${senderDisplayName} wants to play ${summarizedTitles}`,
    body: `${senderDisplayName} is looking for ${summarizedTitles} in the next ${durationLabel}.`
  }
}

function dedupePlatformLabels(platformLabels: string[]) {
  return [...new Set(platformLabels.map((platformLabel) => platformLabel.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right))
}

function resolvePlayIntentWindow(payload: UpsertPlayIntentRequest, now: Date) {
  if (payload.endAt) {
    const endsAt = new Date(payload.endAt)

    if (Number.isNaN(endsAt.getTime())) {
      throw new PlayIntentValidationError('Choose a valid end time for your call to play.')
    }

    const durationMinutes = Math.ceil((endsAt.getTime() - now.getTime()) / (60 * 1000))

    if (durationMinutes < minimumPlayIntentDurationMinutes) {
      throw new PlayIntentValidationError(`Choose an end time at least ${minimumPlayIntentDurationMinutes} minutes from now.`)
    }

    if (durationMinutes > maximumPlayIntentDurationMinutes) {
      throw new PlayIntentValidationError('Calls to play can stay live for up to 24 hours.')
    }

    return {
      durationMinutes,
      endsAt
    }
  }

  const durationMinutes = payload.durationMinutes ?? minimumPlayIntentDurationMinutes

  if (durationMinutes < minimumPlayIntentDurationMinutes) {
    throw new PlayIntentValidationError(`Calls to play must stay live for at least ${minimumPlayIntentDurationMinutes} minutes.`)
  }

  if (durationMinutes > maximumPlayIntentDurationMinutes) {
    throw new PlayIntentValidationError('Calls to play can stay live for up to 24 hours.')
  }

  return {
    durationMinutes,
    endsAt: new Date(now.getTime() + durationMinutes * 60 * 1000)
  }
}

function serializeActivePlayIntent(intent: {
  id: string;
  headline: string;
  note: string;
  selectionMode: PrismaPlayIntentSelectionMode;
  scope: PlayIntentScope;
  windowStartsAt: Date;
  windowEndsAt: Date;
  expiresAt: Date;
  platforms: { platformLabel: string }[];
  games: { game: { id: string; title: string } }[];
}): ActivePlayIntent {
  const primaryPlatform = intent.platforms[0]?.platformLabel ?? 'Unknown'

  return {
    id: intent.id,
    title: intent.headline,
    selectionMode: toClientSelectionMode(intent.selectionMode),
    notifyScope: toClientNotifyScope(intent.scope),
    platforms: intent.platforms.map((platform) => platform.platformLabel).sort((left, right) => left.localeCompare(right)),
    games: intent.games
      .map((entry) => ({
        id: entry.game.id,
        title: entry.game.title,
        platform: primaryPlatform
      }))
      .sort((left, right) => left.title.localeCompare(right.title)),
    note: intent.note,
    windowStartsAt: intent.windowStartsAt.toISOString(),
    windowEndsAt: intent.windowEndsAt.toISOString(),
    expiresAt: intent.expiresAt.toISOString()
  }
}

async function getRecipientUserIds(userId: string, scope: PlayIntentNotifyScope, overlappingGameIds: string[]) {
  if (overlappingGameIds.length === 0) {
    return []
  }

  const outgoingFriends = await prisma.friend.findMany({
    where: {
      userId
    },
    select: {
      friendedUserId: true
    }
  })

  const explicitFriendUserIds = outgoingFriends.map((friend) => friend.friendedUserId)
  const recipientUserIds = scope === 'discovery-and-friends'
    ? [...new Set([...explicitFriendUserIds, ...(await getMutualDiscoveryAudienceUserIds(userId))])]
    : explicitFriendUserIds

  if (recipientUserIds.length === 0) {
    return []
  }

  const overlappingRecipients = await prisma.userGameInterest.findMany({
    where: {
      userId: {
        in: recipientUserIds
      },
      gameId: {
        in: overlappingGameIds
      },
      intentType: {
        not: GameIntentType.COMPLETED
      }
    },
    distinct: ['userId'],
    select: {
      userId: true
    }
  })

  return overlappingRecipients.map((entry) => entry.userId)
}

async function getPlayableLibraryEntries(userId: string) {
  return prisma.userGameInterest.findMany({
    where: {
      userId,
      intentType: {
        not: GameIntentType.COMPLETED
      }
    },
    include: {
      game: true,
      platforms: {
        orderBy: {
          platformLabel: 'asc'
        }
      }
    },
    orderBy: {
      updatedAt: 'desc'
    }
  })
}

export async function getCurrentPlayIntent(userId: string) {
  const activeIntent = await prisma.playIntent.findFirst({
    where: {
      userId,
      expiresAt: {
        gt: new Date()
      }
    },
    include: activePlayIntentInclude,
    orderBy: [
      {
        expiresAt: 'desc'
      },
      {
        createdAt: 'desc'
      }
    ]
  })

  return activeIntent ? serializeActivePlayIntent(activeIntent) : null
}

export async function clearCurrentPlayIntent(userId: string) {
  const now = new Date()

  await prisma.playIntent.updateMany({
    where: {
      userId,
      expiresAt: {
        gt: now
      }
    },
    data: {
      expiresAt: now,
      windowEndsAt: now
    }
  })
}

export async function upsertCurrentPlayIntent(
  userId: string,
  payload: UpsertPlayIntentRequest
): Promise<UpsertPlayIntentResponse> {
  const [sender, libraryEntries] = await Promise.all([
    prisma.user.findUnique({
      where: {
        id: userId
      },
      select: {
        displayName: true
      }
    }),
    getPlayableLibraryEntries(userId)
  ])

  if (!sender) {
    throw new PlayIntentValidationError('User not found.')
  }

  if (libraryEntries.length === 0) {
    throw new PlayIntentValidationError('Add at least one game to your library before posting a call to play.')
  }

  const selectedEntries = payload.selectionMode === 'library'
    ? libraryEntries
    : libraryEntries.filter((entry) => payload.gameIds.includes(entry.gameId))

  selectedEntries.sort((left, right) => left.game.title.localeCompare(right.game.title))

  if (payload.selectionMode === 'subset' && payload.gameIds.length === 0) {
    throw new PlayIntentValidationError('Pick at least one game before posting a selected-games call to play.')
  }

  if (selectedEntries.length === 0) {
    throw new PlayIntentValidationError('Your selected games need to come from your current library.')
  }

  const selectedGameIds = selectedEntries.map((entry) => entry.gameId)
  const selectedTitles = selectedEntries.map((entry) => entry.game.title)
  const platformLabels = dedupePlatformLabels(
    selectedEntries.flatMap((entry) => entry.platforms.map((platform) => platform.platformLabel))
  )

  if (platformLabels.length === 0) {
    throw new PlayIntentValidationError('Choose at least one platform in your library before posting a call to play.')
  }

  const recipientUserIds = await getRecipientUserIds(userId, payload.notifyScope, selectedGameIds)
  const now = new Date()
  const { durationMinutes, endsAt } = resolvePlayIntentWindow(payload, now)
  const headline = buildHeadline(payload.selectionMode, selectedTitles)
  const { title, body } = buildNotificationCopy(sender.displayName, payload.selectionMode, selectedTitles, durationMinutes)
  const note = payload.note?.trim() ?? ''

  let activeIntent: ActivePlayIntent | null = null

  await prisma.$transaction(async (transaction) => {
    await transaction.playIntent.updateMany({
      where: {
        userId,
        expiresAt: {
          gt: now
        }
      },
      data: {
        expiresAt: now,
        windowEndsAt: now
      }
    })

    const createdIntent = await transaction.playIntent.create({
      data: {
        userId,
        selectionMode: toPrismaSelectionMode(payload.selectionMode),
        headline,
        note,
        scope: toPrismaNotifyScope(payload.notifyScope),
        windowStartsAt: now,
        windowEndsAt: endsAt,
        expiresAt: endsAt,
        platforms: {
          create: platformLabels.map((platformLabel) => ({
            platformLabel
          }))
        },
        games: payload.selectionMode === 'library'
          ? undefined
          : {
              create: selectedGameIds.map((gameId) => ({
                gameId
              }))
            }
      },
      include: activePlayIntentInclude
    })

    if (recipientUserIds.length > 0) {
      await transaction.notification.createMany({
        data: recipientUserIds.map((recipientUserId) => ({
          userId: recipientUserId,
          triggeredByUserId: userId,
          gameId: payload.selectionMode === 'subset' ? selectedGameIds[0] : null,
          type: NotificationType.FRIEND_PLAYING,
          title,
          body
        }))
      })
    }

    activeIntent = serializeActivePlayIntent(createdIntent)
  })

  if (!activeIntent) {
    throw new PlayIntentValidationError('Unable to save your call to play right now.')
  }

  return {
    activeIntent,
    notifiedFriendCount: recipientUserIds.length
  }
}
