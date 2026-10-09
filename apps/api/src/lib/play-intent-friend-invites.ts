/** Owns participant invitations. Only accepted participants may add one of their own friends. */
import { withPlayIntentInvitationDelivery } from './play-intent-invitation-delivery.js'
import { buildCurrentPlayIntentInvitationPayload } from './play-intent-invitation-payload.js'
import { findPlayIntentAudienceResponseId } from './play-intent-audience-response.js'
import { AuthProvider, NotificationResponseChoice, NotificationType, PlayIntentSelectionMode, Prisma } from '@prisma/client'
import { prisma } from './prisma.js'
import { buildPlayIntentNotificationCopy, getEligiblePlayIntentRecipientUserIds } from './play-intents.js'
import { PlayIntentNotificationResponseError } from './play-intent-notification-responses.js'
import { ensurePlayIntentDiscordSpaceAudienceAccess } from './play-intent-discord-spaces.js'
import { syncTrackedDiscordDirectMessage } from './discord-tracked-direct-message.js'
import { publishPlayIntentInvalidation } from './dashboard-events.js'
import { toClientAvatarUrl } from './game-media.js'

const recipientTypes = [NotificationType.FRIEND_PLAYING, NotificationType.SCHEDULED_PLAY_INTENT_REMINDER, NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED]
type InviteDatabase = Prisma.TransactionClient

/** Rechecks permission at the point of use; organizers manage their audience through the composer. */
async function loadInvitableIntent(database: InviteDatabase, playIntentId: string, userId: string) {
  const intent = await database.playIntent.findUnique({
    where: { id: playIntentId },
    include: {
      user: true,
      games: { include: { game: true } },
      targetFriends: { include: { friendUser: true } },
      targetDiscordServers: { include: { server: true } }
    }
  })
  if (!intent || intent.deletedAt || intent.expiresAt <= new Date()) {
    throw new PlayIntentNotificationResponseError(409, 'This call to play is no longer active.')
  }
  if (!intent.allowParticipantInvites) {
    throw new PlayIntentNotificationResponseError(403, 'The organizer has disabled participant invitations.')
  }
  const responseId = await findPlayIntentAudienceResponseId(database, playIntentId, userId)
  const response = responseId ? await database.notification.findUnique({ where: { id: responseId } }) : null
  if (intent.userId === userId || response?.responseChoice !== NotificationResponseChoice.JOIN) {
    throw new PlayIntentNotificationResponseError(403, 'Accept this call to play before inviting a friend.')
  }
  return intent
}

/** Returns friends eligible for a new invitation, respecting blocks, mutes, and playable overlap. */
export async function getPlayIntentInvitableFriends(playIntentId: string, userId: string) {
  const intent = await loadInvitableIntent(prisma, playIntentId, userId)
  return loadEligibleFriends(prisma, intent, userId)
}

/** Uses the transaction client during mutation so eligibility reflects the locked call's latest state. */
async function loadEligibleFriends(database: InviteDatabase, intent: Awaited<ReturnType<typeof loadInvitableIntent>>, userId: string) {
  const playIntentId = intent.id
  const friends = await database.friend.findMany({
    where: { userId, friendedUserId: { notIn: [userId, intent.userId] } },
    include: { friendedUser: true }
  })
  const candidateIds = friends.map((friend) => friend.friendedUserId)
  const [notifications, invitations, blocks, mutes, library] = await Promise.all([
    database.notification.findMany({ where: { playIntentId, type: { in: recipientTypes } }, select: { userId: true } }),
    database.playIntentParticipantInvite.findMany({ where: { playIntentId }, select: { inviteeUserId: true } }),
    database.block.findMany({ where: {
      OR: [
        { userId: { in: [userId, intent.userId] }, blockedUserId: { in: candidateIds } },
        { userId: { in: candidateIds }, blockedUserId: { in: [userId, intent.userId] } }
      ]
    } }),
    database.playIntentMute.findMany({ where: { userId: { in: candidateIds }, mutedUserId: { in: [userId, intent.userId] } } }),
    intent.selectionMode === PlayIntentSelectionMode.ENTIRE_LIBRARY ? database.userGameInterest.findMany({ where: { userId: intent.userId, intentType: { not: 'COMPLETED' } }, select: { gameId: true } }) : Promise.resolve([])
  ])
  const excluded = new Set([
    ...notifications.map((notification) => notification.userId),
    ...invitations.map((invitation) => invitation.inviteeUserId),
    ...blocks.flatMap((block) => [block.userId, block.blockedUserId]),
    ...mutes.map((mute) => mute.userId)
  ])
  const eligibleIds = new Set(await getEligiblePlayIntentRecipientUserIds(
    intent.userId,
    'specific-friends',
    intent.selectionMode === PlayIntentSelectionMode.ENTIRE_LIBRARY
      ? library.map((entry) => entry.gameId) : intent.games.map((entry) => entry.gameId),
    [],
    candidateIds.filter((id) => !excluded.has(id)),
    'exclude',
    [],
    { startsAt: intent.windowStartsAt, endsAt: intent.windowEndsAt },
    database
  ))
  return friends.filter((friend) => eligibleIds.has(friend.friendedUserId)).map(({ friendedUser: friend }) => ({
    id: friend.id,
    handle: friend.handle,
    displayName: friend.displayName,
    avatarUrl: toClientAvatarUrl(friend.avatarUrl)
  })).sort((left, right) => left.displayName.localeCompare(right.displayName))
}

