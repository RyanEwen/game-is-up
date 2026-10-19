/** Private app follows and eligible discovery. Discord friend relationships are never modified. */
import { ButtonStyle } from 'discord.js'
import type { DiscordNotice } from './discord-notices.js'
import { z } from 'zod'
import { buildDiscoveryFeed } from './discovery-feed.js'
import { addFriend, removeOwnedFriend } from './friends.js'
import { prisma } from './prisma.js'
import { type AccountPanelInteraction, panelAppButton, panelButton, panelModal, panelPage, panelPaging, panelRow, panelSelect, panelView } from './discord-account-panel.js'

/** Include all current follows, even people no longer present in discovery. */
export async function getPanelFriends(userId: string) {
  const links = await prisma.friend.findMany({
    where: { userId }, select: { id: true, friendedUser: { select: { id: true, displayName: true, handle: true } } }
  })
  return links.map((link) => ({ ...link.friendedUser, followId: link.id })).sort((a, b) => a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id))
}

export async function renderFriendsPanel(userId: string, actor: string, requestedPage = 0, notice: DiscordNotice | null = null) {
  const friends = await getPanelFriends(userId)
  const { page, pageCount, items } = panelPage(friends, requestedPage)
  const rows = []
  if (items.length) {
    rows.push(panelSelect(actor, 'friend', 'Choose a friend to manage', items.map((friend) => ({
      label: friend.displayName, description: `@${friend.handle}`, value: friend.id
    }))))
  }
  rows.push(...panelPaging(actor, 'friends', page, pageCount))
  rows.push(panelRow(panelButton(actor, 'discover', 'Find friends', [], ButtonStyle.Primary), panelButton(actor, 'lists', 'Friends lists'), panelAppButton('/friends')))
  return panelView('My friends', [
    'These are your one-way Game\'s Up follows. Adding or removing one does not change Discord friendships.',
    friends.length ? `Choose a friend below. Page ${page + 1} of ${pageCount}.` : 'No friends added yet. Find people from your selected network servers, or finish network setup in the App.'
  ].join('\n\n'), rows, notice)
}

/** Reuse web discovery eligibility, including selected servers and both directions of blocks. */
export async function getEligiblePanelPeople(userId: string, query = '') {
  const feed = await buildDiscoveryFeed(userId)
  const needle = query.trim().toLocaleLowerCase()
  return feed.people.filter((person) => person.friendEligible && !person.isFriend
    && `${person.displayName} ${person.handle}`.toLocaleLowerCase().includes(needle))
    .sort((a, b) => a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id))
}

async function renderDiscovery(userId: string, actor: string, requestedPage = 0, query = '', notice: DiscordNotice | null = null) {
  // Keep the search cursor small enough to fit beside an actor and page in a custom id.
  query = z.string().max(40).parse(query)
  const people = await getEligiblePanelPeople(userId, query)
  const { page, pageCount, items } = panelPage(people, requestedPage)
  const rows = []
  if (items.length) {
    rows.push(panelSelect(actor, 'friend-add', 'Choose a person to follow', items.map((person) => ({
      label: person.displayName, description: `@${person.handle}`, value: person.id
    }))))
  }
  rows.push(...panelPaging(actor, 'discover', page, pageCount, [query]))
  rows.push(panelRow(panelButton(actor, 'friend-search', 'Search people'), panelButton(actor, 'discover', 'Show all'), panelButton(actor, 'friends', 'My friends'), panelAppButton('/friends')))
  return panelView('Find Game\'s Up friends', people.length
    ? `Choose a person to add as a one-way follow. Page ${page + 1} of ${pageCount}.`
    : 'No eligible people found. Try another search or select your network Discord servers in the App. People who block you, or whom you block, are excluded.', rows, notice)
}

/** Check current eligibility again at mutation time rather than trusting the old picker. */
export async function addEligiblePanelFriend(userId: string, targetId: string) {
  z.string().uuid().parse(targetId)
  const eligible = await getEligiblePanelPeople(userId)
  if (!eligible.some((person) => person.id === targetId)) {
    return false
  }
  await addFriend(userId, targetId)
  return true
}

export function friendsActionOpensModal(action: string) {
  return action === 'friend-search'
}

/** Route already authenticated friend actions, with explicit confirmation before removing a follow. */
export async function handleFriendsPanel(interaction: AccountPanelInteraction, userId: string, action: string, args: string[]) {
  const actor = interaction.user.id
  const target = interaction.isStringSelectMenu() ? interaction.values[0] : args[0]
  if (action === 'friends') {
    return renderFriendsPanel(userId, actor, Number(args[0] ?? 0))
  }
  if (action === 'discover') {
    return renderDiscovery(userId, actor, Number(args[0] ?? 0), args.slice(1).join(':'))
  }
  if (action === 'friend-search' && interaction.isButton()) {
    await interaction.showModal(panelModal(actor, 'friend-search-save', 'Find Game\'s Up friends', [{ id: 'query', label: 'Name or handle (blank shows everyone)', max: 40, required: false }]))
    return
  }
  if (action === 'friend-search-save' && interaction.isModalSubmit()) {
    return renderDiscovery(userId, actor, 0, interaction.fields.getTextInputValue('query'))
  }
  if (action === 'friend-add' && target) {
    const added = await addEligiblePanelFriend(userId, target)
    return renderFriendsPanel(userId, actor, 0, { severity: added ? 'success' : 'error', message: added ? 'Friend added.' : 'That person is already a friend or is no longer eligible. Refresh discovery to see current people.' })
  }
  if (action === 'friend' && target) {
    z.string().uuid().parse(target)
    const friend = (await getPanelFriends(userId)).find((person) => person.id === target)
    if (!friend) {
      return renderFriendsPanel(userId, actor, 0, { severity: 'error', message: 'That friend was already removed.' })
    }
    return panelView('Remove friend?', `Remove ${friend.displayName} (@${friend.handle}) from your Game's Up follows? They will also stop appearing in your reusable lists. Sent calls are unchanged.`, [panelRow(
      panelButton(actor, 'friend-remove-confirm', 'Remove friend', [friend.followId], ButtonStyle.Danger), panelButton(actor, 'friends', 'Cancel')
    )])
  }
  if (action === 'friend-remove-confirm' && target) {
    z.string().uuid().parse(target)
    await removeOwnedFriend(userId, target)
    return renderFriendsPanel(userId, actor, 0, { severity: 'success', message: 'Friend removed.' })
  }
  return renderFriendsPanel(userId, actor, 0, { severity: 'error', message: 'That control is out of date. Choose an action below.' })
}
