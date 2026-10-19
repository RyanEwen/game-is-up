/** Actor-bound private hub dispatcher. Public launches never update or disable the shared post. */
import { MessageFlags } from 'discord.js'
import { z } from 'zod'
import { type AccountPanelInteraction, accountHubPrefix, panelAppButton, panelButton, panelRow, panelView, parsePanelId } from './discord-account-panel.js'
import { runDiscordMessageAction, updateDiscordActionMessage } from './discord-action-lifecycle.js'
import { resolveLinkedComposerUser } from './discord-ctp-composer.js'
import { buildInviteLandingUrl, buildInviteButtonRow } from './discord-invite-links.js'
import { gamesActionOpensModal, handleGamesPanel } from './discord-games-panel.js'
import { friendsActionOpensModal, handleFriendsPanel } from './discord-friends-panel.js'
import { listsActionOpensModal, handleFriendsListsPanel } from './discord-friends-lists-panel.js'
import { FriendsListValidationError } from './friends-lists.js'
import { buildDiscordNoticeEmbeds } from './discord-notices.js'
import { RecordChangedError } from './mutation-conflict.js'
import { FriendValidationError } from './friends.js'

export function isAccountHubCustomId(customId: string) {
  return customId.startsWith(accountHubPrefix)
}

function buildJoinView(interaction: AccountPanelInteraction, linked: boolean) {
  if (linked) {
    return panelView("You're connected to Game's Up", 'Finish your games and friends setup in the App, or manage them privately here in Discord.', [panelRow(
      panelButton(interaction.user.id, 'games', 'My games'), panelButton(interaction.user.id, 'friends', 'My friends'), panelAppButton('/library')
    )])
  }
  const url = buildInviteLandingUrl({ serverId: interaction.guildId, serverName: interaction.guild?.name, kind: 'server' })
  return panelView("Join Game's Up", 'Sign in with your Discord account in the App. Your server context will follow you through sign-in. Set up your games and friends there, then return here to manage them privately or send a call to play.', [buildInviteButtonRow(url)])
}

/** Keep validation failures actionable without exposing raw database or provider errors. */
function panelErrorNotice(error: unknown, action: string) {
  if (error instanceof z.ZodError) {
    if (action.startsWith('list')) {
      return 'Use a list name between 1 and 60 characters and select at least one current friend. Reopen the list to try again.'
    }
    if (action === 'game-search-save') {
      return 'Enter at least 2 characters of the game title, then search again.'
    }
    if (action.startsWith('game')) {
      return 'Enter at least one platform separated by commas, choose Interested, Wishlist, or Playing now, and keep availability within 80 characters. Reopen the action to try again.'
    }
    return 'That selection is out of date. Refresh your private panel and choose a current person.'
  }
  if (error instanceof FriendsListValidationError || error instanceof FriendValidationError || error instanceof RecordChangedError) {
    return error.message
  }
  console.error('Private Discord account action failed', error)
  return 'Unable to finish that action right now. Check the current state below before trying again.'
}

/** Validate actor ownership before even acknowledging a private message update. */
export async function handleAccountHubInteraction(interaction: AccountPanelInteraction) {
  const route = parsePanelId(interaction.customId, interaction.user.id)
  if (!route) {
    await interaction.reply({ embeds: buildDiscordNoticeEmbeds({ severity: 'error', message: 'This private panel belongs to someone else, or the control is out of date. Open your own panel from the Game\'s Up hub.' }), flags: MessageFlags.Ephemeral })
    return
  }
  const publicLaunch = route.owner === 'open'
  if (publicLaunch && (!interaction.isButton() || interaction.message.flags.has(MessageFlags.Ephemeral))) {
    await interaction.reply({ embeds: buildDiscordNoticeEmbeds({ severity: 'error', message: 'Open this action from the public Game\'s Up hub.' }), flags: MessageFlags.Ephemeral })
    return
  }
  if (!publicLaunch && interaction.message && !interaction.message.flags.has(MessageFlags.Ephemeral)) {
    await interaction.reply({ embeds: buildDiscordNoticeEmbeds({ severity: 'error', message: 'Open your private panel from the Game\'s Up hub to continue.' }), flags: MessageFlags.Ephemeral })
    return
  }
  const opensModal = !interaction.isModalSubmit() && (gamesActionOpensModal(route.action)
    || friendsActionOpensModal(route.action) || listsActionOpensModal(route.action))

  await runDiscordMessageAction(interaction, async () => {
    if (publicLaunch) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
    }
    const deliver = async (view: ReturnType<typeof panelView>) => {
      if (publicLaunch) {
        await interaction.editReply(view)
      } else {
        await updateDiscordActionMessage(interaction, view)
      }
    }
    try {
      const user = await resolveLinkedComposerUser(interaction.user.id)
      if (!user || route.action === 'join') {
        await deliver(buildJoinView(interaction, Boolean(user)))
        return
      }
      let view
      if (route.action.startsWith('game')) {
        view = await handleGamesPanel(interaction, user.id, route.action, route.args)
      } else if (route.action.startsWith('list')) {
        view = await handleFriendsListsPanel(interaction, user.id, route.action, route.args)
      } else {
        view = await handleFriendsPanel(interaction, user.id, route.action, route.args)
      }
      if (view) {
        await deliver(view)
      }
    } catch (error) {
      const notice = panelErrorNotice(error, route.action)
      // Recovery cannot depend on the database or provider that may have just failed.
      const view = panelView('Refresh your private panel', 'Your action could not be completed. Reopen a panel to review its current state before retrying.', [panelRow(
        panelButton(interaction.user.id, 'games', 'My games'),
        panelButton(interaction.user.id, 'friends', 'My friends'),
        panelButton(interaction.user.id, 'lists', 'Friends lists'),
        panelAppButton(route.action.startsWith('game') ? '/library' : '/friends')
      )], { severity: 'error', message: notice })
      await deliver(view)
    }
  }, { privateLaunch: publicLaunch, opensModal, lockKey: publicLaunch ? null : `${accountHubPrefix}${interaction.user.id}` })
}
