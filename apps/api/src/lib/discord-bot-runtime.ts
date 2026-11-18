/**
 * Shared Discord runtime entry point used by both bot modes.
 *
 * Exposes message-send / message-edit / message-delete primitives that
 * transparently use the discord.js gateway client when this process is the
 * gateway owner, and fall back to direct REST calls otherwise. In the
 * dev-only no-token mode it emits to the in-process DM simulator so every
 * downstream feature can run end-to-end without a live Discord connection.
 */

import { buildPendingDiscordDmPreview } from '@game-is-up/shared'
import { buildDebugDmPreview } from './discord-dm-preview.js'
import {
  ActionRowBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js'
import {
  discordActionStates,
  type DiscordActionComponents,
} from './discord-action-state.js'
import { buildPendingDiscordComponents } from './discord-action-lifecycle.js'
import {
  REST,
  Routes,
  type Client,
  type MessageCreateOptions,
} from 'discord.js'
import { env } from './env.js'
import { formatDiscordDirectMessageContent } from './discord-dm-formatting.js'

export type DiscordBotMode = 'off' | 'rest' | 'gateway'

export type DiscordPresenceBotState = {
  mode: DiscordBotMode
  configured: boolean
  connected: boolean
  guildIds: string[]
  userTag: string | null
  lastReadyAt: string | null
  lastError: string | null
}

export type DiscordDirectMessagePayload = {
  discordUserId: string
  content: string
  components?: MessageCreateOptions['components']
  embeds?: MessageCreateOptions['embeds']
  replyTo?: {
    channelId?: string | null
    messageId: string
    failIfNotExists?: boolean
  }
}

export type DiscordDirectMessageSendResult = {
  discordUserId: string
  status: 'sent' | 'failed'
  emulated: boolean
  error: string | null
  channelId: string | null
  messageId: string | null
}

export type DiscordDirectMessageEditPayload = {
  channelId: string
  messageId: string
  content: string
  components?: MessageCreateOptions['components']
  embeds?: MessageCreateOptions['embeds']
}

export type DiscordDirectMessageEditResult = {
  channelId: string
  messageId: string
  status: 'edited' | 'failed'
  emulated: boolean
  error: string | null
}

export type DiscordDirectMessageDeletePayload = {
  channelId: string
  messageId: string
}

export type DiscordDirectMessageDeleteResult = {
  channelId: string
  messageId: string
  status: 'deleted' | 'failed'
  emulated: boolean
  error: string | null
}

export type DiscordChannelMessageSummary = {
  id: string
  timestamp: string
  authorId: string | null
  referencedMessageId: string | null
}

function resolveDiscordBotMode(): DiscordBotMode {
  if (!env.DISCORD_BOT_TOKEN) {
    return 'off'
  }

  return env.DISCORD_BOT_MODE ?? 'gateway'
}

function shouldDeliverDiscordDirectMessages() {
  return env.NODE_ENV === 'production' || env.DISCORD_SEND_REAL_DMS_IN_DEV
}

export function areDiscordDirectMessagesEmulated() {
  return !shouldDeliverDiscordDirectMessages()
}

function toDiscordApiComponents(
  components?: MessageCreateOptions['components'],
) {
  return components?.map((component) => {
    if (
      typeof component === 'object' &&
      component != null &&
      'toJSON' in component &&
      typeof component.toJSON === 'function'
    ) {
      return component.toJSON()
    }

    return component
  })
}

function toDiscordApiEmbeds(embeds?: MessageCreateOptions['embeds']) {
  return embeds?.map((embed) => {
    if (
      typeof embed === 'object' &&
      embed != null &&
      'toJSON' in embed &&
      typeof embed.toJSON === 'function'
    ) {
      return embed.toJSON()
    }

    return embed
  })
}

function toDiscordApiMessageReference(
  replyTo: DiscordDirectMessagePayload['replyTo'] | undefined,
  channelId: string,
) {
  if (!replyTo?.messageId) {
    return undefined
  }

  if (replyTo.channelId && replyTo.channelId !== channelId) {
    return undefined
  }

  return {
    message_id: replyTo.messageId,
    channel_id: replyTo.channelId ?? channelId,
    fail_if_not_exists: replyTo.failIfNotExists ?? false,
  }
}

async function createDiscordDirectMessageChannel(discordUserId: string) {
  if (!discordBotRest) {
    throw new Error('Discord DM sending needs the bot to be configured.')
  }

  const channel = await discordBotRest.post(Routes.userChannels(), {
    body: {
      recipient_id: discordUserId,
    },
  })

  if (
    !channel ||
    typeof channel !== 'object' ||
    !('id' in channel) ||
    typeof channel.id !== 'string'
  ) {
    throw new Error('Discord did not return a DM channel for this user.')
  }

  return {
    id: channel.id,
  }
}

export async function getOrCreateDiscordDirectMessageChannel(
  discordUserId: string,
) {
  if (!discordBotRest) {
    return null
  }

  return createDiscordDirectMessageChannel(discordUserId)
}

const discordBotRest = env.DISCORD_BOT_TOKEN
  ? new REST({ version: '10' }).setToken(env.DISCORD_BOT_TOKEN)
  : null

export function getDiscordBotRest() {
  return discordBotRest
}

export const discordPresenceBotState: DiscordPresenceBotState = {
  mode: resolveDiscordBotMode(),
  configured: Boolean(env.DISCORD_BOT_TOKEN),
  connected: false,
  guildIds: [],
  userTag: null,
  lastReadyAt: null,
  lastError: null,
}

let discordBotClient: Client | null = null
let discordBotUserId: string | null | undefined

export function getDiscordBotMode(): DiscordBotMode {
  return discordPresenceBotState.mode
}

export function isDiscordBotGatewayMode() {
  return discordPresenceBotState.mode === 'gateway'
}

export function supportsDiscordInteractiveMessages() {
  return isDiscordBotGatewayMode()
}

export function getDiscordBotClient() {
  return discordBotClient
}

export function setDiscordBotClient(client: Client | null) {
  discordBotClient = client
  discordBotUserId = client?.user?.id ?? undefined
  syncDiscordPresenceBotGuildIds()
}

export function syncDiscordPresenceBotGuildIds() {
  discordPresenceBotState.guildIds = discordBotClient
    ? [...discordBotClient.guilds.cache.keys()]
    : []
}

export function getDiscordPresenceBotState() {
  return {
    ...discordPresenceBotState,
    guildCount: discordPresenceBotState.guildIds.length,
  }
}

export async function getDiscordBotUserId() {
  if (discordBotClient?.user?.id) {
    discordBotUserId = discordBotClient.user.id
    return discordBotUserId
  }

  if (discordBotUserId !== undefined) {
    return discordBotUserId
  }

  if (!discordBotRest) {
    discordBotUserId = null
    return null
  }

  try {
    const currentUser = await discordBotRest.get(Routes.user('@me'))

    if (
      currentUser &&
      typeof currentUser === 'object' &&
      'id' in currentUser &&
      typeof currentUser.id === 'string'
    ) {
      discordBotUserId = currentUser.id
      return discordBotUserId
    }
  } catch {
    // Fall through to cache a missing bot identity and let callers skip cleanup gracefully.
  }

  discordBotUserId = null
  return null
}

export async function fetchDiscordChannelMessages(options: {
  channelId: string
  before?: string
  limit?: number
}): Promise<DiscordChannelMessageSummary[]> {
  if (!discordBotRest) {
    return []
  }

  const query = new URLSearchParams()
  query.set('limit', String(Math.max(1, Math.min(options.limit ?? 100, 100))))

  if (options.before) {
    query.set('before', options.before)
  }

  const response = await discordBotRest.get(
    `${Routes.channelMessages(options.channelId)}?${query.toString()}`,
  )

  if (!Array.isArray(response)) {
    return []
  }

  return response.flatMap((entry) => {
    if (
      !entry ||
      typeof entry !== 'object' ||
      !('id' in entry) ||
      typeof entry.id !== 'string'
    ) {
      return []
    }

    const timestamp =
      'timestamp' in entry && typeof entry.timestamp === 'string'
        ? entry.timestamp
        : new Date(0).toISOString()
    const authorId =
      'author' in entry &&
      entry.author &&
      typeof entry.author === 'object' &&
      'id' in entry.author &&
      typeof entry.author.id === 'string'
        ? entry.author.id
        : null
    const referencedMessageId =
      'message_reference' in entry &&
      entry.message_reference &&
      typeof entry.message_reference === 'object' &&
      'message_id' in entry.message_reference &&
      typeof entry.message_reference.message_id === 'string'
        ? entry.message_reference.message_id
        : null

    return [
      {
        id: entry.id,
        timestamp,
        authorId,
        referencedMessageId,
      },
    ]
  })
}

export async function sendDiscordDirectMessages(
  messages: DiscordDirectMessagePayload[],
): Promise<DiscordDirectMessageSendResult[]> {
  if (messages.length === 0) {
    return []
  }

  if (!shouldDeliverDiscordDirectMessages()) {
    return messages.map((message) => ({
      discordUserId: message.discordUserId,
      status: 'sent',
      emulated: true,
      error: null,
      channelId: null,
      messageId: null,
    }))
  }

  if (!discordBotRest) {
    return messages.map((message) => ({
      discordUserId: message.discordUserId,
      status: 'failed',
      emulated: false,
      error: 'Discord DM sending needs the bot to be configured.',
      channelId: null,
      messageId: null,
    }))
  }

  const results: DiscordDirectMessageSendResult[] = []

  for (const message of messages) {
    try {
      const channel = await createDiscordDirectMessageChannel(
        message.discordUserId,
      )
      const sentMessage = await discordBotRest.post(
        Routes.channelMessages(channel.id),
        {
          body: {
            content: formatDiscordDirectMessageContent(
              message.content,
              message.embeds,
            ),
            components: toDiscordApiComponents(message.components),
            embeds: toDiscordApiEmbeds(message.embeds),
            message_reference: toDiscordApiMessageReference(
              message.replyTo,
              channel.id,
            ),
          },
        },
      )

      if (
        !sentMessage ||
        typeof sentMessage !== 'object' ||
        !('id' in sentMessage) ||
        !('channel_id' in sentMessage)
      ) {
        throw new Error('Discord did not confirm the DM send.')
      }

      results.push({
        discordUserId: message.discordUserId,
        status: 'sent',
        emulated: false,
        error: null,
        channelId:
          typeof sentMessage.channel_id === 'string'
            ? sentMessage.channel_id
            : channel.id,
        messageId: typeof sentMessage.id === 'string' ? sentMessage.id : null,
      })
    } catch (error) {
      const description =
        error instanceof Error ? error.message : 'Unable to send a Discord DM.'

      results.push({
        discordUserId: message.discordUserId,
        status: 'failed',
        emulated: false,
        error: /Cannot send messages to this user/i.test(description)
          ? 'This user is not accepting DMs from the bot.'
          : description,
        channelId: null,
        messageId: null,
      })
    }
  }

  return results
}

export async function editDiscordDirectMessage(
  message: DiscordDirectMessageEditPayload,
): Promise<DiscordDirectMessageEditResult> {
  if (!shouldDeliverDiscordDirectMessages()) {
    return {
      channelId: message.channelId,
      messageId: message.messageId,
      status: 'edited',
      emulated: true,
      error: null,
    }
  }

  if (!discordBotRest) {
    return {
      channelId: message.channelId,
      messageId: message.messageId,
      status: 'failed',
      emulated: false,
      error: 'Discord DM editing needs the bot to be configured.',
    }
  }

  const actionState = discordActionStates.get(message.messageId)
  let components = toDiscordApiComponents(message.components) ?? []
  if (actionState) {
    actionState.preview = buildPendingDiscordDmPreview(
      buildDebugDmPreview(
        message.content,
        (components as DiscordActionComponents).map(
          (row) =>
            ActionRowBuilder.from(
              row,
            ) as ActionRowBuilder<MessageActionRowComponentBuilder>,
        ),
        message.embeds,
      ),
      actionState.pressedCustomId,
    )
    actionState.restoreComponents = components as DiscordActionComponents
    components = buildPendingDiscordComponents(
      actionState.restoreComponents,
      actionState.pressedCustomId,
    )
  }

  try {
    await discordBotRest.patch(
      Routes.channelMessage(message.channelId, message.messageId),
      {
        body: {
          content: formatDiscordDirectMessageContent(
            message.content,
            message.embeds,
          ),
          components,
          embeds: toDiscordApiEmbeds(message.embeds) ?? [],
        },
      },
    )

    return {
      channelId: message.channelId,
      messageId: message.messageId,
      status: 'edited',
      emulated: false,
      error: null,
    }
  } catch (error) {
    return {
      channelId: message.channelId,
      messageId: message.messageId,
      status: 'failed',
      emulated: false,
      error:
        error instanceof Error ? error.message : 'Unable to edit a Discord DM.',
    }
  }
}

export async function deleteDiscordDirectMessage(
  message: DiscordDirectMessageDeletePayload,
): Promise<DiscordDirectMessageDeleteResult> {
  if (!shouldDeliverDiscordDirectMessages()) {
    return {
      channelId: message.channelId,
      messageId: message.messageId,
      status: 'deleted',
      emulated: true,
      error: null,
    }
  }

  if (!discordBotRest) {
    return {
      channelId: message.channelId,
      messageId: message.messageId,
      status: 'failed',
      emulated: false,
      error: 'Discord DM deletion needs the bot to be configured.',
    }
  }

  try {
    await discordBotRest.delete(
      Routes.channelMessage(message.channelId, message.messageId),
    )

    return {
      channelId: message.channelId,
      messageId: message.messageId,
      status: 'deleted',
      emulated: false,
      error: null,
    }
  } catch (error) {
    const description =
      error instanceof Error ? error.message : 'Unable to delete a Discord DM.'

    if (/Unknown Message/i.test(description)) {
      return {
        channelId: message.channelId,
        messageId: message.messageId,
        status: 'deleted',
        emulated: false,
        error: null,
      }
    }

    return {
      channelId: message.channelId,
      messageId: message.messageId,
      status: 'failed',
      emulated: false,
      error: description,
    }
  }
}
