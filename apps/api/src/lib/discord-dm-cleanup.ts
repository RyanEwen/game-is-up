import { AuthProvider, NotificationType } from '@prisma/client'
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, type MessageActionRowComponentBuilder } from 'discord.js'
import { NotificationResponseChoice } from '@prisma/client'
import {
  deleteDiscordDirectMessage,
  editDiscordDirectMessage,
  fetchDiscordChannelMessages,
  getDiscordBotUserId,
  getOrCreateDiscordDirectMessageChannel,
  sendDiscordDirectMessages,
  supportsDiscordInteractiveMessages
} from './discord-bot-runtime.js'
import { appendOpenInAppButton, buildDiscordMessageHeading } from './discord-dm-formatting.js'
import { env } from './env.js'
import { callToPlayEndedSystemNotification } from './play-intent-system-notifications.js'
import { formatPlayIntentWindowLabel } from './play-intent-time-format.js'
import { prisma } from './prisma.js'

const discordDmRetentionMs = 12 * 60 * 60 * 1000
const discordDmCleanupSweepPageLimit = 100
const discordDmCleanupSweepMessageCap = 500
const playIntentNotificationPrefix = 'play-intent-response'
const creatorPlayIntentSummaryPrefix = 'creator-play-intent-summary'
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

type TrackedDirectMessageEntry = {
  channelId: string;
  messageId: string;
  sortAt: number;
  isActive: boolean;
  notificationIds: Set<string>;
  promptIds: Set<string>;
  creatorPlayIntentIds: Set<string>;
}

type TrackedDirectMessageState = {
  discordUserId: string | null;
  channelIds: Set<string>;
  entries: Map<string, TrackedDirectMessageEntry>;
}

type DirectMessageTarget = {
  channelId: string;
  messageId: string;
}

function buildPlayUrl() {
  try {
    return new URL('/play', env.CLIENT_ORIGIN).toString()
  } catch {
    return env.CLIENT_ORIGIN
  }
}

function buildArchivedCreatorDeleteSpaceButton(playIntentId: string) {
  return new ButtonBuilder()
    .setCustomId(`${creatorPlayIntentSummaryPrefix}:${playIntentId}:delete-space`)
    .setLabel('Delete Discord channel')
    .setStyle(ButtonStyle.Danger)
}

function hasArchivedCreatorDeletableDiscordSpace(playIntent: {
  discordSpace?: {
    status: 'REQUESTED' | 'PROVISIONING' | 'ACTIVE' | 'RETAINED' | 'DELETE_REQUESTED' | 'DELETED' | 'PROVISION_FAILED';
  } | null;
}) {
  return playIntent.discordSpace != null
    && playIntent.discordSpace.status !== 'DELETED'
    && playIntent.discordSpace.status !== 'REQUESTED'
    && playIntent.discordSpace.status !== 'PROVISIONING'
}

export function buildArchivedAudienceCleanupComponents(notificationId: string) {
  if (!supportsDiscordInteractiveMessages()) {
    return []
  }

  return appendOpenInAppButton([
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${playIntentNotificationPrefix}:${notificationId}:cleanup`)
        .setLabel('Archive')
        .setStyle(ButtonStyle.Secondary)
    )
  ], buildPlayUrl())
}

export function buildArchivedCreatorCleanupComponents(
  playIntentId: string,
  options: {
    hasDeletableDiscordSpace?: boolean;
  } = {}
) {
  if (!supportsDiscordInteractiveMessages()) {
    return []
  }

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${creatorPlayIntentSummaryPrefix}:${playIntentId}:cleanup`)
      .setLabel('Archive')
      .setStyle(ButtonStyle.Secondary)
  )

  if (options.hasDeletableDiscordSpace) {
    row.addComponents(buildArchivedCreatorDeleteSpaceButton(playIntentId))
  }

  return appendOpenInAppButton([
    row
  ], buildPlayUrl())
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

export function buildArchivedPlayIntentSummary(
  playIntent: {
    selectionMode: 'ENTIRE_LIBRARY' | 'SELECTED_GAMES';
    windowStartsAt: Date;
    windowEndsAt: Date;
    user: {
      displayName: string;
      identities?: { providerUserId: string }[];
    };
    games: { game: { title: string } }[];
  },
  timezoneId: string
) {
  const creatorDiscordUserId = playIntent.user.identities?.[0]?.providerUserId
  const creatorLabel = creatorDiscordUserId ? `<@${creatorDiscordUserId}>` : playIntent.user.displayName
  const gamesLabel = summarizeArchivedPlayIntentGames(playIntent)
  const windowLabel = formatPlayIntentWindowLabel(playIntent.windowStartsAt, playIntent.windowEndsAt, timezoneId)

  return {
    title: callToPlayEndedSystemNotification.title,
    body: [
      `Creator: ${creatorLabel}`,
      `Games: ${gamesLabel}`,
      `When: ${windowLabel}`,
      'Status: This call to play is no longer active.'
    ].join('\n')
  }
}

export function buildArchivedPlayIntentEmbeds(summaryBody: string) {
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
        inline: false
      }]
    })

  return [
    new EmbedBuilder()
      .setColor(0xef4444)
      .addFields(fields)
  ]
}

