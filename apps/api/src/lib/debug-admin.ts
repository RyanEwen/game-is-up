import { debugAdminResponseSchema } from '@game-is-up/shared'
import { DiscordAutoPlayPromptStatus, PlayIntentScope } from '@prisma/client'
import { getDiscordPresenceBotState } from './discord-bot-runtime.js'
import { prisma } from './prisma.js'

function toClientPromptStatus(status: DiscordAutoPlayPromptStatus) {
  switch (status) {
    case DiscordAutoPlayPromptStatus.ACCEPTED:
      return 'accepted'
    case DiscordAutoPlayPromptStatus.DECLINED:
      return 'declined'
    case DiscordAutoPlayPromptStatus.EXPIRED:
      return 'expired'
    case DiscordAutoPlayPromptStatus.FAILED:
      return 'failed'
    case DiscordAutoPlayPromptStatus.SKIPPED:
      return 'skipped'
    default:
      return 'sent'
  }
}

function toClientNotifyScope(scope: PlayIntentScope | null) {
  if (!scope) {
    return null
  }

  switch (scope) {
    case PlayIntentScope.FRIENDS_ONLY:
      return 'friends-only'
    case PlayIntentScope.SPECIFIC_FRIENDS:
      return 'specific-friends'
    default:
      return 'network'
  }
}

export async function buildDebugAdminSnapshot() {
  const [recentAutoPlayPrompts, recentNotifications] = await Promise.all([
    prisma.discordAutoPlayPrompt.findMany({
      orderBy: {
        createdAt: 'desc'
      },
      take: 25,
      include: {
        user: {
          select: {
            id: true,
            handle: true,
            displayName: true,
            discordAutoPromptPlayIntent: true
          }
        },
        game: {
          select: {
            id: true,
            title: true
          }
        },
        sourceServer: {
          select: {
            name: true
          }
        },
        observation: {
          select: {
            startedAt: true
          }
        }
      }
    }),
    prisma.notification.findMany({
      orderBy: {
        createdAt: 'desc'
      },
      take: 25,
      select: {
        id: true,
        createdAt: true,
        deliveredAt: true,
        title: true,
        body: true,
        triggeredByUserId: true,
        game: {
          select: {
            title: true
          }
        },
        user: {
          select: {
            id: true,
            handle: true,
            displayName: true
          }
        }
      }
    })
  ])

  const triggeredByUserIds = [...new Set(recentNotifications.map((notification) => notification.triggeredByUserId).filter((userId): userId is string => Boolean(userId)))]
  const triggeredByUsers = triggeredByUserIds.length > 0
    ? await prisma.user.findMany({
        where: {
          id: {
            in: triggeredByUserIds
          }
        },
        select: {
          id: true,
          handle: true,
          displayName: true
        }
      })
    : []
  const triggeredByUserMap = new Map(triggeredByUsers.map((user) => [user.id, user]))

  return debugAdminResponseSchema.parse({
    generatedAt: new Date().toISOString(),
    bot: getDiscordPresenceBotState(),
    recentAutoPlayPrompts: recentAutoPlayPrompts.map((prompt) => ({
      id: prompt.id,
      createdAt: prompt.createdAt.toISOString(),
      deliveredAt: prompt.deliveredAt?.toISOString() ?? null,
      respondedAt: prompt.respondedAt?.toISOString() ?? null,
      status: toClientPromptStatus(prompt.status),
      statusDetail: prompt.statusDetail,
      dmError: prompt.dmError,
      durationMinutes: prompt.durationMinutes,
      notifyScope: toClientNotifyScope(prompt.notifyScope ?? null),
      friendRecipientCount: prompt.friendRecipientCount,
      networkRecipientCount: prompt.networkRecipientCount,
      sourceServerName: prompt.sourceServer?.name ?? null,
      observationStartedAt: prompt.observation.startedAt?.toISOString() ?? null,
      createdPlayIntentId: prompt.createdPlayIntentId,
      user: prompt.user,
      game: prompt.game
    })),
    recentNotifications: recentNotifications.map((notification) => ({
      id: notification.id,
      createdAt: notification.createdAt.toISOString(),
      deliveredAt: notification.deliveredAt?.toISOString() ?? null,
      title: notification.title,
      body: notification.body,
      gameTitle: notification.game?.title ?? null,
      recipient: notification.user,
      triggeredBy: notification.triggeredByUserId ? (triggeredByUserMap.get(notification.triggeredByUserId) ?? null) : null
    }))
  })
}