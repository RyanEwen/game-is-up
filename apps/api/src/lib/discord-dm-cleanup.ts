/**
 * Tracked Discord DM cleanup, archive, and reference-update flows.
 *
 * The bot retains anchor DMs for both creator summaries and per-recipient
 * invite threads so quiet edits land in place and substantive changes can
 * cleanly replace the right message. This module is the central place where
 * those anchors are archived, reference-updated when a play intent rotates
 * its tracked message, and swept of dangling bot-authored replies. Chains are
 * shown as ended when their play-intent window closes and then deleted outright
 * once a 12-hour retention window after that close has elapsed (see
 * `sweepOldDiscordDirectMessages`). An explicit creator action button is exposed
 * once a thread goes stale.
 */

import { AuthProvider, NotificationType } from '@prisma/client'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js'
import { NotificationResponseChoice } from '@prisma/client'
import {
  deleteDiscordDirectMessage,
  editDiscordDirectMessage,
  fetchDiscordChannelMessages,
  getDiscordBotUserId,
  getOrCreateDiscordDirectMessageChannel,
  supportsDiscordInteractiveMessages,
} from './discord-bot-runtime.js'
import {
  buildArchivedNotificationReferenceUpdates,
  type ArchivedNotificationCandidate as ArchivedNotificationReferenceCandidate,
  type NotificationDmReferenceUpdate,
} from './discord-dm-cleanup-reference-updates.js'
import { collectReplyMessageIdsForCleanup } from './discord-dm-cleanup-thread.js'
import {
  buildArchiveCleanupRow,
  buildDiscordMessageHeading,
  buildOpenInAppButton,
  decorateFieldLabel,
} from './discord-dm-formatting.js'
import { buildDiscordChannelUrl } from './discord-channel-urls.js'
import { getInterestedUsersByPlayIntentId } from './play-intent-interested-users.js'
import {
  buildClientPlayIntentUrl,
  buildClientPlayUrl,
} from './play-intent-urls.js'
import { callToPlayEndedSystemNotification } from './play-intent-system-notifications.js'
import { formatPlayIntentWindowLabel } from './play-intent-time-format.js'
import { prisma } from './prisma.js'
import {
  creatorPlayIntentSummaryPrefix,
  playIntentNotificationPrefix,
} from './play-intent-interaction-ids.js'

const discordDmRetentionMs = 12 * 60 * 60 * 1000
const discordDmCleanupSweepPageLimit = 100
const discordDmCleanupSweepMessageCap = 500
const discordDmDeleteSweepIntentCap = 100
const archivedPlayIntentNotificationTypes = [
  NotificationType.FRIEND_PLAYING,
  NotificationType.SCHEDULED_PLAY_INTENT_REMINDER,
  NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN,
  NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED,
] as const

const archivedCreatorSystemNotificationTypes = [
  NotificationType.SYSTEM,
] as const

type ArchivedDirectMessageCandidate = {
  channelId: string
  messageId: string
  priority: number
}

type ArchivedCreatorCandidate = ArchivedDirectMessageCandidate & {
  notificationId: string | null
}

type ArchivedNotificationCandidate = ArchivedDirectMessageCandidate &
  ArchivedNotificationReferenceCandidate

type TrackedDirectMessageEntry = {
  channelId: string
  messageId: string
  sortAt: number
  isActive: boolean
  notificationIds: Set<string>
  promptIds: Set<string>
  creatorPlayIntentIds: Set<string>
}

type TrackedDirectMessageState = {
  discordUserId: string | null
  channelIds: Set<string>
  entries: Map<string, TrackedDirectMessageEntry>
}

type DirectMessageTarget = {
  channelId: string
  messageId: string
}

function buildPlayAppUrl(playIntentId?: string) {
  return playIntentId
    ? buildClientPlayIntentUrl(playIntentId)
    : buildClientPlayUrl()
}

function buildOpenInAppRow(playIntentId?: string) {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    buildOpenInAppButton(buildPlayAppUrl(playIntentId), 'Open in App'),
  )
}

export function buildArchivedAudienceCleanupComponents(
  notificationId: string,
  options: {
    forceInteractive?: boolean
    playIntentId?: string
  } = {},
) {
  if (!(options.forceInteractive ?? supportsDiscordInteractiveMessages())) {
    return [buildOpenInAppRow(options.playIntentId)]
  }

  return buildArchiveCleanupRow({
    archiveCustomId: `${playIntentNotificationPrefix}:${notificationId}:cleanup`,
    openInAppUrl: buildPlayAppUrl(options.playIntentId),
  })
}

export function buildArchivedCreatorCleanupComponents(
  playIntentId: string,
  options: {
    hasDeletableDiscordSpace?: boolean
  } = {},
) {
  if (!supportsDiscordInteractiveMessages()) {
    return [buildOpenInAppRow(playIntentId)]
  }

  return buildArchiveCleanupRow({
    archiveCustomId: `${creatorPlayIntentSummaryPrefix}:${playIntentId}:cleanup`,
    openInAppUrl: buildPlayAppUrl(playIntentId),
    extraButtons: options.hasDeletableDiscordSpace
      ? [
          new ButtonBuilder()
            .setCustomId(
              `${creatorPlayIntentSummaryPrefix}:${playIntentId}:delete-space`,
            )
            .setLabel('Delete Discord channel')
            .setStyle(ButtonStyle.Danger),
        ]
      : undefined,
  })
}

