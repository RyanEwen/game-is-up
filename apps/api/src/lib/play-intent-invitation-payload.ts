/** Builds current audience invitation payloads for both organizer and participant delivery. */
import { NotificationType } from '../generated/prisma/client.js'
import {
  buildPlayIntentGameEmbeds,
  buildPlayIntentNotificationComponents,
  buildPlayIntentNotificationPromptPreview,
  resolveAudiencePlayIntentSummaryStatus,
} from './play-intent-notification-responses.js'
import { getPlayIntentDiscordSpaceRecipientContexts } from './play-intent-discord-spaces.js'
import { getDiscordMembershipServerIds } from './discord-servers.js'
import { getInterestedUsersByPlayIntentId } from './play-intent-interested-users.js'
import type { DeliverableInvitationNotification } from './play-intent-invitation-delivery.js'

/** Uses the call and answer reloaded under the delivery lock, and respects runtime bot ownership. */
export async function buildCurrentPlayIntentInvitationPayload(
  notification: DeliverableInvitationNotification,
) {
  const intent = notification.playIntent
  if (!intent) {
    throw new Error('Invitation no longer has a call to play.')
  }
  const playIntentId = intent.id
  const friendUserId = notification.userId
  const contexts = await getPlayIntentDiscordSpaceRecipientContexts(
    playIntentId,
    [friendUserId],
  )
  const [creatorServerIds, recipientServerIds] = await Promise.all([
    getDiscordMembershipServerIds(intent.userId),
    getDiscordMembershipServerIds(friendUserId),
  ])
  const interested = await getInterestedUsersByPlayIntentId([playIntentId])
  const interestedUserLabels = (interested.get(playIntentId) ?? []).map(
    (user) => user.displayName,
  )
  const preview = buildPlayIntentNotificationPromptPreview({
    interestedCount: interestedUserLabels.length,
    interestedUserLabels,
    notificationId: notification.id,
    playIntentId,
    notificationType: NotificationType.FRIEND_PLAYING,
    responseChoice: notification.responseChoice,
    title: notification.title,
    body: notification.body,
    creatorUserId: intent.userId,
    creatorDisplayName: intent.user.displayName,
    summaryStatus: resolveAudiencePlayIntentSummaryStatus(
      intent.windowStartsAt,
    ),
    voiceChannel:
      intent.voiceChannelId || intent.voiceChannelName
        ? {
            channelId: intent.voiceChannelId,
            channelName: intent.voiceChannelName,
            recipientSharesServer: creatorServerIds.some((serverId) =>
              recipientServerIds.includes(serverId),
            ),
          }
        : null,
    discordSpace: contexts.get(friendUserId),
    allowParticipantInvites: intent.allowParticipantInvites,
    intentDetails: {
      headline: intent.headline,
      selectionMode: intent.selectionMode,
      selectedGameTitles: intent.games.map((entry) => entry.game.title),
      scope: intent.scope,
      targetDiscordServers: intent.targetDiscordServers,
      targetFriends: intent.targetFriends,
      note: intent.note,
    },
  })
  return {
    ...preview,
    embeds: [...(preview.embeds ?? []), ...buildPlayIntentGameEmbeds(intent)],
    components: buildPlayIntentNotificationComponents(
      notification.id,
      intent.userId,
      intent.user.displayName,
      notification.responseChoice,
      NotificationType.FRIEND_PLAYING,
      {
        playIntentId,
        allowParticipantInvites: intent.allowParticipantInvites,
        runningLate: notification.runningLateAt != null,
      },
    ),
  }
}
