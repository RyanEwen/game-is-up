import { Router } from 'express'
import { debugDmActionRequestSchema, debugDmActionResponseSchema } from '@game-is-up/shared'
import type { ButtonInteraction } from 'discord.js'
import { AuthProvider, GameIntentType, NotificationResponseChoice, NotificationType, PlayIntentScope, PlayIntentSelectionMode } from '@prisma/client'
import { buildDebugAdminSnapshot } from '../lib/debug-admin.js'
import { parseDebugPlayIntentResponseCustomId } from '../lib/debug-dm-actions.js'
import {
  handleCreatorPlayIntentSummaryInteraction,
  handlePlayIntentNotificationInteraction,
  handleScheduledPlayIntentCheckInInteraction,
  isCreatorPlayIntentSummaryCustomId,
  isPlayIntentNotificationCustomId,
  respondToPlayIntentFromWeb,
  isScheduledPlayIntentCheckInCustomId
} from '../lib/play-intent-notification-responses.js'
import { getAuthSession } from '../lib/session.js'
import { prisma } from '../lib/prisma.js'
import { buildPlayIntentNotificationCopy, getPlayIntentRecipientUserIdsForDebug } from '../lib/play-intents.js'

export const debugRouter = Router()

function toClientNotifyScope(scope: PlayIntentScope) {
  switch (scope) {
    case PlayIntentScope.SPECIFIC_DISCORD_SERVER:
      return 'specific-discord-server' as const
    case PlayIntentScope.SPECIFIC_FRIENDS:
      return 'specific-friends' as const
    case PlayIntentScope.MUTUAL_FRIENDS:
      return 'network' as const
    default:
      return 'friends-only' as const
  }
}

function toClientSelectionMode(selectionMode: PlayIntentSelectionMode) {
  return selectionMode === PlayIntentSelectionMode.ENTIRE_LIBRARY ? 'library' as const : 'subset' as const
}