function summarizeArchivedPlayIntentGames(playIntent: {
  selectionMode: 'ENTIRE_LIBRARY' | 'SELECTED_GAMES'
  games: { game: { title: string } }[]
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
    selectionMode: 'ENTIRE_LIBRARY' | 'SELECTED_GAMES'
    windowStartsAt: Date
    windowEndsAt: Date
    user: {
      displayName: string
      identities?: { providerUserId: string }[]
    }
    games: { game: { title: string } }[]
  },
  timezoneId: string,
) {
  const creatorDiscordUserId = playIntent.user.identities?.[0]?.providerUserId
  const creatorLabel = creatorDiscordUserId
    ? `<@${creatorDiscordUserId}>`
    : playIntent.user.displayName
  const gamesLabel = summarizeArchivedPlayIntentGames(playIntent)
  const windowLabel = formatPlayIntentWindowLabel(
    playIntent.windowStartsAt,
    playIntent.windowEndsAt,
    timezoneId,
  )

  return {
    title: callToPlayEndedSystemNotification.title,
    body: [
      `Creator: ${creatorLabel}`,
      `Games: ${gamesLabel}`,
      `When: ${windowLabel}`,
      'Status: This call to play is no longer active.',
    ].join('\n'),
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

      return [
        {
          name: decorateFieldLabel(label),
          value: labeledMatch[2].trim(),
          inline: false,
        },
      ]
    })

  return [new EmbedBuilder().setColor(0xef4444).addFields(fields)]
}

type ArchivedCreatorDiscordSpace = {
  status:
    | 'REQUESTED'
    | 'PROVISIONING'
    | 'ACTIVE'
    | 'RETAINED'
    | 'DELETE_REQUESTED'
    | 'DELETED'
    | 'PROVISION_FAILED'
  serverId?: string | null
  textChannelId?: string | null
  textChannelName?: string | null
  voiceChannelId?: string | null
  voiceChannelName?: string | null
  inviteUrl?: string | null
}

/**
 * Condenses interested-party labels for an archived summary embed, mirroring the
 * live creator summary cap of five names plus an overflow count.
 */
function formatArchivedInterestedLabels(labels: string[]) {
  if (labels.length <= 5) {
    return labels.join(', ')
  }

  return `${labels.slice(0, 5).join(', ')} +${labels.length - 5} more`
}

/**
 * Builds the extra archived-summary lines that preserve who was interested and
 * how to reach the temporary channels once a call to play ends. Channel links
 * are omitted once the Discord space is deleted because the targets no longer
 * resolve.
 */
function buildArchivedCreatorDetailLines(
  discordSpace: ArchivedCreatorDiscordSpace | null | undefined,
  interestedLabels: string[],
) {
  const lines: string[] = []

  if (interestedLabels.length > 0) {
    lines.push(
      `Interested: ${formatArchivedInterestedLabels(interestedLabels)}`,
    )
  }

  if (discordSpace && discordSpace.status !== 'DELETED') {
    const serverId = discordSpace.serverId ?? null
    const textChannelUrl = serverId
      ? buildDiscordChannelUrl(serverId, discordSpace.textChannelId)
      : null
    const voiceChannelUrl = serverId
      ? buildDiscordChannelUrl(serverId, discordSpace.voiceChannelId)
      : null

    if (textChannelUrl) {
      lines.push(`Text channel: ${textChannelUrl}`)
    } else if (discordSpace.textChannelName) {
      lines.push(`Text channel: ${discordSpace.textChannelName}`)
    }

    if (voiceChannelUrl) {
      lines.push(`Voice channel: ${voiceChannelUrl}`)
    } else if (discordSpace.voiceChannelName) {
      lines.push(`Voice channel: ${discordSpace.voiceChannelName}`)
    }

    if (discordSpace.inviteUrl) {
      lines.push(`Invite link: ${discordSpace.inviteUrl}`)
    }
  }

  return lines
}

