/** Reusable friends-list management with ownership checked on every interaction. */
import { ButtonStyle } from 'discord.js'
import type { DiscordNotice } from './discord-notices.js'
import { z } from 'zod'
import { createFriendsList, deleteFriendsList, getFriendsListsForUser, updateFriendsList } from './friends-lists.js'
import { getPanelFriends } from './discord-friends-panel.js'
import { type AccountPanelInteraction, panelRevision, parsePanelRevision, panelAppButton, panelButton, panelModal, panelPage, panelPaging, panelRow, panelSelect, panelView } from './discord-account-panel.js'

export async function renderFriendsListsPanel(userId: string, actor: string, requestedPage = 0, notice: DiscordNotice | null = null) {
  const lists = await getFriendsListsForUser(userId)
  const { page, pageCount, items } = panelPage(lists, requestedPage)
  const rows = []
  if (items.length) {
    rows.push(panelSelect(actor, 'list', 'Choose a friends list', items.map((list) => ({
      label: list.name, description: `${list.memberCount} friends`, value: list.id
    }))))
  }
  rows.push(...panelPaging(actor, 'lists', page, pageCount))
  rows.push(panelRow(panelButton(actor, 'list-new', 'Create list', [], ButtonStyle.Primary), panelButton(actor, 'friends', 'My friends'), panelAppButton('/friends')))
  return panelView('Friends lists', lists.length
    ? `Choose a list to rename it, change members, or delete it. Page ${page + 1} of ${pageCount}. Changes never alter calls already sent.`
    : 'Save groups of friends for future calls to play. Create a list by choosing its first friend, then add more members.', rows, notice)
}

async function loadOwnedList(userId: string, listId: string) {
  z.string().uuid().parse(listId)
  return (await getFriendsListsForUser(userId)).find((list) => list.id === listId)
}

async function renderList(userId: string, actor: string, listId: string, requestedPage = 0, notice: DiscordNotice | null = null) {
  const [list, friends] = await Promise.all([loadOwnedList(userId, listId), getPanelFriends(userId)])
  if (!list) {
    return renderFriendsListsPanel(userId, actor, 0, { severity: 'error', message: 'That list no longer exists. Choose a current list.' })
  }
  const { page, pageCount, items } = panelPage(friends, requestedPage)
  const members = new Set(list.members.map((member) => member.id))
  const rows = []
  if (items.length) {
    rows.push(panelSelect(actor, 'list-members', 'Select the members on this page', items.map((friend) => ({
      label: friend.displayName, description: `@${friend.handle}`, value: friend.id, default: members.has(friend.id)
    })), [list.id, page, panelRevision(list.updatedAt)], true))
  }
  rows.push(...panelPaging(actor, 'list-page', page, pageCount, [list.id]))
  rows.push(panelRow(panelButton(actor, 'list-rename', 'Rename', [list.id]), panelButton(actor, 'list-remove', 'Delete list', [list.id], ButtonStyle.Danger), panelButton(actor, 'lists', 'All lists'), panelAppButton('/friends')))
  return panelView(`Friends list: ${list.name}`, `${list.memberCount} members. Choose members on each page; changes save immediately and preserve members on other pages. A list needs at least one friend.\n\nPage ${page + 1} of ${pageCount}.${friends.length ? '' : ' Add friends first to repopulate this list.'}`, rows, notice)
}

async function renderNewList(userId: string, actor: string, requestedPage = 0) {
  const friends = await getPanelFriends(userId)
  const { page, pageCount, items } = panelPage(friends, requestedPage)
  const rows = []
  if (items.length) {
    rows.push(panelSelect(actor, 'list-first', 'Choose the first friend for your list', items.map((friend) => ({ label: friend.displayName, description: `@${friend.handle}`, value: friend.id }))))
  }
  rows.push(...panelPaging(actor, 'list-new', page, pageCount))
  rows.push(panelRow(panelButton(actor, 'lists', 'Cancel'), panelButton(actor, 'friends', 'My friends'), panelAppButton('/friends')))
  return panelView('Create a friends list', friends.length
    ? 'Choose the first friend, then name the list. You can add more members afterwards.'
    : 'Add at least one Game\'s Up friend before creating a list.', rows)
}

export function listsActionOpensModal(action: string) {
  return ['list-first', 'list-rename'].includes(action)
}

/** Replace only the displayed membership page, preserving all other members even after pagination shifts. */
export function mergeListPageMembers(currentIds: string[], displayedIds: string[], selectedIds: string[]) {
  const displayed = new Set(displayedIds)
  if (selectedIds.some((id) => !displayed.has(id))) {
    throw new Error('That selection is out of date. Reopen the list and try again.')
  }
  return [...new Set([...currentIds.filter((id) => !displayed.has(id)), ...selectedIds])]
}