async function ensureDebugPlayableNotification(options: {
  actingUserId: string;
  playIntentId: string;
}) {
  const playIntent = await prisma.playIntent.findUnique({
    where: {
      id: options.playIntentId
    },
    select: {
      id: true,
      userId: true,
      scope: true,
      selectionMode: true,
      windowStartsAt: true,
      windowEndsAt: true,
      expiresAt: true,
      user: {
        select: {
          displayName: true
        }
      },
      targetDiscordServers: {
        select: {
          serverId: true
        }
      },
      targetFriends: {
        select: {
          friendUserId: true
        }
      },
      games: {
        select: {
          gameId: true,
          game: {
            select: {
              title: true
            }
          }
        }
      },
      notifications: {
        where: {
          userId: options.actingUserId,
          type: {
            in: [NotificationType.FRIEND_PLAYING, NotificationType.SCHEDULED_PLAY_INTENT_REMINDER]
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        select: {
          id: true
        }
      }
    }
  })

  if (!playIntent || playIntent.expiresAt <= new Date()) {
    throw new Error('The original call to play is no longer active.')
  }

  if (playIntent.notifications[0]?.id) {
    return playIntent.notifications[0].id
  }

  const overlappingGameIds = playIntent.selectionMode === PlayIntentSelectionMode.ENTIRE_LIBRARY
    ? await prisma.userGameInterest.findMany({
        where: {
          userId: playIntent.userId,
          intentType: {
            not: GameIntentType.COMPLETED
          }
        },
        select: {
          gameId: true
        }
      }).then((entries) => entries.map((entry) => entry.gameId))
    : playIntent.games.map((entry) => entry.gameId)
  const allowedAudienceUserIds = await getPlayIntentRecipientUserIdsForDebug({
    userId: playIntent.userId,
    scope: toClientNotifyScope(playIntent.scope),
    overlappingGameIds,
    targetUserIds: playIntent.targetFriends.map((entry) => entry.friendUserId),
    includeSelf: options.actingUserId === playIntent.userId,
    targetDiscordServerIds: playIntent.targetDiscordServers.map((entry) => entry.serverId)
  })

  if (!allowedAudienceUserIds.includes(options.actingUserId)) {
    throw new Error('That user is not in the current audience for this call to play.')
  }

  const actingUser = await prisma.user.findUnique({
    where: {
      id: options.actingUserId
    },
    select: {
      timezoneId: true
    }
  })

  const notificationCopy = buildPlayIntentNotificationCopy(
    playIntent.user.displayName,
    toClientSelectionMode(playIntent.selectionMode),
    playIntent.games.map((entry) => entry.game.title),
    Math.max(1, Math.round((playIntent.windowEndsAt.getTime() - playIntent.windowStartsAt.getTime()) / 60000)),
    playIntent.windowStartsAt,
    new Date(),
    actingUser?.timezoneId ?? null
  )

  const createdNotification = await prisma.notification.create({
    data: {
      userId: options.actingUserId,
      triggeredByUserId: playIntent.userId,
      playIntentId: playIntent.id,
      gameId: playIntent.selectionMode === PlayIntentSelectionMode.SELECTED_GAMES ? (playIntent.games[0]?.gameId ?? null) : null,
      type: NotificationType.FRIEND_PLAYING,
      title: notificationCopy.title,
      body: notificationCopy.body
    },
    select: {
      id: true
    }
  })

  return createdNotification.id
}

async function requireAdminSessionUser(sessionUserId: string) {
  return prisma.user.findUnique({
    where: { id: sessionUserId },
    select: { isAdmin: true }
  })
}

debugRouter.get('/admin', async (request, response, next) => {
  const session = getAuthSession(request)

  if (!session) {
    response.status(401).json({
      error: 'Authentication required.'
    })
    return
  }

  const user = await requireAdminSessionUser(session.userId)

  if (!user?.isAdmin) {
    response.status(403).json({
      error: 'Admin access required.'
    })
    return
  }

  try {
    response.json(await buildDebugAdminSnapshot())
  } catch (error) {
    next(error)
  }
})

debugRouter.post('/admin/dm-action', async (request, response, next) => {
  const session = getAuthSession(request)

  if (!session) {
    response.status(401).json({
      error: 'Authentication required.'
    })
    return
  }

  const user = await requireAdminSessionUser(session.userId)

  if (!user?.isAdmin) {
    response.status(403).json({
      error: 'Admin access required.'
    })
    return
  }

  try {
    const payload = debugDmActionRequestSchema.parse(request.body)
    const actingIdentity = await prisma.userIdentity.findFirst({
      where: {
        userId: payload.actingUserId,
        provider: AuthProvider.DISCORD
      },
      select: {
        providerUserId: true
      }
    })

    if (!actingIdentity?.providerUserId) {
      response.status(409).json({
        error: 'That user does not have a linked Discord identity to emulate from.'
      })
      return
    }

    let updatedMessage = 'Action applied.'
    const interaction = {
      customId: payload.customId,
      user: {
        id: actingIdentity.providerUserId
      },
      update: async (updatePayload: { content?: string | null }) => {
        if (typeof updatePayload.content === 'string' && updatePayload.content.trim()) {
          updatedMessage = updatePayload.content
        }
      }
    } as unknown as ButtonInteraction

    if (isPlayIntentNotificationCustomId(payload.customId)) {
      await handlePlayIntentNotificationInteraction(interaction)
    } else if (isCreatorPlayIntentSummaryCustomId(payload.customId)) {
      await handleCreatorPlayIntentSummaryInteraction(interaction)
    } else if (isScheduledPlayIntentCheckInCustomId(payload.customId)) {
      await handleScheduledPlayIntentCheckInInteraction(interaction)
    } else {
      const syntheticResponseAction = parseDebugPlayIntentResponseCustomId(payload.customId)

      if (!syntheticResponseAction) {
        response.status(400).json({
          error: 'This emulator button is not supported yet.'
        })
        return
      }

      await ensureDebugPlayableNotification({
        actingUserId: payload.actingUserId,
        playIntentId: syntheticResponseAction.playIntentId
      })

      const result = await respondToPlayIntentFromWeb({
        userId: payload.actingUserId,
        playIntentId: syntheticResponseAction.playIntentId,
        response: syntheticResponseAction.response === 'join' ? NotificationResponseChoice.JOIN : NotificationResponseChoice.DECLINE
      })

      updatedMessage = result.message
    }

    response.json(debugDmActionResponseSchema.parse({
      message: updatedMessage
    }))
  } catch (error) {
    next(error)
  }
})