export function buildArchivedCreatorPlayIntentPreview(
  playIntentId: string,
  playIntent: {
    selectionMode: 'ENTIRE_LIBRARY' | 'SELECTED_GAMES'
    windowStartsAt: Date
    windowEndsAt: Date
    user: {
      displayName: string
      identities?: { providerUserId: string }[]
    }
    games: { game: { title: string } }[]
    discordSpace?: ArchivedCreatorDiscordSpace | null
  },
  timezoneId: string,
  interestedLabels: string[] = [],
) {
  const summary = buildArchivedPlayIntentSummary(playIntent, timezoneId)
  const detailLines = buildArchivedCreatorDetailLines(
    playIntent.discordSpace,
    interestedLabels,
  )
  const summaryBody =
    detailLines.length > 0
      ? `${summary.body}\n${detailLines.join('\n')}`
      : summary.body
  const discordSpaceStatus = playIntent.discordSpace?.status
  const hasDeletableDiscordSpace =
    discordSpaceStatus != null &&
    discordSpaceStatus !== 'DELETED' &&
    discordSpaceStatus !== 'REQUESTED' &&
    discordSpaceStatus !== 'PROVISIONING'

  return {
    content: '',
    embeds: buildArchivedPlayIntentEmbeds(summaryBody),
    components: buildArchivedCreatorCleanupComponents(playIntentId, {
      hasDeletableDiscordSpace,
    }),
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
    | ((
        candidate: ArchivedDirectMessageCandidate,
      ) => ActionRowBuilder<MessageActionRowComponentBuilder>[]) = [],
) {
  for (const candidate of candidates) {
    const result = await editDiscordDirectMessage({
      channelId: candidate.channelId,
      messageId: candidate.messageId,
      content,
      embeds,
      components:
        typeof components === 'function' ? components(candidate) : components,
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
    messageId,
  })

  return result.status === 'deleted'
}

async function deletePromptDirectMessageThread(options: {
  promptId?: string
  channelId: string
  messageId: string
}) {
  await deleteReplyMessagesReferencingTargets({
    targets: [
      {
        channelId: options.channelId,
        messageId: options.messageId,
      },
    ],
  })

  const deleted = await tryDeleteDirectMessage(
    options.channelId,
    options.messageId,
  )

  if (!deleted || !options.promptId) {
    return deleted
  }

  await clearPromptDmReferences([options.promptId])
  return true
}

export async function deleteReplyMessagesReferencingTargets(options: {
  targets: DirectMessageTarget[]
  preservedTargets?: DirectMessageTarget[]
}) {
  const botUserId = await getDiscordBotUserId()

  if (!botUserId || options.targets.length === 0) {
    return
  }

  const targetMessageIdsByChannel = new Map<string, Set<string>>()

  for (const target of options.targets) {
    const channelTargetMessageIds =
      targetMessageIdsByChannel.get(target.channelId) ?? new Set<string>()
    channelTargetMessageIds.add(target.messageId)
    targetMessageIdsByChannel.set(target.channelId, channelTargetMessageIds)
  }

  const preservedMessageIds = new Set(
    (options.preservedTargets ?? []).map((target) => target.messageId),
  )

  for (const [
    channelId,
    targetMessageIds,
  ] of targetMessageIdsByChannel.entries()) {
    let before: string | undefined
    let inspectedCount = 0

    while (inspectedCount < discordDmCleanupSweepMessageCap) {
      const messages = await fetchDiscordChannelMessages({
        channelId,
        before,
        limit: discordDmCleanupSweepPageLimit,
      })

      if (messages.length === 0) {
        break
      }

      const replyMessageIds = collectReplyMessageIdsForCleanup({
        messages,
        botUserId,
        referencedMessageIds: targetMessageIds,
        preservedMessageIds,
      })

      for (const messageId of replyMessageIds) {
        await tryDeleteDirectMessage(channelId, messageId)
      }

      inspectedCount += messages.length

      if (
        messages.length < discordDmCleanupSweepPageLimit ||
        inspectedCount >= discordDmCleanupSweepMessageCap
      ) {
        break
      }

      before = messages[messages.length - 1]?.id
    }
  }
}

async function clearNotificationDmReferences(notificationIds: string[]) {
  if (notificationIds.length === 0) {
    return
  }

  await prisma.notification.updateMany({
    where: {
      id: {
        in: notificationIds,
      },
    },
    data: {
      discordDmChannelId: null,
      discordDmMessageId: null,
    },
  })
}

async function clearPromptDmReferences(promptIds: string[]) {
  if (promptIds.length === 0) {
    return
  }

  await prisma.discordAutoPlayPrompt.updateMany({
    where: {
      id: {
        in: promptIds,
      },
    },
    data: {
      discordDmChannelId: null,
      discordDmMessageId: null,
    },
  })
}

async function clearCreatorSummaryDmReferences(playIntentIds: string[]) {
  if (playIntentIds.length === 0) {
    return
  }

  await prisma.playIntent.updateMany({
    where: {
      id: {
        in: playIntentIds,
      },
    },
    data: {
      creatorDiscordDmChannelId: null,
      creatorDiscordDmMessageId: null,
    },
  })
}

function upsertTrackedDirectMessageEntry(
  state: TrackedDirectMessageState,
  options: {
    channelId: string | null
    messageId: string | null
    sortAt?: Date | null
    isActive?: boolean
    notificationId?: string
    promptId?: string
    creatorPlayIntentId?: string
  },
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
    creatorPlayIntentIds: new Set<string>(),
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

async function collectTrackedDirectMessageStateForUser(
  userId: string,
  now: Date,
) {
  const [discordIdentity, creatorSummaries, notifications, prompts] =
    await Promise.all([
      prisma.userIdentity.findFirst({
        where: {
          userId,
          provider: AuthProvider.DISCORD,
        },
        select: {
          providerUserId: true,
        },
      }),
      prisma.playIntent.findMany({
        where: {
          userId,
          creatorDiscordDmChannelId: {
            not: null,
          },
          creatorDiscordDmMessageId: {
            not: null,
          },
        },
        select: {
          id: true,
          createdAt: true,
          expiresAt: true,
          creatorDiscordDmChannelId: true,
          creatorDiscordDmMessageId: true,
        },
      }),
      prisma.notification.findMany({
        where: {
          userId,
          discordDmChannelId: {
            not: null,
          },
          discordDmMessageId: {
            not: null,
          },
        },
        select: {
          id: true,
          createdAt: true,
          deliveredAt: true,
          respondedAt: true,
          responseChoice: true,
          discordDmChannelId: true,
          discordDmMessageId: true,
          playIntent: {
            select: {
              expiresAt: true,
              userId: true,
            },
          },
        },
      }),
      prisma.discordAutoPlayPrompt.findMany({
        where: {
          userId,
          discordDmChannelId: {
            not: null,
          },
          discordDmMessageId: {
            not: null,
          },
        },
        select: {
          id: true,
          createdAt: true,
          deliveredAt: true,
          respondedAt: true,
          createdPlayIntentId: true,
          discordDmChannelId: true,
          discordDmMessageId: true,
        },
      }),
    ])

  const state: TrackedDirectMessageState = {
    discordUserId: discordIdentity?.providerUserId ?? null,
    channelIds: new Set<string>(),
    entries: new Map<string, TrackedDirectMessageEntry>(),
  }

  for (const summary of creatorSummaries) {
    upsertTrackedDirectMessageEntry(state, {
      channelId: summary.creatorDiscordDmChannelId,
      messageId: summary.creatorDiscordDmMessageId,
      sortAt: summary.createdAt,
      isActive: summary.expiresAt > now,
      creatorPlayIntentId: summary.id,
    })
  }

  for (const notification of notifications) {
    const isCreatorTrackedMessage = notification.playIntent?.userId === userId
    const isInterestedRecipientMessage =
      notification.responseChoice === NotificationResponseChoice.JOIN
    const preserveNotificationMessage = Boolean(
      notification.playIntent?.expiresAt &&
      notification.playIntent.expiresAt > now &&
      (isCreatorTrackedMessage || isInterestedRecipientMessage),
    )

    upsertTrackedDirectMessageEntry(state, {
      channelId: notification.discordDmChannelId,
      messageId: notification.discordDmMessageId,
      sortAt: notification.deliveredAt ?? notification.createdAt,
      isActive: preserveNotificationMessage,
      notificationId: notification.id,
    })
  }

  for (const prompt of prompts) {
    upsertTrackedDirectMessageEntry(state, {
      channelId: prompt.discordDmChannelId,
      messageId: prompt.discordDmMessageId,
      sortAt: prompt.deliveredAt ?? prompt.createdAt,
      isActive: prompt.respondedAt == null && !prompt.createdPlayIntentId,
      promptId: prompt.id,
    })
  }

  return state
}

async function pruneTrackedDirectMessagesForUser(
  state: TrackedDirectMessageState,
) {
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
    clearCreatorSummaryDmReferences([...creatorPlayIntentIdsToClear]),
  ])

  return {
    discordUserId: state.discordUserId,
    channelIds: state.channelIds,
    preservedMessageIds,
    deletedCount,
    attemptedCount,
  }
}

async function deleteUntrackedDirectMessagesForUser(options: {
  discordUserId: string | null
  preservedMessageIds: Set<string>
  channelIds: Set<string>
}) {
  const botUserId = await getDiscordBotUserId()

  if (!botUserId || !options.discordUserId) {
    return {
      deletedCount: 0,
      attemptedCount: 0,
    }
  }

  const directMessageChannel = await getOrCreateDiscordDirectMessageChannel(
    options.discordUserId,
  )

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
        limit: discordDmCleanupSweepPageLimit,
      })

      if (messages.length === 0) {
        break
      }

      for (const message of messages) {
        inspectedCount += 1

        if (
          message.authorId !== botUserId ||
          options.preservedMessageIds.has(message.id)
        ) {
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

      if (
        messages.length < discordDmCleanupSweepPageLimit ||
        inspectedCount >= discordDmCleanupSweepMessageCap
      ) {
        break
      }

      before = messages[messages.length - 1]?.id
    }
  }

  return {
    deletedCount,
    attemptedCount,
  }
}