export function buildArchivedCreatorPlayIntentPreview(
  playIntentId: string,
  playIntent: {
    selectionMode: 'ENTIRE_LIBRARY' | 'SELECTED_GAMES';
    windowStartsAt: Date;
    windowEndsAt: Date;
    user: {
      displayName: string;
      identities?: { providerUserId: string }[];
    };
    games: { game: { title: string } }[];
    discordSpace?: {
      status: 'REQUESTED' | 'PROVISIONING' | 'ACTIVE' | 'RETAINED' | 'DELETE_REQUESTED' | 'DELETED' | 'PROVISION_FAILED';
    } | null;
  },
  timezoneId: string
) {
  const summary = buildArchivedPlayIntentSummary(playIntent, timezoneId)

  return {
    content: '',
    embeds: buildArchivedPlayIntentEmbeds(summary.body),
    components: buildArchivedCreatorCleanupComponents(playIntentId, {
      hasDeletableDiscordSpace: hasArchivedCreatorDeletableDiscordSpace(playIntent)
    })
  }
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

async function tryArchiveDirectMessage(
  candidates: ArchivedDirectMessageCandidate[],
  content: string,
  embeds: ReturnType<typeof buildArchivedPlayIntentEmbeds>,
  components:
    | ActionRowBuilder<MessageActionRowComponentBuilder>[]
    | ((candidate: ArchivedDirectMessageCandidate) => ActionRowBuilder<MessageActionRowComponentBuilder>[]) = []
) {
  for (const candidate of candidates) {
    const result = await editDiscordDirectMessage({
      channelId: candidate.channelId,
      messageId: candidate.messageId,
      content,
      embeds,
      components: typeof components === 'function' ? components(candidate) : components
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
      discordDmMessageId: null,
      recipientResponseDiscordDmChannelId: null,
      recipientResponseDiscordDmMessageId: null
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

function upsertTrackedDirectMessageEntry(
  state: TrackedDirectMessageState,
  options: {
    channelId: string | null;
    messageId: string | null;
    sortAt?: Date | null;
    isActive?: boolean;
    notificationId?: string;
    promptId?: string;
    creatorPlayIntentId?: string;
  }
) {
  const { channelId, messageId } = options

  if (!channelId || !messageId) {
    return
  }

  state.channelIds.add(channelId)

  const key = `${channelId}:${messageId}`
  const entry = state.entries.get(key) ?? {
    channelId,
    messageId,
    sortAt: 0,
    isActive: false,
    notificationIds: new Set<string>(),
    promptIds: new Set<string>(),
    creatorPlayIntentIds: new Set<string>()
  }

  entry.sortAt = Math.max(entry.sortAt, options.sortAt?.getTime() ?? 0)
  entry.isActive = entry.isActive || Boolean(options.isActive)

  if (options.notificationId) {
    entry.notificationIds.add(options.notificationId)
  }

  if (options.promptId) {
    entry.promptIds.add(options.promptId)
  }

  if (options.creatorPlayIntentId) {
    entry.creatorPlayIntentIds.add(options.creatorPlayIntentId)
  }

  state.entries.set(key, entry)
}

async function collectTrackedDirectMessageStateForUser(userId: string, now: Date) {
  const [discordIdentity, creatorSummaries, notifications, prompts] = await Promise.all([
    prisma.userIdentity.findFirst({
      where: {
        userId,
        provider: AuthProvider.DISCORD
      },
      select: {
        providerUserId: true
      }
    }),
    prisma.playIntent.findMany({
      where: {
        userId,
        creatorDiscordDmChannelId: {
          not: null
        },
        creatorDiscordDmMessageId: {
          not: null
        }
      },
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        creatorDiscordDmChannelId: true,
        creatorDiscordDmMessageId: true
      }
    }),
    prisma.notification.findMany({
      where: {
        userId,
        OR: [
          {
            discordDmChannelId: {
              not: null
            },
            discordDmMessageId: {
              not: null
            }
          },
          {
            recipientResponseDiscordDmChannelId: {
              not: null
            },
            recipientResponseDiscordDmMessageId: {
              not: null
            }
          }
        ]
      },
      select: {
        id: true,
        createdAt: true,
        deliveredAt: true,
        respondedAt: true,
        responseChoice: true,
        discordDmChannelId: true,
        discordDmMessageId: true,
        recipientResponseDiscordDmChannelId: true,
        recipientResponseDiscordDmMessageId: true,
        playIntent: {
          select: {
            expiresAt: true,
            userId: true
          }
        }
      }
    }),
    prisma.discordAutoPlayPrompt.findMany({
      where: {
        userId,
        discordDmChannelId: {
          not: null
        },
        discordDmMessageId: {
          not: null
        }
      },
      select: {
        id: true,
        createdAt: true,
        deliveredAt: true,
        respondedAt: true,
        createdPlayIntentId: true,
        discordDmChannelId: true,
        discordDmMessageId: true
      }
    })
  ])

  const state: TrackedDirectMessageState = {
    discordUserId: discordIdentity?.providerUserId ?? null,
    channelIds: new Set<string>(),
    entries: new Map<string, TrackedDirectMessageEntry>()
  }

  for (const summary of creatorSummaries) {
    upsertTrackedDirectMessageEntry(state, {
      channelId: summary.creatorDiscordDmChannelId,
      messageId: summary.creatorDiscordDmMessageId,
      sortAt: summary.createdAt,
      isActive: summary.expiresAt > now,
      creatorPlayIntentId: summary.id
    })
  }

  for (const notification of notifications) {
    const isCreatorTrackedMessage = notification.playIntent?.userId === userId
    const isInterestedRecipientMessage = notification.responseChoice === NotificationResponseChoice.JOIN
    const preserveNotificationMessage = Boolean(
      notification.playIntent?.expiresAt
      && notification.playIntent.expiresAt > now
      && (isCreatorTrackedMessage || isInterestedRecipientMessage)
    )

    upsertTrackedDirectMessageEntry(state, {
      channelId: notification.discordDmChannelId,
      messageId: notification.discordDmMessageId,
      sortAt: notification.deliveredAt ?? notification.createdAt,
      isActive: preserveNotificationMessage,
      notificationId: notification.id
    })

    upsertTrackedDirectMessageEntry(state, {
      channelId: notification.recipientResponseDiscordDmChannelId,
      messageId: notification.recipientResponseDiscordDmMessageId,
      sortAt: notification.respondedAt ?? notification.deliveredAt ?? notification.createdAt,
      isActive: preserveNotificationMessage,
      notificationId: notification.id
    })
  }

  for (const prompt of prompts) {
    upsertTrackedDirectMessageEntry(state, {
      channelId: prompt.discordDmChannelId,
      messageId: prompt.discordDmMessageId,
      sortAt: prompt.deliveredAt ?? prompt.createdAt,
      isActive: prompt.respondedAt == null && !prompt.createdPlayIntentId,
      promptId: prompt.id
    })
  }

  return state
}

async function pruneTrackedDirectMessagesForUser(state: TrackedDirectMessageState) {
  const preservedMessageIds = new Set<string>()

  for (const entry of state.entries.values()) {
    if (entry.isActive) {
      preservedMessageIds.add(entry.messageId)
    }
  }

  const notificationIdsToClear = new Set<string>()
  const promptIdsToClear = new Set<string>()
  const creatorPlayIntentIdsToClear = new Set<string>()
  let deletedCount = 0
  let attemptedCount = 0

  for (const entry of state.entries.values()) {
    if (entry.isActive) {
      continue
    }

    attemptedCount += 1

    if (!(await tryDeleteDirectMessage(entry.channelId, entry.messageId))) {
      preservedMessageIds.add(entry.messageId)
      continue
    }

    deletedCount += 1

    for (const notificationId of entry.notificationIds) {
      notificationIdsToClear.add(notificationId)
    }

    for (const promptId of entry.promptIds) {
      promptIdsToClear.add(promptId)
    }

    for (const creatorPlayIntentId of entry.creatorPlayIntentIds) {
      creatorPlayIntentIdsToClear.add(creatorPlayIntentId)
    }
  }

  await Promise.all([
    clearNotificationDmReferences([...notificationIdsToClear]),
    clearPromptDmReferences([...promptIdsToClear]),
    clearCreatorSummaryDmReferences([...creatorPlayIntentIdsToClear])
  ])

  return {
    discordUserId: state.discordUserId,
    channelIds: state.channelIds,
    preservedMessageIds,
    deletedCount,
    attemptedCount
  }
}

async function deleteUntrackedDirectMessagesForUser(options: {
  discordUserId: string | null;
  preservedMessageIds: Set<string>;
  channelIds: Set<string>;
}) {
  const botUserId = await getDiscordBotUserId()

  if (!botUserId || !options.discordUserId) {
    return {
      deletedCount: 0,
      attemptedCount: 0
    }
  }

  const directMessageChannel = await getOrCreateDiscordDirectMessageChannel(options.discordUserId)

  if (directMessageChannel?.id) {
    options.channelIds.add(directMessageChannel.id)
  }

  let deletedCount = 0
  let attemptedCount = 0

  for (const channelId of options.channelIds) {
    let before: string | undefined
    let inspectedCount = 0

    while (inspectedCount < discordDmCleanupSweepMessageCap) {
      const messages = await fetchDiscordChannelMessages({
        channelId,
        before,
        limit: discordDmCleanupSweepPageLimit
      })

      if (messages.length === 0) {
        break
      }

      for (const message of messages) {
        inspectedCount += 1

        if (message.authorId !== botUserId || options.preservedMessageIds.has(message.id)) {
          if (inspectedCount >= discordDmCleanupSweepMessageCap) {
            break
          }

          continue
        }

        attemptedCount += 1

        if (await tryDeleteDirectMessage(channelId, message.id)) {
          deletedCount += 1
        }

        if (inspectedCount >= discordDmCleanupSweepMessageCap) {
          break
        }
      }

      if (messages.length < discordDmCleanupSweepPageLimit || inspectedCount >= discordDmCleanupSweepMessageCap) {
        break
      }

      before = messages[messages.length - 1]?.id
    }
  }

  return {
    deletedCount,
    attemptedCount
  }
}

export async function deletePlayIntentDirectMessages(playIntentId: string) {
  const [playIntent, notifications] = await Promise.all([
    prisma.playIntent.findUnique({
      where: {
        id: playIntentId
      },
      select: {
        id: true,
        creatorDiscordDmChannelId: true,
        creatorDiscordDmMessageId: true
      }
    }),
    prisma.notification.findMany({
      where: {
        playIntentId,
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
  ])

  if (!playIntent) {
    return {
      deletedCount: 0,
      attemptedCount: 0
    }
  }

  const trackedMessages = new Map<string, {
    channelId: string;
    messageId: string;
    notificationIds: string[];
    clearsCreatorSummary: boolean;
  }>()

  if (playIntent.creatorDiscordDmChannelId && playIntent.creatorDiscordDmMessageId) {
    trackedMessages.set(`${playIntent.creatorDiscordDmChannelId}:${playIntent.creatorDiscordDmMessageId}`, {
      channelId: playIntent.creatorDiscordDmChannelId,
      messageId: playIntent.creatorDiscordDmMessageId,
      notificationIds: [],
      clearsCreatorSummary: true
    })
  }

  for (const notification of notifications) {
    if (!notification.discordDmChannelId || !notification.discordDmMessageId) {
      continue
    }

    const key = `${notification.discordDmChannelId}:${notification.discordDmMessageId}`
    const existingMessage = trackedMessages.get(key)

    if (existingMessage) {
      existingMessage.notificationIds.push(notification.id)
      continue
    }

    trackedMessages.set(key, {
      channelId: notification.discordDmChannelId,
      messageId: notification.discordDmMessageId,
      notificationIds: [notification.id],
      clearsCreatorSummary: false
    })
  }

  const deletedNotificationIds = new Set<string>()
  let clearCreatorSummary = false
  let deletedCount = 0

  for (const trackedMessage of trackedMessages.values()) {
    if (!(await tryDeleteDirectMessage(trackedMessage.channelId, trackedMessage.messageId))) {
      continue
    }

    deletedCount += 1

    for (const notificationId of trackedMessage.notificationIds) {
      deletedNotificationIds.add(notificationId)
    }

    if (trackedMessage.clearsCreatorSummary) {
      clearCreatorSummary = true
    }
  }

  await Promise.all([
    clearNotificationDmReferences([...deletedNotificationIds]),
    clearCreatorSummary ? clearCreatorSummaryDmReferences([playIntentId]) : Promise.resolve()
  ])

  return {
    deletedCount,
    attemptedCount: trackedMessages.size
  }
}

export async function deleteCreatorPlayIntentDirectMessages(
  playIntentId: string,
  userId: string,
  options: {
    summaryMessage?: DirectMessageTarget;
  } = {}
) {
  const [playIntent, notifications] = await Promise.all([
    prisma.playIntent.findFirst({
      where: {
        id: playIntentId,
        userId
      },
      select: {
        id: true,
        creatorDiscordDmChannelId: true,
        creatorDiscordDmMessageId: true
      }
    }),
    prisma.notification.findMany({
      where: {
        playIntentId,
        userId,
        OR: [
          {
            discordDmChannelId: {
              not: null
            },
            discordDmMessageId: {
              not: null
            }
          },
          {
            recipientResponseDiscordDmChannelId: {
              not: null
            },
            recipientResponseDiscordDmMessageId: {
              not: null
            }
          }
        ]
      },
      select: {
        id: true,
        discordDmChannelId: true,
        discordDmMessageId: true,
        recipientResponseDiscordDmChannelId: true,
        recipientResponseDiscordDmMessageId: true
      }
    })
  ])

  if (!playIntent) {
    return {
      deletedCount: 0,
      attemptedCount: 0
    }
  }

  const trackedMessages = new Map<string, {
    channelId: string;
    messageId: string;
    notificationIds: string[];
    clearsCreatorSummary: boolean;
  }>()

  const summaryMessage = options.summaryMessage
    ?? (playIntent.creatorDiscordDmChannelId && playIntent.creatorDiscordDmMessageId
      ? {
          channelId: playIntent.creatorDiscordDmChannelId,
          messageId: playIntent.creatorDiscordDmMessageId
        }
      : null)

  if (summaryMessage) {
    trackedMessages.set(`${summaryMessage.channelId}:${summaryMessage.messageId}`, {
      channelId: summaryMessage.channelId,
      messageId: summaryMessage.messageId,
      notificationIds: [],
      clearsCreatorSummary: true
    })
  }

  for (const notification of notifications) {
    if (notification.discordDmChannelId && notification.discordDmMessageId) {
      const key = `${notification.discordDmChannelId}:${notification.discordDmMessageId}`
      const existingMessage = trackedMessages.get(key)

      if (existingMessage) {
        existingMessage.notificationIds.push(notification.id)
      } else {
        trackedMessages.set(key, {
          channelId: notification.discordDmChannelId,
          messageId: notification.discordDmMessageId,
          notificationIds: [notification.id],
          clearsCreatorSummary: false
        })
      }
    }

    if (!notification.recipientResponseDiscordDmChannelId || !notification.recipientResponseDiscordDmMessageId) {
      continue
    }

    const responseKey = `${notification.recipientResponseDiscordDmChannelId}:${notification.recipientResponseDiscordDmMessageId}`
    const existingResponseMessage = trackedMessages.get(responseKey)

    if (existingResponseMessage) {
      existingResponseMessage.notificationIds.push(notification.id)
      continue
    }

    trackedMessages.set(responseKey, {
      channelId: notification.recipientResponseDiscordDmChannelId,
      messageId: notification.recipientResponseDiscordDmMessageId,
      notificationIds: [notification.id],
      clearsCreatorSummary: false
    })
  }

  const deletedNotificationIds = new Set<string>()
  let clearCreatorSummary = false
  let deletedCount = 0

  for (const trackedMessage of trackedMessages.values()) {
    if (!(await tryDeleteDirectMessage(trackedMessage.channelId, trackedMessage.messageId))) {
      continue
    }

    deletedCount += 1

    for (const notificationId of trackedMessage.notificationIds) {
      deletedNotificationIds.add(notificationId)
    }

    if (trackedMessage.clearsCreatorSummary) {
      clearCreatorSummary = true
    }
  }

  await Promise.all([
    clearNotificationDmReferences([...deletedNotificationIds]),
    clearCreatorSummary ? clearCreatorSummaryDmReferences([playIntentId]) : Promise.resolve()
  ])

  return {
    deletedCount,
    attemptedCount: trackedMessages.size
  }
}

export async function deleteUserPlayIntentDirectMessages(
  playIntentId: string,
  userId: string,
  options: {
    anchorMessage?: DirectMessageTarget;
    anchorNotificationId?: string;
  } = {}
) {
  const notifications = await prisma.notification.findMany({
    where: {
      playIntentId,
      userId,
      OR: [
        {
          discordDmChannelId: {
            not: null
          },
          discordDmMessageId: {
            not: null
          }
        },
        {
          recipientResponseDiscordDmChannelId: {
            not: null
          },
          recipientResponseDiscordDmMessageId: {
            not: null
          }
        }
      ]
    },
    select: {
      id: true,
      discordDmChannelId: true,
      discordDmMessageId: true,
      recipientResponseDiscordDmChannelId: true,
      recipientResponseDiscordDmMessageId: true
    }
  })

  const trackedMessages = new Map<string, {
    channelId: string;
    messageId: string;
    notificationIds: string[];
  }>()

  if (options.anchorMessage) {
    trackedMessages.set(`${options.anchorMessage.channelId}:${options.anchorMessage.messageId}`, {
      channelId: options.anchorMessage.channelId,
      messageId: options.anchorMessage.messageId,
      notificationIds: options.anchorNotificationId ? [options.anchorNotificationId] : []
    })
  }

  for (const notification of notifications) {
    if (notification.discordDmChannelId && notification.discordDmMessageId) {
      const key = `${notification.discordDmChannelId}:${notification.discordDmMessageId}`
      const existingMessage = trackedMessages.get(key)

      if (existingMessage) {
        existingMessage.notificationIds.push(notification.id)
      } else {
        trackedMessages.set(key, {
          channelId: notification.discordDmChannelId,
          messageId: notification.discordDmMessageId,
          notificationIds: [notification.id]
        })
      }
    }

    if (!notification.recipientResponseDiscordDmChannelId || !notification.recipientResponseDiscordDmMessageId) {
      continue
    }

    const responseKey = `${notification.recipientResponseDiscordDmChannelId}:${notification.recipientResponseDiscordDmMessageId}`
    const existingResponseMessage = trackedMessages.get(responseKey)

    if (existingResponseMessage) {
      existingResponseMessage.notificationIds.push(notification.id)
      continue
    }

    trackedMessages.set(responseKey, {
      channelId: notification.recipientResponseDiscordDmChannelId,
      messageId: notification.recipientResponseDiscordDmMessageId,
      notificationIds: [notification.id]
    })
  }

  const deletedNotificationIds = new Set<string>()
  let deletedCount = 0

  for (const trackedMessage of trackedMessages.values()) {
    if (!(await tryDeleteDirectMessage(trackedMessage.channelId, trackedMessage.messageId))) {
      continue
    }

    deletedCount += 1

    for (const notificationId of trackedMessage.notificationIds) {
      deletedNotificationIds.add(notificationId)
    }
  }

  await clearNotificationDmReferences([...deletedNotificationIds])

  return {
    deletedCount,
    attemptedCount: trackedMessages.size
  }
}

export async function deleteSettledDiscordDirectMessagesForUser(userId: string) {
  const now = new Date()
  const [creatorPlayIntents, recipientNotifications, settledPrompts] = await Promise.all([
    prisma.playIntent.findMany({
      where: {
        userId,
        expiresAt: {
          lte: now
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
        id: true
      }
    }),
    prisma.notification.findMany({
      where: {
        userId,
        playIntentId: {
          not: null
        },
        discordDmChannelId: {
          not: null
        },
        discordDmMessageId: {
          not: null
        },
        playIntent: {
          expiresAt: {
            lte: now
          }
        }
      },
      select: {
        playIntentId: true
      }
    }),
    prisma.discordAutoPlayPrompt.findMany({
      where: {
        userId,
        respondedAt: {
          not: null
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
  ])

  const creatorPlayIntentIds = [...new Set(creatorPlayIntents.map((playIntent) => playIntent.id))]
  const creatorPlayIntentIdSet = new Set(creatorPlayIntentIds)
  const recipientPlayIntentIds = [...new Set(
    recipientNotifications
      .flatMap((notification) => {
        const { playIntentId } = notification

        return playIntentId && !creatorPlayIntentIdSet.has(playIntentId)
          ? [playIntentId]
          : []
      })
  )]

  const [creatorResults, recipientResults] = await Promise.all([
    Promise.all(creatorPlayIntentIds.map((playIntentId) => deleteCreatorPlayIntentDirectMessages(playIntentId, userId))),
    Promise.all(recipientPlayIntentIds.map((playIntentId) => deleteUserPlayIntentDirectMessages(playIntentId, userId)))
  ])

  const promptIdsToClear: string[] = []
  let promptDeletedCount = 0
  let promptAttemptedCount = 0

  for (const prompt of settledPrompts) {
    if (!prompt.discordDmChannelId || !prompt.discordDmMessageId) {
      continue
    }

    promptAttemptedCount += 1

    if (!(await tryDeleteDirectMessage(prompt.discordDmChannelId, prompt.discordDmMessageId))) {
      continue
    }

    promptDeletedCount += 1
    promptIdsToClear.push(prompt.id)
  }

  await clearPromptDmReferences(promptIdsToClear)

  const trackedDirectMessageState = await collectTrackedDirectMessageStateForUser(userId, now)
  const pruneResult = await pruneTrackedDirectMessagesForUser(trackedDirectMessageState)
  const sweepResult = await deleteUntrackedDirectMessagesForUser(pruneResult)

  return {
    deletedCount: creatorResults.reduce((total, result) => total + result.deletedCount, 0)
      + recipientResults.reduce((total, result) => total + result.deletedCount, 0)
      + promptDeletedCount
      + pruneResult.deletedCount
      + sweepResult.deletedCount,
    attemptedCount: creatorResults.reduce((total, result) => total + result.attemptedCount, 0)
      + recipientResults.reduce((total, result) => total + result.attemptedCount, 0)
      + promptAttemptedCount
      + pruneResult.attemptedCount
      + sweepResult.attemptedCount
  }
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
      ...((options.replaceRecipientMessages && playIntentIds)
        ? {}
        : {
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
              },
              {
                notifications: {
                  some: {
                    type: {
                      in: [...archivedPlayIntentNotificationTypes]
                    },
                    ...(options.deliveredBefore
                      ? {
                          respondedAt: {
                            lte: options.deliveredBefore
                          }
                        }
                      : {}),
                    recipientResponseDiscordDmChannelId: {
                      not: null
                    },
                    recipientResponseDiscordDmMessageId: {
                      not: null
                    }
                  }
                }
              }
            ]
          })
    },
    select: {
      id: true,
      selectionMode: true,
      windowStartsAt: true,
      windowEndsAt: true,
      creatorDiscordDmChannelId: true,
      creatorDiscordDmMessageId: true,
      discordSpace: {
        select: {
          status: true
        }
      },
      user: {
        select: {
          id: true,
          displayName: true,
          timezoneId: true,
          identities: {
            where: {
              provider: AuthProvider.DISCORD
            },
            select: {
              providerUserId: true
            }
          }
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
          ...(options.replaceRecipientMessages
            ? {}
            : {
                OR: [
                  {
                    discordDmChannelId: {
                      not: null
                    },
                    discordDmMessageId: {
                      not: null
                    }
                  },
                  {
                    recipientResponseDiscordDmChannelId: {
                      not: null
                    },
                    recipientResponseDiscordDmMessageId: {
                      not: null
                    }
                  }
                ]
              })
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
          recipientResponseDiscordDmChannelId: true,
          recipientResponseDiscordDmMessageId: true,
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

    const creatorArchivePreview = buildArchivedCreatorPlayIntentPreview(
      playIntent.id,
      playIntent,
      playIntent.user.timezoneId
    )
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
      const existingNotifications = notificationsByUserId.get(notification.userId)

      if (existingNotifications) {
        existingNotifications.push(notification)
      } else {
        notificationsByUserId.set(notification.userId, [notification])
      }

      if (notification.userId === playIntent.user.id && notification.discordDmChannelId && notification.discordDmMessageId) {
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
      ? await tryArchiveDirectMessage(
          creatorCandidates,
          creatorArchivePreview.content,
          creatorArchivePreview.embeds,
          creatorArchivePreview.components
        )
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
      const recipientInterested = latestAudienceNotification?.responseChoice === NotificationResponseChoice.JOIN
      const recipientPassed = latestAudienceNotification?.responseChoice === NotificationResponseChoice.DECLINE
      const recipientMutedCreator = mutedRecipientUserIds.has(userId)
      const archiveEmbeds = buildArchivedPlayIntentEmbeds(buildArchivedPlayIntentSummary(playIntent, notifications[0]?.user.timezoneId ?? playIntent.user.timezoneId).body)
      const candidates = notifications
        .flatMap<ArchivedNotificationCandidate>((notification) => {
          const candidateEntries: ArchivedNotificationCandidate[] = []

          if (notification.discordDmChannelId && notification.discordDmMessageId) {
            candidateEntries.push({
              channelId: notification.discordDmChannelId,
              messageId: notification.discordDmMessageId,
              notificationId: notification.id,
              priority: getNotificationArchivePriority(notification.type)
            })
          }

          if (notification.recipientResponseDiscordDmChannelId && notification.recipientResponseDiscordDmMessageId) {
            candidateEntries.push({
              channelId: notification.recipientResponseDiscordDmChannelId,
              messageId: notification.recipientResponseDiscordDmMessageId,
              notificationId: notification.id,
              priority: getNotificationArchivePriority(notification.type) + 100
            })
          }

          return candidateEntries
        })
        .sort((left, right) => left.priority - right.priority)

      // Quiet expiry/archive edits the existing tracked DM in place.
      // Manual end paths only send a fresh ended-summary DM to recipients who explicitly joined.
      // Unanswered recipients stay on the quieter edit-in-place archival path.
      if (options.replaceRecipientMessages && recipientInterested && !recipientPassed && !recipientMutedCreator) {
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
              components: buildArchivedAudienceCleanupComponents(archivedNotification.id)
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

        if (candidates.length === 0) {
          continue
        }
      }

      if (candidates.length === 0) {
        continue
      }

      const keptMessageId = await tryArchiveDirectMessage(
        candidates,
        buildDiscordMessageHeading('🛑 Call to Play Ended'),
        archiveEmbeds,
        (candidate) => buildArchivedAudienceCleanupComponents((candidate as ArchivedNotificationCandidate).notificationId)
      )

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