/** Route list actions after authentication; shared services validate membership and preserve sent audiences. */
export async function handleFriendsListsPanel(interaction: AccountPanelInteraction, userId: string, action: string, args: string[]) {
  const actor = interaction.user.id
  const target = interaction.isStringSelectMenu() && action !== 'list-members' ? interaction.values[0] : args[0]
  if (action === 'lists') {
    return renderFriendsListsPanel(userId, actor, Number(args[0] ?? 0))
  }
  if (action === 'list-new') {
    return renderNewList(userId, actor, Number(args[0] ?? 0))
  }
  if (action === 'list' && target) {
    return renderList(userId, actor, target)
  }
  if (action === 'list-page' && args[1]) {
    return renderList(userId, actor, args[1], Number(args[0]))
  }
  if (action === 'list-first' && interaction.isStringSelectMenu() && target) {
    const friend = (await getPanelFriends(userId)).find((person) => person.id === target)
    if (!friend) {
      return renderFriendsListsPanel(userId, actor, 0, { severity: 'error', message: 'That person is no longer a friend. Start again.' })
    }
    await interaction.showModal(panelModal(actor, 'list-create-save', 'Name your friends list', [{ id: 'name', label: 'List name', max: 60 }], [friend.id]))
    return
  }
  if (action === 'list-create-save' && interaction.isModalSubmit() && target) {
    const list = await createFriendsList(userId, interaction.fields.getTextInputValue('name'), [z.string().uuid().parse(target)])
    return renderList(userId, actor, list.id, 0, { severity: 'success', message: 'List created. Choose more members below.' })
  }
  if (action === 'list-rename' && interaction.isButton() && target) {
    const list = await loadOwnedList(userId, target)
    if (!list) {
      return renderFriendsListsPanel(userId, actor, 0, { severity: 'error', message: 'That list no longer exists.' })
    }
    await interaction.showModal(panelModal(actor, 'list-rename-save', 'Rename friends list', [{ id: 'name', label: 'List name', max: 60, value: list.name }], [list.id, panelRevision(list.updatedAt)]))
    return
  }
  if (action === 'list-rename-save' && interaction.isModalSubmit() && target) {
    const list = await loadOwnedList(userId, target)
    if (!list) {
      return renderFriendsListsPanel(userId, actor, 0, { severity: 'error', message: 'That list no longer exists. Your changes were not saved.' })
    }
    await updateFriendsList(userId, list.id, interaction.fields.getTextInputValue('name'), list.members.map((member) => member.id), parsePanelRevision(args[1]))
    return renderList(userId, actor, list.id, 0, { severity: 'success', message: 'List renamed.' })
  }
  if (action === 'list-members' && interaction.isStringSelectMenu() && target) {
    const list = await loadOwnedList(userId, target)
    if (!list) {
      return renderFriendsListsPanel(userId, actor, 0, { severity: 'error', message: 'That list no longer exists. Your changes were not saved.' })
    }
    // The original option ids describe the displayed page, even if current follows changed since rendering.
    const memberIds = mergeListPageMembers(list.members.map((member) => member.id), interaction.component.options.map((option) => option.value), interaction.values)
    await updateFriendsList(userId, list.id, list.name, memberIds, parsePanelRevision(args[2]))
    return renderList(userId, actor, list.id, Number(args[1] ?? 0), { severity: 'success', message: 'List members saved.' })
  }
  if (action === 'list-remove' && target) {
    const list = await loadOwnedList(userId, target)
    if (!list) {
      return renderFriendsListsPanel(userId, actor, 0, { severity: 'error', message: 'That list was already deleted.' })
    }
    return panelView('Delete friends list?', `Delete ${list.name}? Your follows and calls already sent are unchanged.`, [panelRow(
      panelButton(actor, 'list-remove-confirm', 'Delete list', [list.id, panelRevision(list.updatedAt)], ButtonStyle.Danger), panelButton(actor, 'list', 'Cancel', [list.id])
    )])
  }
  if (action === 'list-remove-confirm' && target) {
    z.string().uuid().parse(target)
    const deleted = await deleteFriendsList(userId, target, parsePanelRevision(args[1]))
    return renderFriendsListsPanel(userId, actor, 0, { severity: deleted ? 'success' : 'error', message: deleted ? 'List deleted.' : 'That list was already deleted.' })
  }
  return renderFriendsListsPanel(userId, actor, 0, { severity: 'error', message: 'That control is out of date. Choose an action below.' })
}