export async function deletePlayIntentDirectMessages(playIntentId: string) {
  const [playIntent, notifications] = await Promise.all([
    prisma.playIntent.findUnique({
      where: {
        id: playIntentId,
      },
      select: {
        id: true,
        creatorDiscordDmChannelId: true,
        creatorDiscordDmMessageId: true,
      },
    }),
    prisma.notification.findMany({
      where: {
        playIntentId,
        discordDmChannelId: {
          not: null,
        },
        discordDmMessageId: {
          not: null,
        },
      },
      select: {
        id: true,
        discordDmChannelId: true,
        discordDmMessageId: true,
      },
    }),
  ])

  if (!playIntent) {
    return {
      deletedCount: 0,
      attemptedCount: 0,
    }
  }

  const trackedMessages = new Map<
    string,
    {
      channelId: string
      messageId: string
      notificationIds: string[]
      clearsCreatorSummary: boolean
    }
  >()

  if (
    playIntent.creatorDiscordDmChannelId &&
    playIntent.creatorDiscordDmMessageId
  ) {
    trackedMessages.set(
      `${playIntent.creatorDiscordDmChannelId}:${playIntent.creatorDiscordDmMessageId}`,
      {
        channelId: playIntent.creatorDiscordDmChannelId,
        messageId: playIntent.creatorDiscordDmMessageId,
        notificationIds: [],
        clearsCreatorSummary: true,
      },
    )
  }

  for (const notification of notifications) {
    if (!notification.discordDmChannelId || !notification.discordDmMessageId) {
      continue
    }

    const key = `${notification.discordDmChannelId}:${notification.discordDmMessageId}`
    const existingMessage = trackedMessages.get(key)

    if (existingMessage) {
      existingMessage.notificationIds.push(notification.id)
    } else {
      trackedMessages.set(key, {
        channelId: notification.discordDmChannelId,
        messageId: notification.discordDmMessageId,
        notificationIds: [notification.id],
        clearsCreatorSummary: false,
      })
    }
  }

  const deletedNotificationIds = new Set<string>()
  let clearCreatorSummary = false
  let deletedCount = 0

  await deleteReplyMessagesReferencingTargets({
    targets: [...trackedMessages.values()].map((trackedMessage) => ({
      channelId: trackedMessage.channelId,
      messageId: trackedMessage.messageId,
    })),
  })

  for (const trackedMessage of trackedMessages.values()) {
    if (
      !(await tryDeleteDirectMessage(
        trackedMessage.channelId,
        trackedMessage.messageId,
      ))
    ) {
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
    clearCreatorSummary
      ? clearCreatorSummaryDmReferences([playIntentId])
      : Promise.resolve(),
  ])

  return {
    deletedCount,
    attemptedCount: trackedMessages.size,
  }
}

