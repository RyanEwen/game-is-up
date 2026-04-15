import { deleteDiscordDirectMessage, fetchDiscordChannelMessages, getDiscordBotUserId } from './discord-bot-runtime.js'
import { prisma } from './prisma.js'

const discordDmRetentionMs = 72 * 60 * 60 * 1000
const discordDmPageSize = 100

async function getTrackedDmChannelIds(cutoff: Date) {
  const [notificationChannels, promptChannels, creatorSummaryChannels] = await Promise.all([
    prisma.notification.findMany({
      where: {
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
      distinct: ['discordDmChannelId'],
      select: {
        discordDmChannelId: true
      }
    }),
    prisma.discordAutoPlayPrompt.findMany({
      where: {
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
      distinct: ['discordDmChannelId'],
      select: {
        discordDmChannelId: true
      }
    }),
    prisma.playIntent.findMany({
      where: {
        expiresAt: {
          lte: cutoff
        },
        creatorDiscordDmChannelId: {
          not: null
        },
        creatorDiscordDmMessageId: {
          not: null
        }
      },
      distinct: ['creatorDiscordDmChannelId'],
      select: {
        creatorDiscordDmChannelId: true
      }
    })
  ])

  return [...new Set([
    ...notificationChannels.map((entry) => entry.discordDmChannelId),
    ...promptChannels.map((entry) => entry.discordDmChannelId),
    ...creatorSummaryChannels.map((entry) => entry.creatorDiscordDmChannelId)
  ].filter((channelId): channelId is string => Boolean(channelId)))]
}

async function deleteOldBotMessagesInChannel(channelId: string, cutoffTimeMs: number, botUserId: string) {
  let before: string | undefined

  while (true) {
    const messages = await fetchDiscordChannelMessages({
      channelId,
      before,
      limit: discordDmPageSize
    })

    if (messages.length === 0) {
      return
    }

    for (const message of messages) {
      if (message.authorId !== botUserId) {
        continue
      }

      const timestampMs = Date.parse(message.timestamp)

      if (Number.isNaN(timestampMs) || timestampMs > cutoffTimeMs) {
        continue
      }

      await deleteDiscordDirectMessage({
        channelId,
        messageId: message.id
      })
    }

    before = messages.at(-1)?.id

    if (!before || messages.length < discordDmPageSize) {
      return
    }
  }
}

async function clearTrackedDmReferences(cutoff: Date) {
  await Promise.all([
    prisma.notification.updateMany({
      where: {
        deliveredAt: {
          lte: cutoff
        },
        discordDmChannelId: {
          not: null
        }
      },
      data: {
        discordDmChannelId: null,
        discordDmMessageId: null
      }
    }),
    prisma.discordAutoPlayPrompt.updateMany({
      where: {
        deliveredAt: {
          lte: cutoff
        },
        discordDmChannelId: {
          not: null
        }
      },
      data: {
        discordDmChannelId: null,
        discordDmMessageId: null
      }
    }),
    prisma.playIntent.updateMany({
      where: {
        expiresAt: {
          lte: cutoff
        },
        creatorDiscordDmChannelId: {
          not: null
        }
      },
      data: {
        creatorDiscordDmChannelId: null,
        creatorDiscordDmMessageId: null
      }
    })
  ])
}

export async function sweepOldDiscordDirectMessages() {
  const cutoff = new Date(Date.now() - discordDmRetentionMs)
  const [botUserId, trackedChannelIds] = await Promise.all([
    getDiscordBotUserId(),
    getTrackedDmChannelIds(cutoff)
  ])

  if (!botUserId || trackedChannelIds.length === 0) {
    if (botUserId) {
      await clearTrackedDmReferences(cutoff)
    }
    return
  }

  const cutoffTimeMs = cutoff.getTime()

  for (const channelId of trackedChannelIds) {
    try {
      await deleteOldBotMessagesInChannel(channelId, cutoffTimeMs, botUserId)
    } catch (error) {
      console.error(`Failed to sweep old Discord DMs for channel ${channelId}`, error)
    }
  }

  await clearTrackedDmReferences(cutoff)
}