import { REST, Routes, type Client, type MessageCreateOptions } from 'discord.js'
import { env } from './env.js'

export type DiscordBotMode = 'off' | 'rest' | 'gateway'

export type DiscordPresenceBotState = {
  mode: DiscordBotMode;
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
  embeds?: MessageCreateOptions['embeds'];
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

function resolveDiscordBotMode(): DiscordBotMode {
  if (!env.DISCORD_BOT_TOKEN) {
    return 'off'
  }

  return env.DISCORD_BOT_MODE ?? 'gateway'
}

function toDiscordApiComponents(components?: MessageCreateOptions['components']) {
  return components?.map((component) => {
    if (typeof component === 'object' && component != null && 'toJSON' in component && typeof component.toJSON === 'function') {
      return component.toJSON()
    }

    return component
  })
}

function toDiscordApiEmbeds(embeds?: MessageCreateOptions['embeds']) {
  return embeds?.map((embed) => {
    if (typeof embed === 'object' && embed != null && 'toJSON' in embed && typeof embed.toJSON === 'function') {
      return embed.toJSON()
    }

    return embed
  })
}

async function createDiscordDirectMessageChannel(discordUserId: string) {
  if (!discordBotRest) {
    throw new Error('Discord DM sending needs the bot to be configured.')
  }

  const channel = await discordBotRest.post(Routes.userChannels(), {
    body: {
      recipient_id: discordUserId
    }
  })

  if (!channel || typeof channel !== 'object' || !('id' in channel) || typeof channel.id !== 'string') {
    throw new Error('Discord did not return a DM channel for this user.')
  }

  return {
    id: channel.id
  }
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
  lastError: null
}

let discordBotClient: Client | null = null

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

  if (!discordBotRest) {
    return messages.map((message) => ({
      discordUserId: message.discordUserId,
      status: 'failed',
      error: 'Discord DM sending needs the bot to be configured.',
      channelId: null,
      messageId: null
    }))
  }

  const results: DiscordDirectMessageSendResult[] = []

  for (const message of messages) {
    try {
      const channel = await createDiscordDirectMessageChannel(message.discordUserId)
      const sentMessage = await discordBotRest.post(Routes.channelMessages(channel.id), {
        body: {
          content: message.content,
          components: toDiscordApiComponents(message.components),
          embeds: toDiscordApiEmbeds(message.embeds)
        }
      })

      if (!sentMessage || typeof sentMessage !== 'object' || !('id' in sentMessage) || !('channel_id' in sentMessage)) {
        throw new Error('Discord did not confirm the DM send.')
      }

      results.push({
        discordUserId: message.discordUserId,
        status: 'sent',
        error: null,
        channelId: typeof sentMessage.channel_id === 'string' ? sentMessage.channel_id : channel.id,
        messageId: typeof sentMessage.id === 'string' ? sentMessage.id : null
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
  if (!discordBotRest) {
    return {
      channelId: message.channelId,
      messageId: message.messageId,
      status: 'failed',
      error: 'Discord DM editing needs the bot to be configured.'
    }
  }

  try {
    await discordBotRest.patch(Routes.channelMessage(message.channelId, message.messageId), {
      body: {
        content: message.content,
        components: toDiscordApiComponents(message.components) ?? []
      }
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