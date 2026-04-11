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
      error: 'Discord DM sending needs the bot to be configured.'
    }))
  }

  if (!discordBotClient || !discordPresenceBotState.connected) {
    return messages.map((message) => ({
      discordUserId: message.discordUserId,
      status: 'failed',
      error: 'Discord DM sending is unavailable because the bot is not connected.'
    }))
  }

  const results: DiscordDirectMessageSendResult[] = []

  for (const message of messages) {
    try {
      const discordUser = discordBotClient.users.cache.get(message.discordUserId) ?? await discordBotClient.users.fetch(message.discordUserId)
      await discordUser.send(message.components ? { content: message.content, components: message.components } : message.content)
      results.push({
        discordUserId: message.discordUserId,
        status: 'sent',
        error: null
      })
    } catch (error) {
      const description = error instanceof Error ? error.message : 'Unable to send a Discord DM.'

      results.push({
        discordUserId: message.discordUserId,
        status: 'failed',
        error: /Cannot send messages to this user/i.test(description)
          ? 'This user is not accepting DMs from the bot.'
          : description
      })
    }
  }

  return results
}