/** Shared live and admin-preview rendering for the paged, single-friend DM picker. */
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js'

import { playIntentFriendInvitePrefix } from './play-intent-interaction-ids.js'
export { playIntentFriendInvitePrefix } from './play-intent-interaction-ids.js'

/** Clamps stale pages and limits Discord selections to exactly one eligible friend. */
export function buildPlayIntentFriendInvitePicker(
  playIntentId: string,
  friends: { id: string; displayName: string; handle: string }[],
  requestedPage = 0,
) {
  const lastPage = Math.max(0, Math.ceil(friends.length / 25) - 1)
  const page = Number.isFinite(requestedPage)
    ? Math.min(lastPage, Math.max(0, Math.floor(requestedPage)))
    : 0
  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = []
  const pageFriends = friends.slice(page * 25, (page + 1) * 25)
  if (pageFriends.length > 0) {
    rows.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${playIntentFriendInvitePrefix}${playIntentId}:select`)
          .setPlaceholder('Choose one friend to invite')
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(
            pageFriends.map((friend) => ({
              label: `${friend.displayName} (@${friend.handle})`.slice(0, 100),
              value: friend.id,
            })),
          ),
      ),
    )
  }
  if (lastPage > 0) {
    rows.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(
            `${playIntentFriendInvitePrefix}${playIntentId}:page:${page - 1}`,
          )
          .setLabel('Previous')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId(
            `${playIntentFriendInvitePrefix}${playIntentId}:page:${page + 1}`,
          )
          .setLabel('Next')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === lastPage),
      ),
    )
  }
  return {
    content:
      friends.length > 0
        ? 'Choose one of your friends to invite to this call to play.'
        : 'No eligible friends to invite. Friends must have a matching playable game and not already be invited.',
    components: rows,
  }
}
