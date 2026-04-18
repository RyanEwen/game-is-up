import { AuthProvider, NotificationType } from '@prisma/client'
import { EmbedBuilder } from 'discord.js'
import { NotificationResponseChoice } from '@prisma/client'
import { deleteDiscordDirectMessage, editDiscordDirectMessage, sendDiscordDirectMessages } from './discord-bot-runtime.js'
import { buildDiscordMessageHeading } from './discord-dm-formatting.js'
import { prisma } from './prisma.js'
import { normalizeTimezoneId } from './timezone-label.js'

const discordDmRetentionMs = 6 * 60 * 60 * 1000
const archivedPlayIntentNotificationTypes = [
  NotificationType.FRIEND_PLAYING,
  NotificationType.SCHEDULED_PLAY_INTENT_REMINDER,
  NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN,
  NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED
] as const

type ArchivedDirectMessageCandidate = {
  channelId: string;
  messageId: string;
  priority: number;
}

type ArchivedCreatorCandidate = ArchivedDirectMessageCandidate & {
  notificationId: string | null;
}

type ArchivedNotificationCandidate = ArchivedDirectMessageCandidate & {
  notificationId: string;
}

function formatArchivedPlayIntentDate(date: Date, timezoneId: string) {
  const normalizedTimezoneId = normalizeTimezoneId(timezoneId) ?? 'Etc/UTC'

  return new Intl.DateTimeFormat('en-US', {
    timeZone: normalizedTimezoneId,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(date)
}

function summarizeArchivedPlayIntentGames(playIntent: {
  selectionMode: 'ENTIRE_LIBRARY' | 'SELECTED_GAMES';
  games: { game: { title: string } }[];
}) {
  if (playIntent.selectionMode === 'ENTIRE_LIBRARY') {
    return 'their library'
  }

  const titles = playIntent.games
    .map((entry) => entry.game.title)
    .sort((left, right) => left.localeCompare(right))

  if (titles.length <= 4) {
    return titles.join(', ')
  }

  return `${titles.slice(0, 4).join(', ')} +${titles.length - 4} more`
}

function buildArchivedPlayIntentSummary(
  playIntent: {
    selectionMode: 'ENTIRE_LIBRARY' | 'SELECTED_GAMES';
    windowStartsAt: Date;
    user: {
      displayName: string;
    };
    games: { game: { title: string } }[];
  },
  timezoneId: string
) {
  const gamesLabel = summarizeArchivedPlayIntentGames(playIntent)
  const startsAtLabel = formatArchivedPlayIntentDate(playIntent.windowStartsAt, timezoneId)

  return {
    title: 'Call to play ended',
    body: [
      `Creator: ${playIntent.user.displayName}`,
      `Games: ${gamesLabel}`,
      `When: ${startsAtLabel}`,
      'Status: This call to play is no longer active.'
    ].join('\n')
  }
}

function buildArchivedPlayIntentEmbeds(summaryBody: string) {
  const fields = summaryBody
    .split('\n')
    .map((line) => line.trim())
    .flatMap((line) => {
      const labeledMatch = /^([A-Za-z][A-Za-z ]{0,40}):\s+(.+)$/.exec(line)

      if (!labeledMatch || !labeledMatch[1] || !labeledMatch[2]) {
        return []
      }

      const label = labeledMatch[1].trim()
      const emojiLabel = label.toLowerCase() === 'creator'
        ? '👤 Creator'
        : label.toLowerCase() === 'games'
          ? '🎯 Games'
          : label.toLowerCase() === 'when'
            ? '⏰ When'
            : label.toLowerCase() === 'status'
              ? '📡 Status'
              : label

      return [{
        name: emojiLabel,
        value: labeledMatch[2].trim(),
        inline: labeledMatch[1].trim().toLowerCase() !== 'games'
      }]
    })

  return [
    new EmbedBuilder()
      .setColor(0xef4444)
      .addFields(fields)
      .setFooter({ text: 'This call to play is no longer active.' })
  ]
}

function getNotificationArchivePriority(type: NotificationType) {
  switch (type) {
    case NotificationType.FRIEND_PLAYING:
      return 0
    case NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED:
      return 1
    case NotificationType.SCHEDULED_PLAY_INTENT_REMINDER:
      return 2
    case NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN:
      return 3
    default:
      return 4
  }
}

async function tryArchiveDirectMessage(candidates: ArchivedDirectMessageCandidate[], content: string, embeds: ReturnType<typeof buildArchivedPlayIntentEmbeds>) {
  for (const candidate of candidates) {
    const result = await editDiscordDirectMessage({
      channelId: candidate.channelId,
      messageId: candidate.messageId,
      content,
      embeds,
      components: []
    })

    if (result.status === 'edited') {
      return candidate.messageId
    }
  }

  return null
}

async function tryDeleteDirectMessage(channelId: string, messageId: string) {
  const result = await deleteDiscordDirectMessage({
    channelId,
    messageId
  })

  return result.status === 'deleted'
}

async function clearNotificationDmReferences(notificationIds: string[]) {
  if (notificationIds.length === 0) {
    return
  }

  await prisma.notification.updateMany({
    where: {
      id: {
        in: notificationIds
      }
    },
    data: {
      discordDmChannelId: null,
      discordDmMessageId: null
    }
  })
}

async function clearPromptDmReferences(promptIds: string[]) {
  if (promptIds.length === 0) {
    return
  }

  await prisma.discordAutoPlayPrompt.updateMany({
    where: {
      id: {
        in: promptIds
      }
    },
    data: {
      discordDmChannelId: null,
      discordDmMessageId: null
    }
  })
}

async function clearCreatorSummaryDmReferences(playIntentIds: string[]) {
  if (playIntentIds.length === 0) {
    return
  }

  await prisma.playIntent.updateMany({
    where: {
      id: {
        in: playIntentIds
      }
    },
    data: {
      creatorDiscordDmChannelId: null,
      creatorDiscordDmMessageId: null
    }
  })
}

export async function archivePlayIntentDirectMessages(options: {
  playIntentIds?: string[];
  deliveredBefore?: Date;
  replaceRecipientMessages?: boolean;
} = {}) {
  const playIntentIds = options.playIntentIds?.filter(Boolean)

  if (options.playIntentIds && playIntentIds && playIntentIds.length === 0) {
    return
  }

  const playIntentCutoff = options.deliveredBefore ?? new Date()
  const playIntents = await prisma.playIntent.findMany({
    where: {
      ...(playIntentIds
        ? {
            id: {
              in: playIntentIds
            }
          }
        : {}),
      expiresAt: {
        lte: playIntentCutoff
      },
      OR: [
        {
          creatorDiscordDmChannelId: {
            not: null
          },
          creatorDiscordDmMessageId: {
            not: null
          }
        },
        {
          notifications: {
            some: {
              type: {
                in: [...archivedPlayIntentNotificationTypes]
              },
              ...(options.deliveredBefore
                ? {
                    deliveredAt: {
                      lte: options.deliveredBefore
                    }
                  }
                : {}),
              discordDmChannelId: {
                not: null
              },
              discordDmMessageId: {
                not: null
              }
            }
          }
        }
      ]
    },
    select: {
      id: true,
      selectionMode: true,
      windowStartsAt: true,
      creatorDiscordDmChannelId: true,
      creatorDiscordDmMessageId: true,
      user: {
        select: {
          id: true,
          displayName: true,
          timezoneId: true
        }
      },
      games: {
        select: {
          game: {
            select: {
              title: true
            }
          }
        }
      },
      notifications: {
        where: {
          type: {
            in: [...archivedPlayIntentNotificationTypes]
          },
          ...(options.deliveredBefore
            ? {
                deliveredAt: {
                  lte: options.deliveredBefore
                }
              }
            : {}),
          discordDmChannelId: {
            not: null
          },
          discordDmMessageId: {
            not: null
          }
        },
        orderBy: [
          {
            deliveredAt: 'asc'
          },
          {
            createdAt: 'asc'
          }
        ],
        select: {
          id: true,
          userId: true,
          type: true,
          createdAt: true,
          responseChoice: true,
          discordDmChannelId: true,
          discordDmMessageId: true,
          user: {
            select: {
              timezoneId: true,
              displayName: true,
              identities: {
                where: {
                  provider: AuthProvider.DISCORD
                },
                select: {
                  providerUserId: true
                }
              }
            }
          }
        }
      }
    }
  })

  const notificationIdsToClear = new Set<string>()
  const playIntentIdsToClear = new Set<string>()

  for (const playIntent of playIntents) {
    const mutedRecipientUserIds = new Set((await prisma.playIntentMute.findMany({
      where: {
        mutedUserId: playIntent.user.id,
        userId: {
          in: [...new Set(playIntent.notifications.map((notification) => notification.userId).filter((userId) => userId !== playIntent.user.id))]
        }
      },
      select: {
        userId: true
      }
    })).map((mute) => mute.userId))

    const creatorArchiveEmbeds = buildArchivedPlayIntentEmbeds(buildArchivedPlayIntentSummary(playIntent, playIntent.user.timezoneId).body)
    const creatorCandidates: ArchivedCreatorCandidate[] = []

    if (playIntent.creatorDiscordDmChannelId && playIntent.creatorDiscordDmMessageId) {
      creatorCandidates.push({
        channelId: playIntent.creatorDiscordDmChannelId,
        messageId: playIntent.creatorDiscordDmMessageId,
        notificationId: null,
        priority: -1
      })
    }

    const notificationsByUserId = new Map<string, typeof playIntent.notifications>()

    for (const notification of playIntent.notifications) {
      if (!notification.discordDmChannelId || !notification.discordDmMessageId) {
        continue
      }

      const existingNotifications = notificationsByUserId.get(notification.userId)

      if (existingNotifications) {
        existingNotifications.push(notification)
      } else {
        notificationsByUserId.set(notification.userId, [notification])
      }

      if (notification.userId === playIntent.user.id) {
        creatorCandidates.push({
          channelId: notification.discordDmChannelId,
          messageId: notification.discordDmMessageId,
          notificationId: notification.id,
          priority: getNotificationArchivePriority(notification.type)
        })
      }
    }

    creatorCandidates.sort((left, right) => left.priority - right.priority)

    const keptCreatorMessageId = creatorCandidates.length > 0
      ? await tryArchiveDirectMessage(creatorCandidates, '', creatorArchiveEmbeds)
      : null

    if (keptCreatorMessageId) {
      for (const candidate of creatorCandidates) {
        if (candidate.messageId === keptCreatorMessageId) {
          if (candidate.notificationId) {
            notificationIdsToClear.add(candidate.notificationId)
          } else {
            playIntentIdsToClear.add(playIntent.id)
          }
          continue
        }

        if (!(await tryDeleteDirectMessage(candidate.channelId, candidate.messageId))) {
          continue
        }

        if (candidate.notificationId) {
          notificationIdsToClear.add(candidate.notificationId)
        } else {
          playIntentIdsToClear.add(playIntent.id)
        }
      }
    }

    for (const [userId, notifications] of notificationsByUserId.entries()) {
      if (userId === playIntent.user.id) {
        continue
      }

      const latestAudienceNotification = [...notifications]
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null
      const recipientPassed = latestAudienceNotification?.responseChoice === NotificationResponseChoice.DECLINE
      const recipientMutedCreator = mutedRecipientUserIds.has(userId)
      const archiveEmbeds = buildArchivedPlayIntentEmbeds(buildArchivedPlayIntentSummary(playIntent, notifications[0]?.user.timezoneId ?? playIntent.user.timezoneId).body)
      const candidates = notifications
        .map<ArchivedNotificationCandidate | null>((notification) => {
          if (!notification.discordDmChannelId || !notification.discordDmMessageId) {
            return null
          }

          return {
            channelId: notification.discordDmChannelId,
            messageId: notification.discordDmMessageId,
            notificationId: notification.id,
            priority: getNotificationArchivePriority(notification.type)
          }
        })
        .filter((candidate): candidate is ArchivedNotificationCandidate => candidate != null)
        .sort((left, right) => left.priority - right.priority)

      if (candidates.length === 0) {
        continue
      }

      // Quiet expiry/archive edits the existing tracked DM in place.
      // Manual cancel paths opt into replacement so Discord emits a fresh notification.
      if (options.replaceRecipientMessages && !recipientPassed && !recipientMutedCreator) {
        const recipientDiscordUserId = notifications[0]?.user.identities[0]?.providerUserId
        const archiveSummary = buildArchivedPlayIntentSummary(playIntent, notifications[0]?.user.timezoneId ?? playIntent.user.timezoneId)

        if (recipientDiscordUserId) {
          const archivedNotification = await prisma.notification.create({
            data: {
              userId,
              triggeredByUserId: playIntent.user.id,
              playIntentId: playIntent.id,
              type: NotificationType.SYSTEM,
              title: archiveSummary.title,
              body: archiveSummary.body
            },
            select: {
              id: true
            }
          })

          const dmResult = (await sendDiscordDirectMessages([
            {
              discordUserId: recipientDiscordUserId,
              content: buildDiscordMessageHeading('🛑 Call to Play Ended'),
              embeds: archiveEmbeds,
              components: []
            }
          ]))[0]

          if (dmResult?.status === 'sent') {
            if (!dmResult.emulated && dmResult.channelId && dmResult.messageId) {
              await prisma.notification.update({
                where: {
                  id: archivedNotification.id
                },
                data: {
                  deliveredAt: new Date(),
                  discordDmChannelId: dmResult.channelId,
                  discordDmMessageId: dmResult.messageId
                }
              })
            }

            for (const candidate of candidates) {
              if (await tryDeleteDirectMessage(candidate.channelId, candidate.messageId)) {
                notificationIdsToClear.add(candidate.notificationId)
              }
            }

            continue
          }
        }
      }

      const keptMessageId = await tryArchiveDirectMessage(candidates, buildDiscordMessageHeading('🛑 Call to Play Ended'), archiveEmbeds)

      if (!keptMessageId) {
        continue
      }

      for (const candidate of candidates) {
        if (candidate.messageId === keptMessageId) {
          notificationIdsToClear.add(candidate.notificationId)
          continue
        }

        if (await tryDeleteDirectMessage(candidate.channelId, candidate.messageId)) {
          notificationIdsToClear.add(candidate.notificationId)
        }
      }
    }
  }

  await Promise.all([
    clearNotificationDmReferences([...notificationIdsToClear]),
    clearCreatorSummaryDmReferences([...playIntentIdsToClear])
  ])
}

async function deleteExpiredPromptDirectMessages(cutoff: Date) {
  const prompts = await prisma.discordAutoPlayPrompt.findMany({
    where: {
      respondedAt: {
        not: null
      },
      deliveredAt: {
        lte: cutoff
      },
      discordDmChannelId: {
        not: null
      },
      discordDmMessageId: {
        not: null
      }
    },
    select: {
      id: true,
      discordDmChannelId: true,
      discordDmMessageId: true
    }
  })

  const promptIdsToClear: string[] = []

  for (const prompt of prompts) {
    if (!prompt.discordDmChannelId || !prompt.discordDmMessageId) {
      continue
    }

    if (!(await tryDeleteDirectMessage(prompt.discordDmChannelId, prompt.discordDmMessageId))) {
      continue
    }

    promptIdsToClear.push(prompt.id)
  }

  await clearPromptDmReferences(promptIdsToClear)
}

export async function sweepOldDiscordDirectMessages() {
  const cutoff = new Date(Date.now() - discordDmRetentionMs)

  await archivePlayIntentDirectMessages({ deliveredBefore: cutoff })
  await deleteExpiredPromptDirectMessages(cutoff)
}