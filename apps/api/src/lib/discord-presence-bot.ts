import { ActivityType, Client, Events, GatewayIntentBits, type Presence } from 'discord.js'
import { DiscordActivityType } from '@prisma/client'
import { recordDiscordPresence } from './discord-activity.js'
import { env } from './env.js'

type DiscordPresenceBotState = {
  configured: boolean;
  connected: boolean;
  guildIds: string[];
  userTag: string | null;
  lastReadyAt: string | null;
  lastError: string | null;
};

const state: DiscordPresenceBotState = {
  configured: Boolean(env.DISCORD_BOT_TOKEN),
  connected: false,
  guildIds: [],
  userTag: null,
  lastReadyAt: null,
  lastError: null
}

let client: Client | null = null
let started = false

function syncGuildIds() {
  state.guildIds = client ? [...client.guilds.cache.keys()] : []
}

function isTrackableDiscordActivity(activity: Presence['activities'][number]) {
  return activity.type === ActivityType.Playing || activity.type === ActivityType.Competing
}

async function handlePresenceUpdate(presence: Presence) {
  const activities = presence.activities
    .filter(isTrackableDiscordActivity)
    .map((activity) => ({
      name: activity.name,
      applicationId: activity.applicationId ?? null,
      activityType: activity.type === ActivityType.Competing ? DiscordActivityType.COMPETING : DiscordActivityType.PLAYING,
      details: activity.details ?? null,
      state: activity.state ?? null,
      startedAt: activity.timestamps?.start ? new Date(activity.timestamps.start) : null,
      rawPayload: {
        name: activity.name,
        applicationId: activity.applicationId ?? null,
        type: activity.type,
        details: activity.details ?? null,
        state: activity.state ?? null,
        startedAt: activity.timestamps?.start ?? null,
        createdAt: activity.createdTimestamp ?? null
      }
    }))

  try {
    await recordDiscordPresence(presence.userId, presence.guild?.id ?? null, activities)
  } catch (error) {
    console.error('Failed to record Discord presence update', error)
  }
}

export function getDiscordPresenceBotState() {
  return {
    ...state,
    guildCount: state.guildIds.length
  }
}

export async function startDiscordPresenceBot() {
  if (started) {
    return
  }

  started = true

  if (!env.DISCORD_BOT_TOKEN) {
    console.log('Discord presence bot disabled: DISCORD_BOT_TOKEN is not configured.')
    return
  }

  client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildPresences]
  })

  client.once(Events.ClientReady, () => {
    state.connected = true
    state.userTag = client?.user?.tag ?? null
    state.lastReadyAt = new Date().toISOString()
    state.lastError = null
    syncGuildIds()
    console.log(`Discord presence bot connected as ${state.userTag ?? 'unknown-user'} across ${state.guildIds.length} guild(s).`)
  })

  client.on('presenceUpdate', (_oldPresence, newPresence) => {
    void handlePresenceUpdate(newPresence)
  })

  client.on('guildCreate', () => {
    syncGuildIds()
  })

  client.on('guildDelete', () => {
    syncGuildIds()
  })

  client.on('shardDisconnect', () => {
    state.connected = false
  })

  client.on('error', (error) => {
    state.lastError = error.message
    console.error('Discord presence bot error', error)
  })

  try {
    await client.login(env.DISCORD_BOT_TOKEN)
  } catch (error) {
    state.connected = false
    state.lastError = error instanceof Error ? error.message : 'Unknown Discord bot login error'
    console.error('Discord presence bot failed to start', error)
  }
}