export async function deleteCreatorPlayIntentDirectMessages(
  playIntentId: string,
  userId: string,
  options: {
    summaryMessage?: DirectMessageTarget
  } = {},
) {
  const [playIntent, notifications] = await Promise.all([
    prisma.playIntent.findFirst({
      where: {
        id: playIntentId,
        userId,
      },
      select: {
        id: true,
        creatorDiscordDmChannelId: true,
        creatorDiscordDmMessageId: true,
      },
    }),
    prisma.notification.findMany({
      where: {
        playIntentId,
        userId,
        discordDmChannelId: {
          not: null,
        },
        discordDmMessageId: {
          not: null,
        },
      },
      select: {
        id: true,
        discordDmChannelId: true,
        discordDmMessageId: true,
      },
    }),
  ])

  if (!playIntent) {
    return {
      deletedCount: 0,
      attemptedCount: 0,
    }
  }

  const trackedMessages = new Map<
    string,
    {
      channelId: string
      messageId: string
      notificationIds: string[]
      clearsCreatorSummary: boolean
    }
  >()

  const summaryMessage =
    options.summaryMessage ??
    (playIntent.creatorDiscordDmChannelId &&
    playIntent.creatorDiscordDmMessageId
      ? {
          channelId: playIntent.creatorDiscordDmChannelId,
          messageId: playIntent.creatorDiscordDmMessageId,
        }
      : null)

  if (summaryMessage) {
    trackedMessages.set(
      `${summaryMessage.channelId}:${summaryMessage.messageId}`,
      {
        channelId: summaryMessage.channelId,
        messageId: summaryMessage.messageId,
        notificationIds: [],
        clearsCreatorSummary: true,
      },
    )
  }

  for (const notification of notifications) {
    if (!notification.discordDmChannelId || !notification.discordDmMessageId) {
      continue
    }

    const key = `${notification.discordDmChannelId}:${notification.discordDmMessageId}`
    const existingMessage = trackedMessages.get(key)

    if (existingMessage) {
      existingMessage.notificationIds.push(notification.id)
    } else {
      trackedMessages.set(key, {
        channelId: notification.discordDmChannelId,
        messageId: notification.discordDmMessageId,
        notificationIds: [notification.id],
        clearsCreatorSummary: false,
      })
    }
  }

  const deletedNotificationIds = new Set<string>()
  let clearCreatorSummary = false
  let deletedCount = 0

  await deleteReplyMessagesReferencingTargets({
    targets: [...trackedMessages.values()].map((trackedMessage) => ({
      channelId: trackedMessage.channelId,
      messageId: trackedMessage.messageId,
    })),
  })

  for (const trackedMessage of trackedMessages.values()) {
    if (
      !(await tryDeleteDirectMessage(
        trackedMessage.channelId,
        trackedMessage.messageId,
      ))
    ) {
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
    clearCreatorSummary
      ? clearCreatorSummaryDmReferences([playIntentId])
      : Promise.resolve(),
  ])

  return {
    deletedCount,
    attemptedCount: trackedMessages.size,
  }
}

