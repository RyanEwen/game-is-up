/**
 * The one-off "join the Discord server" DM sent to a recipient who marks
 * themselves interested in a call to play whose temporary Discord channels
 * live in a server they have not joined yet.
 *
 * Why it is its own message rather than a line on the interested
 * acknowledgement: being asked to join a whole Discord server is a surprising
 * ask, and the acknowledgement had no room to explain what the server is, why
 * the invite is needed, or that access to the private channels is granted
 * automatically on join. A dedicated DM also raises its own push notification.
 *
 * Invariants:
 * - Sent at most once per (space, recipient). `PlayIntentDiscordSpaceAccessGrant.inviteSentAt`
 *   is the claim marker, so a recipient who flips interested -> pass ->
 *   interested is not re-invited.
 * - Push-safe plain text: no `-#` subtext or other markdown, and plain display
 *   names rather than `<@id>` mentions, because Android push notifications
 *   render the raw message content.
 * - Sent as a reply to the recipient's tracked call-to-play DM so the
 *   end-of-call cleanup sweep collects it with the rest of the chain.
 */

import {
  sendDiscordDirectMessages,
  supportsDiscordInteractiveMessages,
} from './discord-bot-runtime.js'
import {
  ActionRowBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js'
import {
  buildDiscordMessageHeading,
  buildOpenInAppButton,
} from './discord-dm-formatting.js'
import { claimPlayIntentDiscordSpaceInviteSend } from './play-intent-discord-spaces.js'
import { getAudiencePlayIntentReplyReference } from './play-intent-updates-log.js'
import { prisma } from './prisma.js'
import { logger } from './logger.js'

const defaultDiscordSpaceServerLabel = "the Game's Up Discord server"

/**
 * Renders the invite DM body. Exported so debug preview surfaces can render the
 * exact text the bot sends.
 */
export function buildPlayIntentDiscordSpaceInviteContent(options: {
  creatorDisplayName: string
  serverLabel: string
  inviteUrl: string
  textChannelName?: string | null
  voiceChannelName?: string | null
}) {
  const channelNames = [options.textChannelName, options.voiceChannelName]
    .map((name) => name?.trim())
    .filter((name): name is string => Boolean(name))
  const channelLine =
    channelNames.length > 0
      ? `The channels for this call are ${channelNames.join(' and ')}.`
      : null

  return [
    buildDiscordMessageHeading('🎟 One Step Left — Join the Discord Server'),
    `You are marked as interested in ${options.creatorDisplayName}'s call to play. It uses a temporary Discord channel in ${options.serverLabel}, and you are not in that server yet.`,
    "Use this invite to join. I will unlock the call's private text and voice channels for you automatically once you are in, so there is nobody you need to ask for access.",
    options.inviteUrl,
    channelLine,
    'The temporary channels are deleted a few hours after the call ends. Joining the server is a one-time step, so future calls to play will just work.',
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n\n')
}

/**
 * Sends the invite DM if this recipient has not already been sent one for this
 * space. Returns true when a DM was sent. Safe to call on every interested
 * response: the send is claimed in the database before the DM goes out.
 */
export async function sendPlayIntentDiscordSpaceInviteDirectMessage(options: {
  playIntentId: string
  recipientUserId: string
  discordUserId: string
  creatorDisplayName: string
  inviteUrl: string
  textChannelName?: string | null
  voiceChannelName?: string | null
}) {
  const claim = await claimPlayIntentDiscordSpaceInviteSend(
    options.playIntentId,
    options.recipientUserId,
  )

  if (!claim.claimed) {
    return false
  }

  const server = claim.serverId
    ? await prisma.discordServer.findUnique({
        where: { id: claim.serverId },
        select: { name: true },
      })
    : null

  const content = buildPlayIntentDiscordSpaceInviteContent({
    creatorDisplayName: options.creatorDisplayName,
    serverLabel: server?.name ?? defaultDiscordSpaceServerLabel,
    inviteUrl: options.inviteUrl,
    textChannelName: options.textChannelName,
    voiceChannelName: options.voiceChannelName,
  })

  const components = supportsDiscordInteractiveMessages()
    ? [
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          buildOpenInAppButton(options.inviteUrl, 'Join the Discord server'),
        ),
      ]
    : undefined

  const [result] = await sendDiscordDirectMessages([
    {
      discordUserId: options.discordUserId,
      content,
      components,
      replyTo: await getAudiencePlayIntentReplyReference(
        options.playIntentId,
        options.recipientUserId,
      ),
    },
  ])

  if (!result || result.status !== 'sent') {
    logger.error('Failed to send the temporary Discord space invite DM', {
      playIntentId: options.playIntentId,
      recipientUserId: options.recipientUserId,
      error: result?.error ?? 'Discord did not return a DM send result.',
    })

    return false
  }

  return true
}
