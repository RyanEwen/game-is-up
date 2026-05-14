/**
 * Discord auto-play prompts driven by presence observations.
 *
 * When the gateway-owning bot sees a linked user start a game we may DM them a
 * one-tap prompt to broadcast that as a call to play. This module owns prompt
 * creation, per-user cooldown enforcement, the prompt button-response flow
 * (which can synthesize a brand-new play intent at the chosen audience scope),
 * and the closed-state retention pattern (the original prompt DM stays as the
 * anchor; the closure reason is sent as a reply rather than replacing it).
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type ButtonInteraction,
  type MessageActionRowComponentBuilder,
  type MessageCreateOptions
} from 'discord.js'
import {
  AuthProvider,
  DiscordAutoPlayPromptStatus,
  GameIntentType,
  PlayIntentScope,
  Prisma
} from '@prisma/client'
import { buildAutoPlayInactiveObservationClosedReason } from '@game-is-up/shared'
import {
  deleteDiscordDirectMessage,
  editDiscordDirectMessage,
  fetchDiscordChannelMessages,
  getDiscordBotUserId,
  sendDiscordDirectMessages,
  supportsDiscordInteractiveMessages
} from './discord-bot-runtime.js'
import {
  appendOpenInAppButton,
  buildArchiveCleanupRow,
  buildDecoratedSectionHeading,
  buildDiscordMessageHeading,
  buildDiscordNotice,
  buildDiscordSection,
  buildOpenInAppButton,
  decorateFieldLabel
} from './discord-dm-formatting.js'
import { env } from './env.js'
import { hasInterestedPlayIntentBlockingAutoPrompt } from './play-intent-interested-users.js'
import { syncCreatorPlayIntentSummaryMessages } from './play-intent-notification-responses.js'
import { autoPlayPromptPrefix } from './play-intent-interaction-ids.js'
import { prisma } from './prisma.js'
import {
  getPlayIntentRecipientUserIds,
  minimumPlayIntentDurationMinutes,
  upsertCurrentPlayIntent
} from './play-intents.js'

const autoPlayPromptDurations = [60, 120, 240] as const
const autoPlayPromptCooldownMinutes = 10

type AutoPlayPromptAction =
  | { kind: 'duration'; promptId: string; durationMinutes: number }
  | { kind: 'confirm'; promptId: string; durationMinutes: number; notifyScope: 'friends-only' | 'network' }
  | { kind: 'decline'; promptId: string }
  | { kind: 'cleanup'; promptId: string }

type DirectMessagePreviewPayload = {
  content: string;
  embeds?: MessageCreateOptions['embeds'];
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[];
}

function buildPlayUrl(): string {
  try {
    return new URL('/play', env.CLIENT_ORIGIN).toString()
  } catch {
    return env.CLIENT_ORIGIN
  }
}

function formatDurationLabel(durationMinutes: number) {
  if (durationMinutes % 60 === 0) {
    const hours = durationMinutes / 60
    return `${hours} hour${hours === 1 ? '' : 's'}`
  }

  return `${durationMinutes} minutes`
}

function getAutoPlayPromptCooldownCutoff(referenceTime: Date) {
  return new Date(referenceTime.getTime() - (autoPlayPromptCooldownMinutes * 60 * 1000))
}

function buildLinkRow() {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    buildOpenInAppButton(buildPlayUrl(), 'Open App')
  )
}

function buildDeclinedPromptRows(promptId: string, options: { forceInteractive?: boolean } = {}) {
  if (!(options.forceInteractive ?? supportsDiscordInteractiveMessages())) {
    return [buildLinkRow()]
  }

  return buildArchiveCleanupRow({
    archiveCustomId: `${autoPlayPromptPrefix}:${promptId}:cleanup`,
    openInAppUrl: buildPlayUrl(),
    openInAppLabel: 'Open App'
  })
}

const autoPlayEmbedColors = {
  info: 0x3b82f6,
  success: 0x22c55e,
  warning: 0xf59e0b,
  danger: 0xef4444,
  neutral: 0x64748b
} as const

function buildPromptEmbedFields(fields: Array<{ name: string; value: string | null | undefined; inline?: boolean }>) {
  return fields.flatMap((field) => {
    const trimmedValue = field.value?.trim()

    if (!trimmedValue) {
      return []
    }

    return [{
      name: field.name,
      value: trimmedValue.slice(0, 1024),
      inline: false
    }]
  })
}

function formatPromptEmbedFieldName(label: string) {
  return decorateFieldLabel(label)
}

function buildPromptSectionHeading(label: string) {
  return buildDecoratedSectionHeading(label)
}

function buildPromptSection(label: string, value: string) {
  return buildDiscordSection(label, value, buildPromptSectionHeading)
}

function buildPromptNotice(title: string, sections: Array<string | null>, subtext?: string | null) {
  return buildDiscordNotice(title, sections, subtext)
}

function buildInitialPromptHeading() {
  return buildDiscordMessageHeading('🎮 Do you want to send out a call to play?')
}

function buildDurationRows(promptId: string) {
  return appendOpenInAppButton([
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      ...autoPlayPromptDurations.map((durationMinutes) => new ButtonBuilder()
        .setCustomId(`${autoPlayPromptPrefix}:${promptId}:duration:${durationMinutes}`)
        .setLabel(durationMinutes >= 60 ? `${durationMinutes / 60}h` : `${durationMinutes}m`)
        .setStyle(ButtonStyle.Primary)),
      new ButtonBuilder()
        .setCustomId(`${autoPlayPromptPrefix}:${promptId}:decline`)
        .setLabel('Not now')
        .setStyle(ButtonStyle.Secondary)
    )
  ], buildPlayUrl(), 'Open App')
}

function buildAudienceRows(promptId: string, durationMinutes: number, friendRecipientCount: number, networkRecipientCount: number) {
  return appendOpenInAppButton([
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${autoPlayPromptPrefix}:${promptId}:confirm:friends-only:${durationMinutes}`)
        .setLabel(`Friends only (${friendRecipientCount})`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(friendRecipientCount === 0),
      new ButtonBuilder()
        .setCustomId(`${autoPlayPromptPrefix}:${promptId}:confirm:network:${durationMinutes}`)
        .setLabel(`Your network + friends (${networkRecipientCount})`)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${autoPlayPromptPrefix}:${promptId}:decline`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    )
  ], buildPlayUrl(), 'Open App')
}

function buildInitialPromptEmbeds(gameTitle: string, networkRecipientCount: number) {
  return [
    new EmbedBuilder()
      .setColor(autoPlayEmbedColors.info)
      .addFields(buildPromptEmbedFields([
        { name: formatPromptEmbedFieldName('Game'), value: gameTitle, inline: false },
        {
          name: formatPromptEmbedFieldName('Reach'),
          value: `${networkRecipientCount} people in your network and friends could receive a call to play for it right now.`,
          inline: false
        },
        {
          name: formatPromptEmbedFieldName('Next Step'),
          value: 'Pick a duration and I will ask who should receive it.',
          inline: false
        }
      ]))
      .setFooter({ text: 'Open the app if you want the full composer instead.' })
  ]
}

function buildAudienceEmbeds(gameTitle: string, durationMinutes: number, friendRecipientCount: number, networkRecipientCount: number) {
  return [
    new EmbedBuilder()
      .setColor(autoPlayEmbedColors.info)
      .addFields(buildPromptEmbedFields([
        { name: formatPromptEmbedFieldName('Game'), value: gameTitle, inline: false },
        { name: formatPromptEmbedFieldName('Duration'), value: `Next ${formatDurationLabel(durationMinutes)}.`, inline: true },
        {
          name: formatPromptEmbedFieldName('Reach'),
          value: `Friends only: ${friendRecipientCount}\nYour network + friends: ${networkRecipientCount}`,
          inline: false
        }
      ]))
      .setFooter({ text: 'Choose who should receive this call to play.' })
  ]
}

function buildDeclinedMessage(gameTitle: string) {
  return buildDiscordMessageHeading(`🛑 ${gameTitle} Prompt Closed`)
}

function buildDeclinedEmbeds(gameTitle: string) {
  return [
    new EmbedBuilder()
      .setColor(autoPlayEmbedColors.danger)
      .addFields(buildPromptEmbedFields([
        { name: formatPromptEmbedFieldName('Game'), value: gameTitle, inline: false },
        { name: formatPromptEmbedFieldName('Status'), value: `You chose not to create a call to play for ${gameTitle} right now.`, inline: false }
      ]))
      .setFooter({ text: 'Open the app if you want to create or edit a call to play later.' })
  ]
}

function buildActiveAutoPlayPromptPreview(options: {
  promptId: string;
  gameTitle: string;
  durationMinutes: number | null;
  friendRecipientCount: number;
  networkRecipientCount: number;
}): DirectMessagePreviewPayload {
  if (options.durationMinutes != null) {
    return {
      content: buildDiscordMessageHeading('👥 Choose an Audience'),
      embeds: buildAudienceEmbeds(
        options.gameTitle,
        options.durationMinutes,
        options.friendRecipientCount,
        options.networkRecipientCount
      ),
      components: buildAudienceRows(
        options.promptId,
        options.durationMinutes,
        options.friendRecipientCount,
        options.networkRecipientCount
      )
    }
  }

  return {
    content: buildInitialPromptHeading(),
    embeds: buildInitialPromptEmbeds(options.gameTitle, options.networkRecipientCount),
    components: buildDurationRows(options.promptId)
  }
}

function buildLockedAutoPlayPromptPreview(options: {
  promptId: string;
  gameTitle: string;
  durationMinutes: number | null;
  friendRecipientCount: number;
  networkRecipientCount: number;
  includeCleanup?: boolean;
  forceInteractive?: boolean;
}): DirectMessagePreviewPayload {
  const preview = buildActiveAutoPlayPromptPreview(options)

  return {
    ...preview,
    components: options.includeCleanup
      ? buildDeclinedPromptRows(options.promptId, {
          forceInteractive: options.forceInteractive
        })
      : []
  }
}

function buildClosedPromptAnchorPreview(options: {
  promptId: string;
  gameTitle: string;
  durationMinutes: number | null;
  friendRecipientCount: number;
  networkRecipientCount: number;
  forceInteractive?: boolean;
}) {
  return buildLockedAutoPlayPromptPreview({
    promptId: options.promptId,
    gameTitle: options.gameTitle,
    durationMinutes: options.durationMinutes,
    friendRecipientCount: options.friendRecipientCount,
    networkRecipientCount: options.networkRecipientCount,
    includeCleanup: true,
    forceInteractive: options.forceInteractive
  })
}

function buildInactiveObservationClosedReason(gameTitle: string) {
  return buildAutoPlayInactiveObservationClosedReason(gameTitle)
}

export function buildClosedAutoPlayPromptReplyMessage(reason: string) {
  return buildPromptNotice(
    '🛑 Prompt Closed',
    [buildPromptSection('Status', reason)],
    'Open the app if you still want to create or edit a call to play.'
  )
}

export function buildInactiveObservationClosedReplyMessage(gameTitle: string) {
  return buildClosedAutoPlayPromptReplyMessage(buildInactiveObservationClosedReason(gameTitle))
}

async function sendClosedAutoPlayPromptReply(options: {
  discordUserId: string;
  channelId: string;
  messageId: string;
  reason: string;
}) {
  await sendDiscordDirectMessages([{
    discordUserId: options.discordUserId,
    content: buildClosedAutoPlayPromptReplyMessage(options.reason),
    components: [],
    replyTo: {
      channelId: options.channelId,
      messageId: options.messageId
    }
  }])
}

async function deleteClosedAutoPlayPromptThread(options: {
  channelId: string;
  anchorMessageId: string;
}) {
  const botUserId = await getDiscordBotUserId()

  if (botUserId) {
    const messages = await fetchDiscordChannelMessages({
      channelId: options.channelId,
      limit: 100
    })

    for (const message of messages) {
      if (message.authorId !== botUserId || message.referencedMessageId !== options.anchorMessageId) {
        continue
      }

      await deleteDiscordDirectMessage({
        channelId: options.channelId,
        messageId: message.id
      })
    }
  }

  await deleteDiscordDirectMessage({
    channelId: options.channelId,
    messageId: options.anchorMessageId
  })
}

function isMissingDiscordMessageError(error: string | null | undefined) {
  return /Unknown Message/i.test(error ?? '')
}

function parseDeliveredPromptCount(statusDetail: string | null) {
  const match = /^(\d+) Discord DM/i.exec(statusDetail ?? '')

  return match ? Number(match[1]) : 0
}

export async function expireDiscordAutoPlayPromptsForInactiveObservations(observationIds: string[]) {
  if (observationIds.length === 0) {
    return
  }

  const prompts = await prisma.discordAutoPlayPrompt.findMany({
    where: {
      observationId: {
        in: observationIds
      },
      status: {
        in: [DiscordAutoPlayPromptStatus.SENT]
      },
      respondedAt: null
    },
    select: {
      id: true,
      durationMinutes: true,
      friendRecipientCount: true,
      networkRecipientCount: true,
      game: {
        select: {
          title: true
        }
      },
      user: {
        select: {
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
      discordDmChannelId: true,
      discordDmMessageId: true
    }
  })

  await Promise.all(prompts.map(async (prompt) => {
    const result = await prisma.discordAutoPlayPrompt.updateMany({
      where: {
        id: prompt.id,
        status: DiscordAutoPlayPromptStatus.SENT,
        respondedAt: null
      },
      data: {
        status: DiscordAutoPlayPromptStatus.EXPIRED,
        respondedAt: new Date(),
        statusDetail: `Closed because we are no longer seeing the user in ${prompt.game.title}.`
      }
    })

    if (result.count === 0 || !prompt.discordDmChannelId || !prompt.discordDmMessageId) {
      return
    }

    const lockedPreview = buildLockedAutoPlayPromptPreview({
      promptId: prompt.id,
      gameTitle: prompt.game.title,
      durationMinutes: prompt.durationMinutes,
      friendRecipientCount: prompt.friendRecipientCount,
      networkRecipientCount: prompt.networkRecipientCount,
      includeCleanup: true
    })

    await editDiscordDirectMessage({
      channelId: prompt.discordDmChannelId,
      messageId: prompt.discordDmMessageId,
      content: lockedPreview.content,
      embeds: lockedPreview.embeds,
      components: lockedPreview.components
    })

    const discordUserId = prompt.user.identities[0]?.providerUserId

    if (!discordUserId) {
      return
    }

    await sendDiscordDirectMessages([{
      discordUserId,
      content: buildInactiveObservationClosedReplyMessage(prompt.game.title),
      components: [],
      replyTo: {
        channelId: prompt.discordDmChannelId,
        messageId: prompt.discordDmMessageId
      }
    }])
  }))
}

function buildAcceptedEmbeds(gameTitle: string, durationMinutes: number, notifyScope: 'friends-only' | 'network', deliveredCount: number) {
  return [
    new EmbedBuilder()
      .setColor(autoPlayEmbedColors.success)
      .addFields(buildPromptEmbedFields([
        { name: formatPromptEmbedFieldName('Game'), value: gameTitle, inline: false },
        { name: formatPromptEmbedFieldName('Duration'), value: `Next ${formatDurationLabel(durationMinutes)}.`, inline: true },
        {
          name: formatPromptEmbedFieldName('Audience'),
          value: notifyScope === 'friends-only' ? 'Friends only.' : 'Your network plus friends.',
          inline: true
        },
        {
          name: formatPromptEmbedFieldName('Reach'),
          value: deliveredCount > 0
            ? `${deliveredCount} Discord DM${deliveredCount === 1 ? ' was' : 's were'} delivered right away.`
            : "No Discord DMs were delivered right away, but the call is active in Game's Up.",
          inline: false
        }
      ]))
      .setFooter({ text: 'Open the app if you want to edit the call to play.' })
  ]
}

export function buildDiscordAutoPlayPromptPreview(options: {
  promptId: string;
  status: DiscordAutoPlayPromptStatus;
  gameTitle: string;
  durationMinutes: number | null;
  notifyScope: PlayIntentScope | null;
  friendRecipientCount: number;
  networkRecipientCount: number;
  statusDetail: string | null;
  deliveredCount: number;
  forceInteractive?: boolean;
}): DirectMessagePreviewPayload | null {
  switch (options.status) {
    case DiscordAutoPlayPromptStatus.SKIPPED:
      return null
    case DiscordAutoPlayPromptStatus.FAILED:
      return buildLockedAutoPlayPromptPreview({
        promptId: options.promptId,
        gameTitle: options.gameTitle,
        durationMinutes: options.durationMinutes,
        friendRecipientCount: options.friendRecipientCount,
        networkRecipientCount: options.networkRecipientCount,
        includeCleanup: true,
        forceInteractive: options.forceInteractive
      })
    case DiscordAutoPlayPromptStatus.DECLINED:
      return {
        content: buildDeclinedMessage(options.gameTitle),
        embeds: buildDeclinedEmbeds(options.gameTitle),
        components: buildDeclinedPromptRows(options.promptId, {
          forceInteractive: options.forceInteractive
        })
      }
    case DiscordAutoPlayPromptStatus.EXPIRED:
      return buildLockedAutoPlayPromptPreview({
        promptId: options.promptId,
        gameTitle: options.gameTitle,
        durationMinutes: options.durationMinutes,
        friendRecipientCount: options.friendRecipientCount,
        networkRecipientCount: options.networkRecipientCount,
        includeCleanup: true,
        forceInteractive: options.forceInteractive
      })
    case DiscordAutoPlayPromptStatus.ACCEPTED:
      return {
        content: buildDiscordMessageHeading('✅ Call to Play Is Live'),
        embeds: buildAcceptedEmbeds(
          options.gameTitle,
          options.durationMinutes ?? autoPlayPromptDurations[0],
          options.notifyScope === PlayIntentScope.FRIENDS_ONLY ? 'friends-only' : 'network',
          options.deliveredCount
        ),
        components: [buildLinkRow()]
      }
    default:
      return buildActiveAutoPlayPromptPreview({
        promptId: options.promptId,
        gameTitle: options.gameTitle,
        durationMinutes: options.durationMinutes,
        friendRecipientCount: options.friendRecipientCount,
        networkRecipientCount: options.networkRecipientCount
      })
  }
}

export async function refreshTrackedDiscordAutoPlayPromptDirectMessages() {
  const prompts = await prisma.discordAutoPlayPrompt.findMany({
    where: {
      discordDmChannelId: {
        not: null
      },
      discordDmMessageId: {
        not: null
      }
    },
    select: {
      id: true,
      status: true,
      statusDetail: true,
      durationMinutes: true,
      notifyScope: true,
      friendRecipientCount: true,
      networkRecipientCount: true,
      discordDmChannelId: true,
      discordDmMessageId: true,
      createdPlayIntentId: true,
      game: {
        select: {
          title: true
        }
      }
    }
  })

  for (const prompt of prompts) {
    if (prompt.createdPlayIntentId || !prompt.discordDmChannelId || !prompt.discordDmMessageId) {
      continue
    }

    const preview = buildDiscordAutoPlayPromptPreview({
      promptId: prompt.id,
      status: prompt.status,
      gameTitle: prompt.game.title,
      durationMinutes: prompt.durationMinutes,
      notifyScope: prompt.notifyScope,
      friendRecipientCount: prompt.friendRecipientCount,
      networkRecipientCount: prompt.networkRecipientCount,
      statusDetail: prompt.statusDetail,
      deliveredCount: parseDeliveredPromptCount(prompt.statusDetail)
    })

    if (!preview) {
      continue
    }

    const result = await editDiscordDirectMessage({
      channelId: prompt.discordDmChannelId,
      messageId: prompt.discordDmMessageId,
      content: preview.content,
      embeds: preview.embeds,
      components: preview.components
    })

    if (result.status === 'failed' && isMissingDiscordMessageError(result.error)) {
      await prisma.discordAutoPlayPrompt.update({
        where: {
          id: prompt.id
        },
        data: {
          discordDmChannelId: null,
          discordDmMessageId: null
        }
      })
    }
  }
}

function parseAction(customId: string): AutoPlayPromptAction | null {
  const parts = customId.split(':')
  const promptId = parts[1]

  if (!promptId) {
    return null
  }

  if (parts[0] !== autoPlayPromptPrefix) {
    return null
  }

  if (parts.length === 4 && parts[2] === 'duration') {
    const durationMinutes = Number(parts[3])

    return Number.isInteger(durationMinutes)
      ? { kind: 'duration', promptId, durationMinutes }
      : null
  }

  if (parts.length === 3 && parts[2] === 'decline') {
    return {
      kind: 'decline',
      promptId
    }
  }

  if (parts.length === 3 && parts[2] === 'cleanup') {
    return {
      kind: 'cleanup',
      promptId
    }
  }

  if (parts.length === 5 && parts[2] === 'confirm') {
    const durationMinutes = Number(parts[4])

    if (!Number.isInteger(durationMinutes) || (parts[3] !== 'friends-only' && parts[3] !== 'network' && parts[3] !== 'discovery-and-friends')) {
      return null
    }

    return {
      kind: 'confirm',
      promptId,
      notifyScope: parts[3] === 'discovery-and-friends' ? 'network' : parts[3],
      durationMinutes
    }
  }

  return null
}

async function createSkippedPrompt(options: {
  observationId: string;
  userId: string;
  gameId: string;
  sourceServerId: string | null;
  detail: string;
  friendRecipientCount?: number;
  networkRecipientCount?: number;
}) {
  await prisma.discordAutoPlayPrompt.create({
    data: {
      observationId: options.observationId,
      userId: options.userId,
      gameId: options.gameId,
      sourceServerId: options.sourceServerId,
      status: DiscordAutoPlayPromptStatus.SKIPPED,
      statusDetail: options.detail,
      friendRecipientCount: options.friendRecipientCount ?? 0,
      networkRecipientCount: options.networkRecipientCount ?? 0
    }
  })
}

async function createSkippedPromptInTransaction(
  transaction: Prisma.TransactionClient,
  options: {
    observationId: string;
    userId: string;
    gameId: string;
    sourceServerId: string | null;
    detail: string;
    friendRecipientCount?: number;
    networkRecipientCount?: number;
  }
) {
  await transaction.discordAutoPlayPrompt.create({
    data: {
      observationId: options.observationId,
      userId: options.userId,
      gameId: options.gameId,
      sourceServerId: options.sourceServerId,
      status: DiscordAutoPlayPromptStatus.SKIPPED,
      statusDetail: options.detail,
      friendRecipientCount: options.friendRecipientCount ?? 0,
      networkRecipientCount: options.networkRecipientCount ?? 0
    }
  })
}

async function lockAutoPlayPromptWindow(transaction: Prisma.TransactionClient, userId: string, gameId: string) {
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`discord-auto-play:${userId}:${gameId}`}))`
}

export async function maybeSendDiscordAutoPlayPromptForObservation(observationId: string) {
  const existingPrompt = await prisma.discordAutoPlayPrompt.findUnique({
    where: {
      observationId
    },
    select: {
      id: true
    }
  })

  if (existingPrompt) {
    return
  }

  const observation = await prisma.discordActivityObservation.findUnique({
    where: {
      id: observationId
    },
    select: {
      userId: true,
      gameId: true,
      sourceServerId: true,
      game: {
        select: {
          id: true,
          title: true
        }
      },
      user: {
        select: {
          id: true,
          discordAutoPromptPlayIntent: true
        }
      }
    }
  })

  if (!observation?.gameId || !observation.game) {
    return
  }

  if (!supportsDiscordInteractiveMessages()) {
    await createSkippedPrompt({
      observationId,
      userId: observation.userId,
      gameId: observation.gameId,
      sourceServerId: observation.sourceServerId,
      detail: 'Skipped because Discord auto-play prompts require the gateway-owning bot environment.'
    })
    return
  }

  const gameId = observation.gameId
  const gameTitle = observation.game.title

  if (!observation.user.discordAutoPromptPlayIntent) {
    await createSkippedPrompt({
      observationId,
      userId: observation.userId,
      gameId,
      sourceServerId: observation.sourceServerId,
      detail: 'Skipped because this user turned off automatic Discord prompts.'
    })
    return
  }

  const now = new Date()
  const minimumPromptEndsAt = new Date(now.getTime() + minimumPlayIntentDurationMinutes * 60 * 1000)
  const [activeIntent, interestedInBlockingIntent, libraryEntry, discordIdentity] = await Promise.all([
    prisma.playIntent.findFirst({
      where: {
        userId: observation.userId,
        windowStartsAt: {
          lt: minimumPromptEndsAt
        },
        windowEndsAt: {
          gt: now
        }
      },
      select: {
        id: true,
        selectionMode: true,
        games: {
          select: { gameId: true }
        }
      }
    }),
    hasInterestedPlayIntentBlockingAutoPrompt(observation.userId, now),
    prisma.userGameInterest.findFirst({
      where: {
        userId: observation.userId,
        gameId: observation.gameId,
        intentType: {
          not: GameIntentType.COMPLETED
        }
      },
      select: {
        id: true,
        platforms: {
          select: {
            platformLabel: true
          }
        }
      }
    }),
    prisma.userIdentity.findFirst({
      where: {
        userId: observation.userId,
        provider: AuthProvider.DISCORD
      },
      select: {
        providerUserId: true
      }
    })
  ])

  if (activeIntent) {
    await createSkippedPrompt({
      observationId,
      userId: observation.userId,
      gameId,
      sourceServerId: observation.sourceServerId,
      detail: activeIntent.selectionMode === 'SELECTED_GAMES' && activeIntent.games.some((entry) => entry.gameId === gameId)
        ? 'Skipped because you already have an overlapping call to play covering this game.'
        : 'Skipped because the user already has an overlapping call to play.'
    })
    return
  }

  if (interestedInBlockingIntent) {
    await createSkippedPrompt({
      observationId,
      userId: observation.userId,
      gameId,
      sourceServerId: observation.sourceServerId,
      detail: 'Skipped because the user is already marked interested in a call to play that is active now or starts within the next 10 minutes.'
    })
    return
  }

  if (!libraryEntry || libraryEntry.platforms.length === 0) {
    await createSkippedPrompt({
      observationId,
      userId: observation.userId,
      gameId,
      sourceServerId: observation.sourceServerId,
      detail: 'Skipped because the observed game is not in the user library with playable platforms.'
    })
    return
  }

  if (!discordIdentity?.providerUserId) {
    await createSkippedPrompt({
      observationId,
      userId: observation.userId,
      gameId,
      sourceServerId: observation.sourceServerId,
      detail: 'Skipped because the user does not have a linked Discord identity.'
    })
    return
  }

  const [friendRecipients, networkRecipients] = await Promise.all([
    getPlayIntentRecipientUserIds(observation.userId, 'friends-only', [gameId]),
    getPlayIntentRecipientUserIds(observation.userId, 'network', [gameId])
  ])

  const prompt = await prisma.$transaction(async (transaction) => {
    await lockAutoPlayPromptWindow(transaction, observation.userId, gameId)

    const cooldownCutoff = getAutoPlayPromptCooldownCutoff(new Date())
    const recentPrompt = await transaction.discordAutoPlayPrompt.findFirst({
      where: {
        userId: observation.userId,
        gameId,
        createdAt: {
          gte: cooldownCutoff
        },
        OR: [
          {
            deliveredAt: {
              not: null
            }
          },
          {
            status: DiscordAutoPlayPromptStatus.SENT
          }
        ]
      },
      orderBy: {
        createdAt: 'desc'
      },
      select: {
        createdAt: true
      }
    })

    if (recentPrompt) {
      await createSkippedPromptInTransaction(transaction, {
        observationId,
        userId: observation.userId,
        gameId,
        sourceServerId: observation.sourceServerId,
        detail: `Skipped because ${gameTitle} was already prompted within the last ${formatDurationLabel(autoPlayPromptCooldownMinutes)}.`
      })
      return null
    }

    if (networkRecipients.length === 0) {
      await createSkippedPromptInTransaction(transaction, {
        observationId,
        userId: observation.userId,
        gameId,
        sourceServerId: observation.sourceServerId,
        detail: 'Skipped because nobody in your network or friends currently overlaps on this game.',
        friendRecipientCount: friendRecipients.length,
        networkRecipientCount: networkRecipients.length
      })
      return null
    }

    return transaction.discordAutoPlayPrompt.create({
      data: {
        observationId,
        userId: observation.userId,
        gameId,
        sourceServerId: observation.sourceServerId,
        status: DiscordAutoPlayPromptStatus.SENT,
        statusDetail: `Prompt DM queued for ${gameTitle}.`,
        friendRecipientCount: friendRecipients.length,
        networkRecipientCount: networkRecipients.length
      },
      select: {
        id: true
      }
    })
  })

  if (!prompt) {
    return
  }

  const dmResult = (await sendDiscordDirectMessages([
    {
      discordUserId: discordIdentity.providerUserId,
      content: buildInitialPromptHeading(),
      embeds: buildInitialPromptEmbeds(observation.game.title, networkRecipients.length),
      components: buildDurationRows(prompt.id)
    }
  ]))[0]

  if (!dmResult || dmResult.status === 'failed') {
    await prisma.discordAutoPlayPrompt.update({
      where: {
        id: prompt.id
      },
      data: {
        status: DiscordAutoPlayPromptStatus.FAILED,
        statusDetail: 'Prompt DM could not be delivered.',
        dmError: dmResult?.error ?? 'Unknown Discord DM delivery failure.'
      }
    })
    return
  }

  if (dmResult.emulated) {
    await prisma.discordAutoPlayPrompt.update({
      where: {
        id: prompt.id
      },
      data: {
        statusDetail: `Prompt DM emulated in development for ${observation.game.title}.`,
        discordDmChannelId: null,
        discordDmMessageId: null
      }
    })
    return
  }

  await prisma.discordAutoPlayPrompt.update({
    where: {
      id: prompt.id
    },
    data: {
      deliveredAt: new Date(),
      statusDetail: `Prompt DM sent for ${observation.game.title}.`,
      discordDmChannelId: dmResult.channelId,
      discordDmMessageId: dmResult.messageId
    }
  })
}

export async function handleDiscordAutoPlayPromptInteraction(interaction: ButtonInteraction) {
  const action = parseAction(interaction.customId)

  if (!action) {
    return
  }

  const prompt = await prisma.discordAutoPlayPrompt.findUnique({
    where: {
      id: action.promptId
    },
    include: {
      user: {
        select: {
          id: true,
          discordAutoPromptPlayIntent: true
        }
      },
      game: {
        select: {
          id: true,
          title: true
        }
      },
      observation: {
        select: {
          isActive: true
        }
      }
    }
  })

  if (!prompt) {
    await interaction.update({
      content: buildPromptNotice(
        '⌛ Prompt Closed',
        [buildPromptSection('Status', 'The saved prompt record could not be found.')],
        'Open the app if you still want to create or edit a call to play.'
      ),
      components: []
    })
    return
  }

  const expectedStatus = DiscordAutoPlayPromptStatus.SENT

  if (prompt.status !== expectedStatus) {
    if (action.kind === 'cleanup') {
      await interaction.deferUpdate()

      await deleteClosedAutoPlayPromptThread({
        channelId: interaction.channelId,
        anchorMessageId: interaction.message.id
      })

      await prisma.discordAutoPlayPrompt.update({
        where: {
          id: prompt.id
        },
        data: {
          discordDmChannelId: null,
          discordDmMessageId: null
        }
      })

      return
    }

    const preview = buildDiscordAutoPlayPromptPreview({
      promptId: prompt.id,
      status: prompt.status,
      gameTitle: prompt.game.title,
      durationMinutes: prompt.durationMinutes,
      notifyScope: prompt.notifyScope,
      friendRecipientCount: prompt.friendRecipientCount,
      networkRecipientCount: prompt.networkRecipientCount,
      statusDetail: prompt.statusDetail,
      deliveredCount: parseDeliveredPromptCount(prompt.statusDetail)
    })

    await interaction.update({
      content: preview?.content ?? buildPromptNotice(
        '⌛ Prompt Closed',
        [buildPromptSection('Status', prompt.statusDetail ?? 'It was already handled earlier.')],
        'Open the app if you still want to create or edit a call to play.'
      ),
      embeds: preview?.embeds,
      components: preview?.components ?? []
    })
    return
  }

  if (action.kind === 'cleanup') {
    await interaction.update({
      content: buildPromptNotice(
        '⌛ Prompt Closed',
        [buildPromptSection('Status', 'This prompt is still active and cannot be archived yet.')],
        'Use the current prompt buttons or open the app if you want to change course.'
      ),
      components: [buildLinkRow()]
    })
    return
  }

  if (!prompt.user.discordAutoPromptPlayIntent) {
    const closedReason = 'Automatic Discord prompts are turned off in your profile now.'

    await prisma.discordAutoPlayPrompt.update({
      where: {
        id: prompt.id
      },
      data: {
        status: DiscordAutoPlayPromptStatus.EXPIRED,
        respondedAt: new Date(),
        statusDetail: 'The user turned off automatic Discord prompts before responding.'
      }
    })

    const lockedPreview = buildLockedAutoPlayPromptPreview({
      promptId: prompt.id,
      gameTitle: prompt.game.title,
      durationMinutes: prompt.durationMinutes,
      friendRecipientCount: prompt.friendRecipientCount,
      networkRecipientCount: prompt.networkRecipientCount,
      includeCleanup: true
    })

    await interaction.update({
      content: lockedPreview.content,
      embeds: lockedPreview.embeds,
      components: lockedPreview.components
    })

    await sendClosedAutoPlayPromptReply({
      discordUserId: interaction.user.id,
      channelId: interaction.channelId,
      messageId: interaction.message.id,
      reason: closedReason
    })

    return
  }

  if (!prompt.observation.isActive) {
    await prisma.discordAutoPlayPrompt.update({
      where: {
        id: prompt.id
      },
      data: {
        status: DiscordAutoPlayPromptStatus.EXPIRED,
        respondedAt: new Date(),
        statusDetail: `Closed because we are no longer seeing the user in ${prompt.game.title}.`
      }
    })

    const lockedPreview = buildLockedAutoPlayPromptPreview({
      promptId: prompt.id,
      gameTitle: prompt.game.title,
      durationMinutes: prompt.durationMinutes,
      friendRecipientCount: prompt.friendRecipientCount,
      networkRecipientCount: prompt.networkRecipientCount,
      includeCleanup: true
    })

    await interaction.update({
      content: lockedPreview.content,
      embeds: lockedPreview.embeds,
      components: lockedPreview.components
    })

    await sendClosedAutoPlayPromptReply({
      discordUserId: interaction.user.id,
      channelId: interaction.channelId,
      messageId: interaction.message.id,
      reason: buildInactiveObservationClosedReason(prompt.game.title)
    })

    return
  }

  if (action.kind === 'decline') {
    await prisma.discordAutoPlayPrompt.update({
      where: {
        id: prompt.id
      },
      data: {
        status: DiscordAutoPlayPromptStatus.DECLINED,
        respondedAt: new Date(),
        statusDetail: 'The user declined the prompt from Discord.'
      }
    })
    await interaction.update({
      content: buildDeclinedMessage(prompt.game.title),
      embeds: buildDeclinedEmbeds(prompt.game.title),
      components: buildDeclinedPromptRows(prompt.id)
    })
    return
  }

  if (action.kind === 'duration') {
    await interaction.update({
      content: buildDiscordMessageHeading('👥 Choose an Audience'),
      embeds: buildAudienceEmbeds(prompt.game.title, action.durationMinutes, prompt.friendRecipientCount, prompt.networkRecipientCount),
      components: buildAudienceRows(prompt.id, action.durationMinutes, prompt.friendRecipientCount, prompt.networkRecipientCount)
    })
    return
  }

  const selectedRecipientCount = action.notifyScope === 'friends-only'
    ? prompt.friendRecipientCount
    : prompt.networkRecipientCount

  if (selectedRecipientCount === 0) {
    const closedReason = 'That audience no longer has anyone who overlaps on this game.'

    await prisma.discordAutoPlayPrompt.update({
      where: {
        id: prompt.id
      },
      data: {
        status: DiscordAutoPlayPromptStatus.EXPIRED,
        respondedAt: new Date(),
        durationMinutes: action.durationMinutes,
        notifyScope: action.notifyScope === 'friends-only' ? PlayIntentScope.FRIENDS_ONLY : PlayIntentScope.MUTUAL_FRIENDS,
        statusDetail: closedReason
      }
    })

    const lockedPreview = buildLockedAutoPlayPromptPreview({
      promptId: prompt.id,
      gameTitle: prompt.game.title,
      durationMinutes: action.durationMinutes,
      friendRecipientCount: prompt.friendRecipientCount,
      networkRecipientCount: prompt.networkRecipientCount,
      includeCleanup: true
    })

    await interaction.update({
      content: lockedPreview.content,
      embeds: lockedPreview.embeds,
      components: lockedPreview.components
    })

    await sendClosedAutoPlayPromptReply({
      discordUserId: interaction.user.id,
      channelId: interaction.channelId,
      messageId: interaction.message.id,
      reason: closedReason
    })

    return
  }

  const activeIntent = await prisma.playIntent.findFirst({
    where: {
      userId: prompt.user.id,
      windowStartsAt: {
        lt: new Date(Date.now() + action.durationMinutes * 60 * 1000)
      },
      windowEndsAt: {
        gt: new Date()
      }
    },
    select: {
      id: true
    }
  })

  if (activeIntent) {
    const closedReason = 'You already have an overlapping call to play.'

    await prisma.discordAutoPlayPrompt.update({
      where: {
        id: prompt.id
      },
      data: {
        status: DiscordAutoPlayPromptStatus.EXPIRED,
        respondedAt: new Date(),
        statusDetail: 'The user already had an overlapping call to play before accepting this prompt.'
      }
    })

    const lockedPreview = buildLockedAutoPlayPromptPreview({
      promptId: prompt.id,
      gameTitle: prompt.game.title,
      durationMinutes: action.durationMinutes,
      friendRecipientCount: prompt.friendRecipientCount,
      networkRecipientCount: prompt.networkRecipientCount,
      includeCleanup: true
    })

    await interaction.update({
      content: lockedPreview.content,
      embeds: lockedPreview.embeds,
      components: lockedPreview.components
    })

    await sendClosedAutoPlayPromptReply({
      discordUserId: interaction.user.id,
      channelId: interaction.channelId,
      messageId: interaction.message.id,
      reason: closedReason
    })

    return
  }

  await interaction.deferUpdate()

  try {
    const response = await upsertCurrentPlayIntent(prompt.user.id, {
      selectionMode: 'subset',
      notifyScope: action.notifyScope,
      includeSelf: false,
      createDiscordSpace: false,
      gameIds: [prompt.game.id],
      targetUserIds: [],
      targetDiscordServerIds: [],
      durationMinutes: action.durationMinutes,
      note: ''
    }, {
      skipCreatorSummarySync: true
    })

    await prisma.discordAutoPlayPrompt.update({
      where: {
        id: prompt.id
      },
      data: {
        status: DiscordAutoPlayPromptStatus.ACCEPTED,
        respondedAt: new Date(),
        durationMinutes: action.durationMinutes,
        notifyScope: action.notifyScope === 'friends-only' ? PlayIntentScope.FRIENDS_ONLY : PlayIntentScope.MUTUAL_FRIENDS,
        createdPlayIntentId: response.activeIntent.id,
        statusDetail: `${response.notifiedFriendCount} Discord DM${response.notifiedFriendCount === 1 ? '' : 's'} delivered from this Discord-created call to play.`
      }
    })

    if (prompt.discordDmChannelId && prompt.discordDmMessageId) {
      await prisma.playIntent.update({
        where: {
          id: response.activeIntent.id
        },
        data: {
          creatorDiscordDmChannelId: prompt.discordDmChannelId,
          creatorDiscordDmMessageId: prompt.discordDmMessageId
        }
      })

      await syncCreatorPlayIntentSummaryMessages([response.activeIntent.id], {
        notifyOnActiveChange: false
      })
    } else {
      await syncCreatorPlayIntentSummaryMessages([response.activeIntent.id])
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create a call to play from Discord right now.'

    await prisma.discordAutoPlayPrompt.update({
      where: {
        id: prompt.id
      },
      data: {
        status: DiscordAutoPlayPromptStatus.FAILED,
        respondedAt: new Date(),
        durationMinutes: action.durationMinutes,
        notifyScope: action.notifyScope === 'friends-only' ? PlayIntentScope.FRIENDS_ONLY : PlayIntentScope.MUTUAL_FRIENDS,
        statusDetail: message,
        dmError: message
      }
    })

    const lockedPreview = buildClosedPromptAnchorPreview({
      promptId: prompt.id,
      gameTitle: prompt.game.title,
      durationMinutes: action.durationMinutes,
      friendRecipientCount: prompt.friendRecipientCount,
      networkRecipientCount: prompt.networkRecipientCount
    })

    if (prompt.discordDmChannelId && prompt.discordDmMessageId) {
      await editDiscordDirectMessage({
        channelId: prompt.discordDmChannelId,
        messageId: prompt.discordDmMessageId,
        content: lockedPreview.content,
        embeds: lockedPreview.embeds,
        components: lockedPreview.components
      })

      await sendClosedAutoPlayPromptReply({
        discordUserId: interaction.user.id,
        channelId: prompt.discordDmChannelId,
        messageId: prompt.discordDmMessageId,
        reason: message
      })

      return
    }

    await interaction.editReply({
      content: buildClosedAutoPlayPromptReplyMessage(message),
      components: []
    })
  }
}