export async function deleteUserPlayIntentDirectMessages(
  playIntentId: string,
  userId: string,
  options: {
    anchorMessage?: DirectMessageTarget
    anchorNotificationId?: string
  } = {},
) {
  const notifications = await prisma.notification.findMany({
    where: {
      playIntentId,
      userId,
      discordDmChannelId: {
        not: null,
      },
      discordDmMessageId: {
        not: null,
      },
    },
    select: {
      id: true,
      discordDmChannelId: true,
      discordDmMessageId: true,
    },
  })

  const trackedMessages = new Map<
    string,
    {
      channelId: string
      messageId: string
      notificationIds: string[]
    }
  >()

  if (options.anchorMessage) {
    trackedMessages.set(
      `${options.anchorMessage.channelId}:${options.anchorMessage.messageId}`,
      {
        channelId: options.anchorMessage.channelId,
        messageId: options.anchorMessage.messageId,
        notificationIds: options.anchorNotificationId
          ? [options.anchorNotificationId]
          : [],
      },
    )
  }

  for (const notification of notifications) {
    if (!notification.discordDmChannelId || !notification.discordDmMessageId) {
      continue
    }

    const key = `${notification.discordDmChannelId}:${notification.discordDmMessageId}`
    const existingMessage = trackedMessages.get(key)

    if (existingMessage) {
      existingMessage.notificationIds.push(notification.id)
    } else {
      trackedMessages.set(key, {
        channelId: notification.discordDmChannelId,
        messageId: notification.discordDmMessageId,
        notificationIds: [notification.id],
      })
    }
  }

  const deletedNotificationIds = new Set<string>()
  let deletedCount = 0

  await deleteReplyMessagesReferencingTargets({
    targets: [...trackedMessages.values()].map((trackedMessage) => ({
      channelId: trackedMessage.channelId,
      messageId: trackedMessage.messageId,
    })),
  })

  for (const trackedMessage of trackedMessages.values()) {
    if (
      !(await tryDeleteDirectMessage(
        trackedMessage.channelId,
        trackedMessage.messageId,
      ))
    ) {
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
    attemptedCount: trackedMessages.size,
  }
}

export async function deleteSettledDiscordDirectMessagesForUser(
  userId: string,
) {
  const now = new Date()
  const [creatorPlayIntents, recipientNotifications, settledPrompts] =
    await Promise.all([
      prisma.playIntent.findMany({
        where: {
          userId,
          expiresAt: {
            lte: now,
          },
          OR: [
            {
              creatorDiscordDmChannelId: {
                not: null,
              },
              creatorDiscordDmMessageId: {
                not: null,
              },
            },
            {
              notifications: {
                some: {
                  discordDmChannelId: {
                    not: null,
                  },
                  discordDmMessageId: {
                    not: null,
                  },
                },
              },
            },
          ],
        },
        select: {
          id: true,
        },
      }),
      prisma.notification.findMany({
        where: {
          userId,
          playIntentId: {
            not: null,
          },
          discordDmChannelId: {
            not: null,
          },
          discordDmMessageId: {
            not: null,
          },
          playIntent: {
            expiresAt: {
              lte: now,
            },
          },
        },
        select: {
          playIntentId: true,
        },
      }),
      prisma.discordAutoPlayPrompt.findMany({
        where: {
          userId,
          respondedAt: {
            not: null,
          },
          discordDmChannelId: {
            not: null,
          },
          discordDmMessageId: {
            not: null,
          },
        },
        select: {
          id: true,
          discordDmChannelId: true,
          discordDmMessageId: true,
        },
      }),
    ])

  const creatorPlayIntentIds = [
    ...new Set(creatorPlayIntents.map((playIntent) => playIntent.id)),
  ]
  const creatorPlayIntentIdSet = new Set(creatorPlayIntentIds)
  const recipientPlayIntentIds = [
    ...new Set(
      recipientNotifications.flatMap((notification) => {
        const { playIntentId } = notification

        return playIntentId && !creatorPlayIntentIdSet.has(playIntentId)
          ? [playIntentId]
          : []
      }),
    ),
  ]

  const [creatorResults, recipientResults] = await Promise.all([
    Promise.all(
      creatorPlayIntentIds.map((playIntentId) =>
        deleteCreatorPlayIntentDirectMessages(playIntentId, userId),
      ),
    ),
    Promise.all(
      recipientPlayIntentIds.map((playIntentId) =>
        deleteUserPlayIntentDirectMessages(playIntentId, userId),
      ),
    ),
  ])

  let promptDeletedCount = 0
  let promptAttemptedCount = 0

  for (const prompt of settledPrompts) {
    if (!prompt.discordDmChannelId || !prompt.discordDmMessageId) {
      continue
    }

    promptAttemptedCount += 1

    if (
      !(await deletePromptDirectMessageThread({
        promptId: prompt.id,
        channelId: prompt.discordDmChannelId,
        messageId: prompt.discordDmMessageId,
      }))
    ) {
      continue
    }

    promptDeletedCount += 1
  }

  const trackedDirectMessageState =
    await collectTrackedDirectMessageStateForUser(userId, now)
  const pruneResult = await pruneTrackedDirectMessagesForUser(
    trackedDirectMessageState,
  )
  const sweepResult = await deleteUntrackedDirectMessagesForUser(pruneResult)

  return {
    deletedCount:
      creatorResults.reduce((total, result) => total + result.deletedCount, 0) +
      recipientResults.reduce(
        (total, result) => total + result.deletedCount,
        0,
      ) +
      promptDeletedCount +
      pruneResult.deletedCount +
      sweepResult.deletedCount,
    attemptedCount:
      creatorResults.reduce(
        (total, result) => total + result.attemptedCount,
        0,
      ) +
      recipientResults.reduce(
        (total, result) => total + result.attemptedCount,
        0,
      ) +
      promptAttemptedCount +
      pruneResult.attemptedCount +
      sweepResult.attemptedCount,
  }
}

/**
 * Archives a play intent's tracked DMs into the terminal "no longer active"
 * state and marks the chain ended (`PlayIntent.dmChainEndedAt`).
 *
 * Both sides are handled symmetrically: the creator summary and each recipient
 * invite collapse onto a single archived anchor per side, edited in place (a
 * quiet update, per the archival convention). The kept anchor keeps its stored
 * reference (`creatorDiscordDm*` / `Notification.discordDm*`) so the retention
 * sweep (`deleteExpiredPlayIntentDirectMessages`) can later find and delete the
 * whole chain; duplicate anchors are deleted and their references cleared here.
 *
 * Setting `dmChainEndedAt` makes this idempotent: the archive sweep only selects
 * intents whose marker is still null, so an already-archived chain is not
 * re-edited on later sweeps while its references remain intact for deletion.
 */
export async function archivePlayIntentDirectMessages(options: {
  playIntentIds: string[]
}) {
  const playIntentIds = options.playIntentIds.filter(Boolean)

  if (playIntentIds.length === 0) {
    return
  }

  const playIntents = await prisma.playIntent.findMany({
    where: {
      id: {
        in: playIntentIds,
      },
      expiresAt: {
        lte: new Date(),
      },
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
          status: true,
          serverId: true,
          textChannelId: true,
          textChannelName: true,
          voiceChannelId: true,
          voiceChannelName: true,
          inviteUrl: true,
        },
      },
      user: {
        select: {
          id: true,
          displayName: true,
          timezoneId: true,
          identities: {
            where: {
              provider: AuthProvider.DISCORD,
            },
            select: {
              providerUserId: true,
            },
          },
        },
      },
      games: {
        select: {
          game: {
            select: {
              title: true,
            },
          },
        },
      },
      notifications: {
        where: {
          type: {
            in: [
              ...archivedPlayIntentNotificationTypes,
              ...archivedCreatorSystemNotificationTypes,
            ],
          },
          discordDmChannelId: {
            not: null,
          },
          discordDmMessageId: {
            not: null,
          },
        },
        orderBy: [
          {
            deliveredAt: 'asc',
          },
          {
            createdAt: 'asc',
          },
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
                  provider: AuthProvider.DISCORD,
                },
                select: {
                  providerUserId: true,
                },
              },
            },
          },
        },
      },
    },
  })

  const notificationIdsToClear = new Set<string>()
  const playIntentIdsToClear = new Set<string>()
  const notificationReferenceUpdates = new Map<
    string,
    NotificationDmReferenceUpdate
  >()
  const interestedUsersByPlayIntentId = await getInterestedUsersByPlayIntentId(
    playIntents.map((playIntent) => playIntent.id),
  )

  for (const playIntent of playIntents) {
    const interestedLabels = (
      interestedUsersByPlayIntentId.get(playIntent.id) ?? []
    ).map((user) => {
      const discordUserId = user.identities?.[0]?.providerUserId
      return discordUserId ? `<@${discordUserId}>` : user.displayName
    })
    const creatorArchivePreview = buildArchivedCreatorPlayIntentPreview(
      playIntent.id,
      playIntent,
      playIntent.user.timezoneId,
      interestedLabels,
    )
    const creatorCandidates: ArchivedCreatorCandidate[] = []

    if (
      playIntent.creatorDiscordDmChannelId &&
      playIntent.creatorDiscordDmMessageId
    ) {
      creatorCandidates.push({
        channelId: playIntent.creatorDiscordDmChannelId,
        messageId: playIntent.creatorDiscordDmMessageId,
        notificationId: null,
        priority: -1,
      })
    }

    const notificationsByUserId = new Map<
      string,
      typeof playIntent.notifications
    >()

    for (const notification of playIntent.notifications) {
      const existingNotifications = notificationsByUserId.get(
        notification.userId,
      )

      if (
        notification.userId === playIntent.user.id &&
        notification.discordDmChannelId &&
        notification.discordDmMessageId
      ) {
        creatorCandidates.push({
          channelId: notification.discordDmChannelId,
          messageId: notification.discordDmMessageId,
          notificationId: notification.id,
          priority: getNotificationArchivePriority(notification.type),
        })
      }

      if (notification.type === NotificationType.SYSTEM) {
        continue
      }

      if (existingNotifications) {
        existingNotifications.push(notification)
      } else {
        notificationsByUserId.set(notification.userId, [notification])
      }
    }

    creatorCandidates.sort((left, right) => left.priority - right.priority)

    const keptCreatorMessageId =
      creatorCandidates.length > 0
        ? await tryArchiveDirectMessage(
            creatorCandidates,
            creatorArchivePreview.content,
            creatorArchivePreview.embeds,
            creatorArchivePreview.components,
          )
        : null

    if (keptCreatorMessageId) {
      const keptCreatorCandidate =
        creatorCandidates.find(
          (candidate) => candidate.messageId === keptCreatorMessageId,
        ) ?? null

      for (const candidate of creatorCandidates) {
        if (candidate.messageId === keptCreatorMessageId) {
          // Keep the archived anchor's stored reference intact so the retention
          // sweep can find and delete it later. Only the duplicate anchors
          // collapsed below have their references cleared.
          continue
        }

        if (
          !(await tryDeleteDirectMessage(
            candidate.channelId,
            candidate.messageId,
          ))
        ) {
          continue
        }

        if (candidate.notificationId) {
          notificationIdsToClear.add(candidate.notificationId)
        } else {
          playIntentIdsToClear.add(playIntent.id)
        }
      }

      await deleteReplyMessagesReferencingTargets({
        targets: creatorCandidates.map((candidate) => ({
          channelId: candidate.channelId,
          messageId: candidate.messageId,
        })),
        preservedTargets: keptCreatorCandidate
          ? [
              {
                channelId: keptCreatorCandidate.channelId,
                messageId: keptCreatorCandidate.messageId,
              },
            ]
          : [],
      })
    }

    for (const [userId, notifications] of notificationsByUserId.entries()) {
      if (userId === playIntent.user.id) {
        continue
      }

      const archiveEmbeds = buildArchivedPlayIntentEmbeds(
        buildArchivedPlayIntentSummary(
          playIntent,
          notifications[0]?.user.timezoneId ?? playIntent.user.timezoneId,
        ).body,
      )
      const candidates = notifications
        .flatMap<ArchivedNotificationCandidate>((notification) => {
          if (
            !notification.discordDmChannelId ||
            !notification.discordDmMessageId
          ) {
            return []
          }

          return [
            {
              channelId: notification.discordDmChannelId,
              messageId: notification.discordDmMessageId,
              notificationId: notification.id,
              priority: getNotificationArchivePriority(notification.type),
            },
          ]
        })
        .sort((left, right) => left.priority - right.priority)
      const candidateNotificationIds = new Map(
        candidates.map((candidate) => [
          candidate.messageId,
          candidate.notificationId,
        ]),
      )

      if (candidates.length === 0) {
        continue
      }

      const keptMessageId = await tryArchiveDirectMessage(
        candidates,
        buildDiscordMessageHeading('🛑 Call to Play Ended'),
        archiveEmbeds,
        (candidate) =>
          buildArchivedAudienceCleanupComponents(
            candidateNotificationIds.get(candidate.messageId) ?? '',
            {
              playIntentId: playIntent.id,
            },
          ),
      )

      if (!keptMessageId) {
        continue
      }

      const updates = buildArchivedNotificationReferenceUpdates({
        candidates,
        keptMessageId,
      })

      for (const [notificationId, update] of updates.entries()) {
        notificationReferenceUpdates.set(notificationId, update)
      }

      for (const candidate of candidates) {
        if (candidate.messageId === keptMessageId) {
          continue
        }

        if (
          await tryDeleteDirectMessage(candidate.channelId, candidate.messageId)
        ) {
          notificationIdsToClear.add(candidate.notificationId)
        }
      }

      await deleteReplyMessagesReferencingTargets({
        targets: candidates.map((candidate) => ({
          channelId: candidate.channelId,
          messageId: candidate.messageId,
        })),
        preservedTargets: candidates
          .filter((candidate) => candidate.messageId === keptMessageId)
          .map((candidate) => ({
            channelId: candidate.channelId,
            messageId: candidate.messageId,
          })),
      })
    }
  }

  await Promise.all([
    clearNotificationDmReferences(
      [...notificationIdsToClear].filter(
        (notificationId) => !notificationReferenceUpdates.has(notificationId),
      ),
    ),
    Promise.all(
      [...notificationReferenceUpdates.entries()].map(
        ([notificationId, update]) =>
          prisma.notification.update({
            where: {
              id: notificationId,
            },
            data: update,
          }),
      ),
    ),
    clearCreatorSummaryDmReferences([...playIntentIdsToClear]),
  ])

  // Mark every processed chain ended so the archive sweep does not re-edit it on
  // later passes. References stay intact for the retention delete; this marker
  // is the idempotency guard that replaces the old reference-clearing behavior.
  await prisma.playIntent.updateMany({
    where: {
      id: {
        in: playIntents.map((playIntent) => playIntent.id),
      },
      dmChainEndedAt: null,
    },
    data: {
      dmChainEndedAt: new Date(),
    },
  })
}

