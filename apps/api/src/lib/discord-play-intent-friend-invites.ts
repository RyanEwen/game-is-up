/** Discord DM friend picker. Each selection invites one friend through the same service as the web app. */
import { AuthProvider } from '@prisma/client'
import { MessageFlags, type ButtonInteraction, type StringSelectMenuInteraction } from 'discord.js'
import { prisma } from './prisma.js'
import { PlayIntentNotificationResponseError } from './play-intent-notification-responses.js'
import { getPlayIntentInvitableFriends, inviteFriendToPlayIntent } from './play-intent-friend-invites.js'
import { runDiscordMessageAction, updateDiscordActionMessage } from './discord-action-lifecycle.js'

import { buildPlayIntentFriendInvitePicker } from './play-intent-friend-invite-picker.js'
export { playIntentFriendInvitePrefix } from './play-intent-friend-invite-picker.js'

/** Opens a paged picker in a separate response, preserving the original call invitation. */
export async function handlePlayIntentFriendInviteInteraction(interaction: ButtonInteraction | StringSelectMenuInteraction) {
  try {
    if (interaction.customId.endsWith(':open')) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
    }
    await runDiscordMessageAction(interaction, async () => {
      try {
        const [, playIntentId, action, rawPage] = interaction.customId.split(':')
        if (!playIntentId || !/^[0-9a-f-]{36}$/i.test(playIntentId)) {
          throw new PlayIntentNotificationResponseError(400, 'Invalid call to play.')
        }
        const identity = await prisma.userIdentity.findUnique({
          where: { provider_providerUserId: { provider: AuthProvider.DISCORD, providerUserId: interaction.user.id } }
        })
        if (!identity) {
          throw new PlayIntentNotificationResponseError(403, 'Sign in to Game\'s Up before inviting friends.')
        }
        if (interaction.isStringSelectMenu() && action === 'select') {
          if (interaction.values.length !== 1) {
            throw new PlayIntentNotificationResponseError(400, 'Choose exactly one friend.')
          }
          const result = await inviteFriendToPlayIntent(playIntentId, identity.userId, interaction.values[0]!)
          await updateDiscordActionMessage(interaction, { content: result.message, components: [] })
          return
        }
        const friends = await getPlayIntentInvitableFriends(playIntentId, identity.userId)
        const payload = buildPlayIntentFriendInvitePicker(playIntentId, friends, Number(rawPage) || 0)
        if (action === 'open') {
          await interaction.editReply(payload)
        } else {
          await updateDiscordActionMessage(interaction, payload)
        }
      } catch (error) {
        if (!(error instanceof PlayIntentNotificationResponseError)) {
          console.error('Discord participant invitation failed', { customId: interaction.customId, error })
        }
        const payload = { content: error instanceof PlayIntentNotificationResponseError ? error.message : 'Unable to invite a friend. Please try again.', components: [] }
        if (interaction.customId.endsWith(':open')) {
          await interaction.editReply(payload)
        } else {
          await updateDiscordActionMessage(interaction, payload)
        }
      }
    }, { privateLaunch: interaction.customId.endsWith(':open') })
  } catch (error) {
    // A failed acknowledgement or fallback reply must never escape the gateway handler.
    console.error('Discord participant invitation interaction failed', { customId: interaction.customId, error })
  }
}
