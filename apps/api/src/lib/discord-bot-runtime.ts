import type { Client, MessageCreateOptions } from 'discord.js'
import { env } from './env.js'

export type DiscordPresenceBotState = {
  configured: boolean;
  connected: boolean;
  guildIds: string[];
  userTag: string | null;
  lastReadyAt: string | null;
  lastError: string | null;
};

export type DiscordDirectMessagePayload = {
  discordUserId: string;
  content: string;
  components?: MessageCreateOptions['components'];
};

export type DiscordDirectMessageSendResult = {
  discordUserId: string;
  status: 'sent' | 'failed';
  error: string | null;
  channelId: string | null;
  messageId: string | null;
};

export type DiscordDirectMessageEditPayload = {
  channelId: string;
  messageId: string;
  content: string;
  components?: MessageCreateOptions['components'];
};

export type DiscordDirectMessageEditResult = {
  channelId: string;
  messageId: string;
  status: 'edited' | 'failed';
  error: string | null;
};

export const discordPresenceBotState: DiscordPresenceBotState = {
  configured: Boolean(env.DISCORD_BOT_TOKEN),
  connected: false,
  guildIds: [],
  userTag: null,
  lastReadyAt: null,
  lastError: null
}

let discordBotClient: Client | null = null

export function getDiscordBotClient() {
  return discordBotClient
}

export function setDiscordBotClient(client: Client | null) {
  discordBotClient = client
  syncDiscordPresenceBotGuildIds()
}

export function syncDiscordPresenceBotGuildIds() {
  discordPresenceBotState.guildIds = discordBotClient ? [...discordBotClient.guilds.cache.keys()] : []
}

export function getDiscordPresenceBotState() {
  return {
    ...discordPresenceBotState,
    guildCount: discordPresenceBotState.guildIds.length
  }
}

export async function sendDiscordDirectMessages(messages: DiscordDirectMessagePayload[]): Promise<DiscordDirectMessageSendResult[]> {
  if (messages.length === 0) {
    return []
  }

  if (!env.DISCORD_BOT_TOKEN) {
    return messages.map((message) => ({
      discordUserId: message.discordUserId,
      status: 'failed',
      error: 'Discord DM sending needs the bot to be configured.',
      channelId: null,
      messageId: null
    }))
  }

  if (!discordBotClient || !discordPresenceBotState.connected) {
    return messages.map((message) => ({
      discordUserId: message.discordUserId,
      status: 'failed',
      error: 'Discord DM sending is unavailable because the bot is not connected.',
      channelId: null,
      messageId: null
    }))
  }

  const results: DiscordDirectMessageSendResult[] = []

  for (const message of messages) {
    try {
      const discordUser = discordBotClient.users.cache.get(message.discordUserId) ?? await discordBotClient.users.fetch(message.discordUserId)
      const sentMessage = await discordUser.send(message.components ? { content: message.content, components: message.components } : message.content)
      results.push({
        discordUserId: message.discordUserId,
        status: 'sent',
        error: null,
        channelId: sentMessage.channelId,
        messageId: sentMessage.id
      })
    } catch (error) {
      const description = error instanceof Error ? error.message : 'Unable to send a Discord DM.'

      results.push({
        discordUserId: message.discordUserId,
        status: 'failed',
        error: /Cannot send messages to this user/i.test(description)
          ? 'This user is not accepting DMs from the bot.'
          : description,
        channelId: null,
        messageId: null
      })
    }
  }

  return results
}

export async function editDiscordDirectMessage(message: DiscordDirectMessageEditPayload): Promise<DiscordDirectMessageEditResult> {
  if (!env.DISCORD_BOT_TOKEN) {
    return {
      channelId: message.channelId,
      messageId: message.messageId,
      status: 'failed',
      error: 'Discord DM editing needs the bot to be configured.'
    }
  }

  if (!discordBotClient || !discordPresenceBotState.connected) {
    return {
      channelId: message.channelId,
      messageId: message.messageId,
      status: 'failed',
      error: 'Discord DM editing is unavailable because the bot is not connected.'
    }
  }

  try {
    const channel = await discordBotClient.channels.fetch(message.channelId)

    if (!channel?.isTextBased()) {
      throw new Error('Discord DM channel not available for editing.')
    }

    const existingMessage = await channel.messages.fetch(message.messageId)

    await existingMessage.edit({
      content: message.content,
      components: message.components ?? []
    })

    return {
      channelId: message.channelId,
      messageId: message.messageId,
      status: 'edited',
      error: null
    }
  } catch (error) {
    return {
      channelId: message.channelId,
      messageId: message.messageId,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unable to edit a Discord DM.'
    }
  }
}