async function deleteExpiredPromptDirectMessages(cutoff: Date) {
  const prompts = await prisma.discordAutoPlayPrompt.findMany({
    where: {
      respondedAt: {
        not: null,
      },
      deliveredAt: {
        lte: cutoff,
      },
      discordDmChannelId: {
        not: null,
      },
      discordDmMessageId: {
        not: null,
      },
    },
    select: {
      id: true,
      discordDmChannelId: true,
      discordDmMessageId: true,
    },
  })

  for (const prompt of prompts) {
    if (!prompt.discordDmChannelId || !prompt.discordDmMessageId) {
      continue
    }

    if (
      !(await deletePromptDirectMessageThread({
        promptId: prompt.id,
        channelId: prompt.discordDmChannelId,
        messageId: prompt.discordDmMessageId,
      }))
    ) {
      continue
    }
  }
}

/**
 * Deletes the full tracked DM chain (creator summary, recipient invites, and
 * their bot-authored replies) for every play intent whose window ended at or
 * before `cutoff`. This is the destructive tail of the DM lifecycle: chains are
 * shown as ended at window close and then removed entirely once the retention
 * window has elapsed. Work is capped per sweep so a large backlog drains across
 * successive hourly sweeps rather than in one burst; cleared references drop
 * intents out of the query, so the set does not regrow.
 */
async function deleteExpiredPlayIntentDirectMessages(cutoff: Date) {
  const playIntents = await prisma.playIntent.findMany({
    where: {
      expiresAt: {
        lte: cutoff,
      },
      OR: [
        {
          creatorDiscordDmChannelId: {
            not: null,
          },
          creatorDiscordDmMessageId: {
            not: null,
          },
        },
        {
          notifications: {
            some: {
              discordDmChannelId: {
                not: null,
              },
              discordDmMessageId: {
                not: null,
              },
            },
          },
        },
      ],
    },
    orderBy: {
      expiresAt: 'asc',
    },
    take: discordDmDeleteSweepIntentCap,
    select: {
      id: true,
    },
  })

  for (const playIntent of playIntents) {
    await deletePlayIntentDirectMessages(playIntent.id)
  }
}

export async function sweepOldDiscordDirectMessages() {
  const cutoff = new Date(Date.now() - discordDmRetentionMs)

  await deleteExpiredPlayIntentDirectMessages(cutoff)
  await deleteExpiredPromptDirectMessages(cutoff)
}