/** Records the invitation and notification together under the call lock. */
async function recordParticipantInvitation(playIntentId: string, userId: string, friendUserId: string) {
  return prisma.$transaction(async (transaction) => {
    // Serialize additions with organizer edits and other invitations to this call.
    await transaction.$queryRaw`SELECT "id" FROM "PlayIntent" WHERE "id" = ${playIntentId} FOR UPDATE`
    const intent = await loadInvitableIntent(transaction, playIntentId, userId)
    const friendship = await transaction.friend.findUnique({ where: { userId_friendedUserId: { userId, friendedUserId: friendUserId } } })
    if (!friendship || friendUserId === userId || friendUserId === intent.userId) {
      throw new PlayIntentNotificationResponseError(403, 'Choose one of your own friends.')
    }
    const prior = await transaction.notification.findFirst({ where: { playIntentId, userId: friendUserId, type: { in: recipientTypes } } })
    const priorInvitation = await transaction.playIntentParticipantInvite.findUnique({
      where: { playIntentId_inviteeUserId: { playIntentId, inviteeUserId: friendUserId } }
    })
    if (prior || priorInvitation) {
      return null
    }
    const eligibleFriends = await loadEligibleFriends(transaction, intent, userId)
    if (!eligibleFriends.some((friend) => friend.id === friendUserId)) {
      throw new PlayIntentNotificationResponseError(409, 'This friend is not eligible for an invitation to this call.')
    }
    const [friend, inviter] = await Promise.all([
      transaction.user.findUniqueOrThrow({ where: { id: friendUserId }, include: { identities: { where: { provider: AuthProvider.DISCORD } } } }),
      transaction.user.findUniqueOrThrow({ where: { id: userId } })
    ])
    const copy = buildPlayIntentNotificationCopy(intent.user.displayName,
      intent.selectionMode === PlayIntentSelectionMode.ENTIRE_LIBRARY ? 'library' : 'subset',
      intent.games.map((entry) => entry.game.title),
      (intent.windowEndsAt.getTime() - intent.windowStartsAt.getTime()) / 60000,
      intent.windowStartsAt, new Date(), friend.timezoneId)
    await transaction.playIntentParticipantInvite.create({ data: { playIntentId, inviterUserId: userId, inviteeUserId: friendUserId } })
    const notification = await transaction.notification.create({ data: {
      userId: friendUserId, triggeredByUserId: userId, playIntentId,
      gameId: intent.games[0]?.gameId ?? null,
      type: NotificationType.FRIEND_PLAYING,
      title: copy.title,
      body: `Invited by: ${inviter.displayName}\n${copy.body}`
    } })
    return { intent, friend, notification }
  })
}

/** Adds one eligible friend; duplicates stay quiet, and Discord failures retain the in-app invitation. */
export async function inviteFriendToPlayIntent(playIntentId: string, userId: string, friendUserId: string) {
  const result = await recordParticipantInvitation(playIntentId, userId, friendUserId)
  if (!result) {
    return { invited: false, message: 'This friend is already invited.' }
  }
  publishPlayIntentInvalidation()
  // Once saved, delivery failures must not make clients think the invitation failed.
  let accessFailed = false
  try {
    await ensurePlayIntentDiscordSpaceAudienceAccess(playIntentId, [friendUserId])
  } catch (error) {
    accessFailed = true
    console.error('Participant invitation channel access failed', { playIntentId, friendUserId, error })
  }
  try {
    const deliveryResult = await withPlayIntentInvitationDelivery(result.notification.id, async (notification, signal) => {
      if (!notification.playIntent) {
        return { invited: true, message: 'Friend invited.' }
      }
      return deliverParticipantInvitation({ ...result, notification, intent: notification.playIntent }, signal)
    }) ?? { invited: true, message: 'Friend invited, but the call has ended.' }
    return accessFailed ? { invited: true, message: 'Friend invited, but Discord channel access could not be completed.' } : deliveryResult
  } catch (error) {
    console.error('Participant invitation Discord delivery failed', { playIntentId, friendUserId, error })
    return { invited: true, message: 'Friend invited in the app, but Discord delivery or channel access could not be completed.' }
  }
}

/** Builds the normal audience DM so invited friends get the established response and cleanup flows. */
async function deliverParticipantInvitation(result: NonNullable<Awaited<ReturnType<typeof recordParticipantInvitation>>>, signal: AbortSignal) {
  const discordUserId = result.friend.identities[0]?.providerUserId
  if (discordUserId) {
    const preview = await buildCurrentPlayIntentInvitationPayload({ ...result.notification, playIntent: result.intent })
    signal.throwIfAborted()
    const delivery = await syncTrackedDiscordDirectMessage({
      discordUserId, ...preview,
      tracked: { channelId: result.notification.discordDmChannelId, messageId: result.notification.discordDmMessageId },
      onSent: async ({ channelId, messageId }) => {
        await prisma.notification.update({ where: { id: result.notification.id }, data: {
          deliveredAt: new Date(), discordDmChannelId: channelId, discordDmMessageId: messageId
        } })
      }
    })
    if (delivery.status === 'failed') {
      return { invited: true, message: 'Friend invited in the app, but Discord could not deliver the DM.' }
    }
  }
  return { invited: true, message: 'Friend invited.' }
}
