/**
 * URL builders for Discord-surfaced entry points into the web app.
 *
 * Owns the invite landing page URL (which preserves server and inviter
 * context across Discord OAuth), the plain /play deep link, and the Discord
 * OAuth login link used when the bot invites someone directly. Shared by the
 * guild slash commands and the call-to-play composer so unlinked users get
 * the same onboarding path from every Discord surface.
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type MessageActionRowComponentBuilder,
} from 'discord.js'
import { env } from './env.js'
import { getApiOrigin } from './origin.js'

export function buildPlayUrl() {
  try {
    return new URL('/play', env.CLIENT_ORIGIN).toString()
  } catch {
    return env.CLIENT_ORIGIN
  }
}

export function buildInviteLandingUrl(options: {
  serverId?: string | null
  serverName?: string | null
  inviterDiscordUserId?: string | null
  inviterLabel?: string | null
  memberCount?: number | null
  kind?: 'direct' | 'server'
}) {
  try {
    const inviteUrl = new URL('/invite', env.CLIENT_ORIGIN)

    if (options.serverId?.trim()) {
      inviteUrl.searchParams.set('serverId', options.serverId.trim())
    }

    if (options.serverName?.trim()) {
      inviteUrl.searchParams.set('server', options.serverName.trim())
    }

    if (options.inviterDiscordUserId?.trim()) {
      inviteUrl.searchParams.set(
        'inviterDiscordId',
        options.inviterDiscordUserId.trim(),
      )
    }

    if (options.inviterLabel?.trim()) {
      inviteUrl.searchParams.set('inviter', options.inviterLabel.trim())
    }

    if (options.memberCount != null && Number.isFinite(options.memberCount)) {
      inviteUrl.searchParams.set(
        'members',
        String(Math.max(0, Math.floor(options.memberCount))),
      )
    }

    inviteUrl.searchParams.set('kind', options.kind ?? 'server')

    return inviteUrl.toString()
  } catch {
    return buildPlayUrl()
  }
}

export function buildDiscordInviteUrl() {
  const loginUrl = new URL('/api/auth/discord/login', getApiOrigin())
  loginUrl.searchParams.set('returnTo', buildPlayUrl())
  return loginUrl.toString()
}

export function buildInviteButtonRow(url: string) {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel("Join Game's Up")
      .setURL(url),
  )
}
