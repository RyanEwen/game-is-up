import { debugAdminResponseSchema } from '@game-is-up/shared'
import {
  AuthProvider,
  DiscordAutoPlayPromptStatus,
  NotificationResponseChoice,
  NotificationType,
  PlayIntentScope,
  PlayIntentSelectionMode
} from '@prisma/client'
import { buildDiscordAutoPlayPromptPreview } from './discord-auto-play-prompts.js'
import { buildDebugDmPreview } from './discord-dm-preview.js'
import { areDiscordDirectMessagesEmulated, getDiscordPresenceBotState } from './discord-bot-runtime.js'
import { getPlayIntentDiscordSpaceRecipientContexts } from './play-intent-discord-spaces.js'
import { getPlayIntentRecipientUserIdsForDebug } from './play-intents.js'
import { buildPlayIntentNotificationCopy } from './play-intents.js'
import {
  buildPlayIntentNotificationPromptPreview,
  buildCreatorPlayIntentSummaryPreview,
  buildNotificationDirectMessagePreview,
  buildScheduledCheckInPromptPreview
} from './play-intent-notification-responses.js'
import { buildDiscordChannelUrl } from './discord-channel-urls.js'
import { prisma } from './prisma.js'

type DebugDmPreviewPayload = ReturnType<typeof buildDebugDmPreview>

type DebugDmTemplatePreviewPayload = {
  content: string;
  components: Parameters<typeof buildDebugDmPreview>[1];
  embeds?: Parameters<typeof buildDebugDmPreview>[2];
}

type DebugDmTemplateDefinition = {
  id: string;
  label: string;
  description: string;
  previewPayload: DebugDmTemplatePreviewPayload;
}

type DebugDmTemplateGroupDefinition = {
  id: string;
  label: string;
  description: string;
  entries: DebugDmTemplateDefinition[];
}

type DebugDmRevisionDraft = {
  occurredAt: string;
  preview: DebugDmPreviewPayload;
}

function areDebugDmPreviewsEqual(left: DebugDmPreviewPayload, right: DebugDmPreviewPayload) {
  return left.content === right.content
    && JSON.stringify(left.embeds) === JSON.stringify(right.embeds)
    && JSON.stringify(left.buttonRows) === JSON.stringify(right.buttonRows)
}

function finalizeDmRevisions(baseId: string, revisions: DebugDmRevisionDraft[]) {
  const sortedRevisions = [...revisions].sort((left, right) => new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime())
  const dedupedRevisions = sortedRevisions.filter((revision, index) => {
    const previousRevision = sortedRevisions[index - 1]
    return !previousRevision || !areDebugDmPreviewsEqual(previousRevision.preview, revision.preview)
  })

  return dedupedRevisions.map((revision, index) => ({
    id: `${baseId}:revision:${index + 1}`,
    label: dedupedRevisions.length === 1
      ? 'Latest state'
      : index === 0
        ? 'Initial send'
        : index === dedupedRevisions.length - 1
          ? 'Latest state'
          : `Update ${index}`,
    occurredAt: revision.occurredAt,
    preview: revision.preview
  }))
}

function getLatestMessageActivityAt(messages: Array<{ sentAt: string; revisions: Array<{ occurredAt: string }> }>) {
  return getLatestActivityAt(messages.map((message) => new Date(message.revisions[message.revisions.length - 1]?.occurredAt ?? message.sentAt)))
}

function getLatestRevisionPreview(revisions: Array<{ preview: DebugDmPreviewPayload }>) {
  const latestRevision = revisions[revisions.length - 1] ?? revisions[0]

  if (!latestRevision) {
    throw new Error('Expected at least one DM revision in the debug snapshot.')
  }

  return latestRevision.preview
}

function buildDebugDmTemplateEntry(
  template: DebugDmTemplateDefinition
) {
  return {
    id: template.id,
    label: template.label,
    description: template.description,
    preview: buildDebugDmPreview(template.previewPayload.content, template.previewPayload.components, template.previewPayload.embeds)
  }
}

function buildDebugDmTemplateDefinitions(now: Date): DebugDmTemplateGroupDefinition[] {
  const creatorDisplayName = 'Avery'
  const creatorDiscordUserId = '149608971072831489'
  const creatorTimezoneId = 'America/Vancouver'
  const gameTitle = 'The Crew: Motorfest'
  const alternateGameTitle = 'Forza Horizon 5'
  const templateVoiceChannel = {
    channelId: '424242424242424242',
    channelName: 'Motorfest pit lane',
    recipientSharesServer: true
  }
  const templateDiscordSpaceForServerMembers = {
    status: 'active' as const,
    recipientInServer: true,
    textChannelName: 'motorfest-staging',
    textChannelUrl: 'https://discord.com/channels/987654321098765432/555555555555555555',
    voiceChannelName: 'Motorfest pit lane',
    voiceChannelUrl: 'https://discord.com/channels/987654321098765432/666666666666666666',
    inviteUrl: 'https://discord.gg/gamesup-motorfest'
  }
  const templateDiscordSpaceForInvitedRecipients = {
    status: 'active' as const,
    recipientInServer: false,
    textChannelName: 'motorfest-staging',
    textChannelUrl: null,
    voiceChannelName: 'Motorfest pit lane',
    voiceChannelUrl: null,
    inviteUrl: 'https://discord.gg/gamesup-motorfest'
  }
  const templateCreatorDiscordSpace = {
    status: 'ACTIVE' as const,
    textChannelName: 'motorfest-staging',
    textChannelUrl: 'https://discord.com/channels/987654321098765432/555555555555555555',
    voiceChannelName: 'Motorfest pit lane',
    voiceChannelUrl: 'https://discord.com/channels/987654321098765432/666666666666666666',
    inviteUrl: 'https://discord.gg/gamesup-motorfest',
    deleteAfter: new Date(now.getTime() + 24 * 60 * 60 * 1000)
  }
  const templateEndedCreatorDiscordSpace = {
    status: 'RETAINED' as const,
    textChannelName: 'motorfest-staging',
    textChannelUrl: 'https://discord.com/channels/987654321098765432/555555555555555555',
    voiceChannelName: 'Motorfest pit lane',
    voiceChannelUrl: 'https://discord.com/channels/987654321098765432/666666666666666666',
    inviteUrl: 'https://discord.gg/gamesup-motorfest',
    deleteAfter: new Date(now.getTime() + 12 * 60 * 60 * 1000)
  }
  const templateArchivedBody = [
    `Creator: <@${creatorDiscordUserId}>`,
    `Games: ${gameTitle}, ${alternateGameTitle}`,
    'When: Apr 17, 7:00 PM PDT',
    'Status: This call to play is no longer active.'
  ].join('\n')
  const liveInviteCopy = buildPlayIntentNotificationCopy(
    creatorDisplayName,
    'subset',
    [gameTitle],
    120,
    new Date(now.getTime() - 15 * 60 * 1000),
    now,
    creatorTimezoneId
  )
  const updatedInviteCopy = buildPlayIntentNotificationCopy(
    creatorDisplayName,
    'subset',
    [gameTitle],
    90,
    new Date(now.getTime() + 90 * 60 * 1000),
    now,
    creatorTimezoneId,
    ['time', 'game selection']
  )
  const confirmedUpdate = {
    title: `${creatorDisplayName} confirmed the session is on`,
    body: `Update: ${creatorDisplayName} confirmed the session is still on.\nWhen: Right now.`
  }
  const reminderUpdate = {
    title: `${creatorDisplayName} confirmed the session is on`,
    body: `Update: ${creatorDisplayName} confirmed this session is still on.\nWhen: Right now.`
  }
  const liveSummaryNotifications = [
    {
      userId: 'template-user-1',
      type: NotificationType.FRIEND_PLAYING,
      respondedAt: new Date(now.getTime() - 20 * 60 * 1000),
      responseChoice: NotificationResponseChoice.JOIN,
      deliveredAt: new Date(now.getTime() - 35 * 60 * 1000),
      createdAt: new Date(now.getTime() - 35 * 60 * 1000),
      user: {
        displayName: 'Jordan',
        identities: [{ providerUserId: '200000000000000001' }]
      }
    },
    {
      userId: 'template-user-2',
      type: NotificationType.FRIEND_PLAYING,
      respondedAt: new Date(now.getTime() - 10 * 60 * 1000),
      responseChoice: NotificationResponseChoice.DECLINE,
      deliveredAt: new Date(now.getTime() - 30 * 60 * 1000),
      createdAt: new Date(now.getTime() - 30 * 60 * 1000),
      user: {
        displayName: 'Sam',
        identities: [{ providerUserId: '200000000000000002' }]
      }
    },
    {
      userId: 'template-user-3',
      type: NotificationType.FRIEND_PLAYING,
      respondedAt: null,
      responseChoice: null,
      deliveredAt: new Date(now.getTime() - 25 * 60 * 1000),
      createdAt: new Date(now.getTime() - 25 * 60 * 1000),
      user: {
        displayName: 'Riley',
        identities: [{ providerUserId: '200000000000000003' }]
      }
    }
  ]
  const liveSummaryPreview = buildCreatorPlayIntentSummaryPreview({
    id: 'template-live-summary',
    headline: 'Looking for a crew and happy to hop into voice.',
    note: 'Starting from the downtown playlist. Jump in when ready.',
    selectionMode: 'SELECTED_GAMES',
    scope: 'SPECIFIC_DISCORD_SERVER',
    windowStartsAt: new Date(now.getTime() - 30 * 60 * 1000),
    windowEndsAt: new Date(now.getTime() + 90 * 60 * 1000),
    expiresAt: new Date(now.getTime() + 90 * 60 * 1000),
    voiceChannelName: 'Motorfest pit lane',
    user: {
      displayName: creatorDisplayName,
      timezoneId: creatorTimezoneId
    },
    targetDiscordServers: [{ server: { name: 'Racing Night' } }],
    targetFriends: [],
    games: [
      { game: { title: gameTitle } },
      { game: { title: alternateGameTitle } }
    ],
    notifications: liveSummaryNotifications,
    discordSpace: templateCreatorDiscordSpace,
    currentTime: now
  })
  const scheduledSummaryPreview = buildCreatorPlayIntentSummaryPreview({
    id: 'template-scheduled-summary',
    headline: 'Planning ahead for tonight.',
    note: 'Will confirm once dinner wraps up.',
    selectionMode: 'ENTIRE_LIBRARY',
    scope: 'FRIENDS_ONLY',
    windowStartsAt: new Date(now.getTime() + 2 * 60 * 60 * 1000),
    windowEndsAt: new Date(now.getTime() + 4 * 60 * 60 * 1000),
    expiresAt: new Date(now.getTime() + 4 * 60 * 60 * 1000),
    voiceChannelName: null,
    user: {
      displayName: creatorDisplayName,
      timezoneId: creatorTimezoneId
    },
    targetDiscordServers: [],
    targetFriends: [],
    games: [],
    notifications: [],
    discordSpace: templateCreatorDiscordSpace,
    currentTime: now
  })
  const endedSummaryPreview = buildCreatorPlayIntentSummaryPreview({
    id: 'template-ended-summary',
    headline: 'Wrapped up for the night.',
    note: 'Good run.',
    selectionMode: 'SELECTED_GAMES',
    scope: 'SPECIFIC_FRIENDS',
    windowStartsAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
    windowEndsAt: new Date(now.getTime() - 30 * 60 * 1000),
    expiresAt: new Date(now.getTime() - 30 * 60 * 1000),
    voiceChannelName: null,
    user: {
      displayName: creatorDisplayName,
      timezoneId: creatorTimezoneId
    },
    targetDiscordServers: [],
    targetFriends: [{
      friendUser: {
        displayName: 'Jordan',
        identities: [{ providerUserId: '200000000000000001' }]
      }
    }],
    games: [{ game: { title: gameTitle } }],
    notifications: liveSummaryNotifications,
    discordSpace: templateEndedCreatorDiscordSpace,
    currentTime: now
  })
  const autoPlayCreatedSummaryPreview = buildCreatorPlayIntentSummaryPreview({
    id: 'template-auto-play-created-summary',
    headline: 'Picked up from Discord auto-play.',
    note: '',
    selectionMode: 'SELECTED_GAMES',
    scope: 'MUTUAL_FRIENDS',
    windowStartsAt: now,
    windowEndsAt: new Date(now.getTime() + 2 * 60 * 60 * 1000),
    expiresAt: new Date(now.getTime() + 2 * 60 * 60 * 1000),
    voiceChannelName: null,
    user: {
      displayName: creatorDisplayName,
      timezoneId: creatorTimezoneId
    },
    targetDiscordServers: [],
    targetFriends: [],
    games: [{ game: { title: gameTitle } }],
    notifications: [],
    discordSpace: templateCreatorDiscordSpace,
    currentTime: now
  })

  return [
    {
      id: 'call-to-play-audience',
      label: 'Call to Play Audience',
      description: 'Recipient-facing Discord DM templates for initial invites, go-time updates, and resolution states.',
      entries: [
        {
          id: 'recipient-live-invite',
          label: 'Live invite',
          description: 'The first DM an audience member gets when a live call to play matches them.',
          previewPayload: buildNotificationDirectMessagePreview({
            notificationId: 'template-live-invite',
            notificationType: NotificationType.FRIEND_PLAYING,
            title: liveInviteCopy.title,
            body: liveInviteCopy.body,
            creatorUserId: 'template-creator',
            creatorDiscordUserId,
            creatorDisplayName,
            gameTitle,
            playIntentIsActive: true,
            voiceChannel: templateVoiceChannel,
            discordSpace: templateDiscordSpaceForServerMembers,
            interestedCount: 2,
            interestedUserLabels: ['Jordan', 'Casey']
          })
        },
        {
          id: 'recipient-scheduled-update',
          label: 'Scheduled update',
          description: 'A refreshed invite when the scheduled time or game selection changed.',
          previewPayload: buildNotificationDirectMessagePreview({
            notificationId: 'template-scheduled-update',
            notificationType: NotificationType.FRIEND_PLAYING,
            title: updatedInviteCopy.title,
            body: updatedInviteCopy.body,
            creatorUserId: 'template-creator',
            creatorDiscordUserId,
            creatorDisplayName,
            gameTitle,
            playIntentIsActive: true,
            voiceChannel: templateVoiceChannel,
            discordSpace: templateDiscordSpaceForServerMembers,
            interestedCount: 1,
            interestedUserLabels: ['Jordan']
          })
        },
        {
          id: 'recipient-go-time-reminder',
          label: 'Go-time reminder',
          description: 'The follow-up DM sent to unanswered recipients after the creator confirms a scheduled call is still on.',
          previewPayload: buildNotificationDirectMessagePreview({
            notificationId: 'template-go-time-reminder',
            notificationType: NotificationType.SCHEDULED_PLAY_INTENT_REMINDER,
            title: reminderUpdate.title,
            body: reminderUpdate.body,
            creatorUserId: 'template-creator',
            creatorDiscordUserId,
            creatorDisplayName,
            gameTitle,
            playIntentIsActive: true,
            voiceChannel: templateVoiceChannel,
            discordSpace: templateDiscordSpaceForServerMembers,
            interestedCount: 2,
            interestedUserLabels: ['Jordan', 'Casey']
          })
        },
        {
          id: 'recipient-go-time-confirmed',
          label: 'Go-time confirmation',
          description: 'The follow-up DM accepted recipients receive when a scheduled call reaches go-time.',
          previewPayload: buildNotificationDirectMessagePreview({
            notificationId: 'template-go-time-confirmed',
            notificationType: NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED,
            title: confirmedUpdate.title,
            body: confirmedUpdate.body,
            creatorUserId: 'template-creator',
            creatorDiscordUserId,
            creatorDisplayName,
            gameTitle,
            playIntentIsActive: true,
            voiceChannel: templateVoiceChannel,
            discordSpace: templateDiscordSpaceForServerMembers,
            interestedCount: 2,
            interestedUserLabels: ['Jordan', 'Casey']
          })
        },
        {
          id: 'recipient-join-confirmation',
          label: 'Interested confirmation',
          description: 'The confirmation a recipient sees after pressing I\'m interested.',
          previewPayload: buildNotificationDirectMessagePreview({
            notificationId: 'template-join-confirmation',
            notificationType: NotificationType.FRIEND_PLAYING,
            title: liveInviteCopy.title,
            body: liveInviteCopy.body,
            responseChoice: NotificationResponseChoice.JOIN,
            creatorUserId: 'template-creator',
            creatorDiscordUserId,
            creatorDisplayName,
            gameTitle,
            playIntentIsActive: true,
            voiceChannel: templateVoiceChannel,
            discordSpace: templateDiscordSpaceForInvitedRecipients
          })
        },
        {
          id: 'recipient-pass-confirmation',
          label: 'Pass confirmation',
          description: 'The confirmation a recipient sees after pressing Pass.',
          previewPayload: buildNotificationDirectMessagePreview({
            notificationId: 'template-pass-confirmation',
            notificationType: NotificationType.FRIEND_PLAYING,
            title: liveInviteCopy.title,
            body: liveInviteCopy.body,
            responseChoice: NotificationResponseChoice.DECLINE,
            creatorUserId: 'template-creator',
            creatorDiscordUserId,
            creatorDisplayName,
            gameTitle,
            playIntentIsActive: true,
            voiceChannel: templateVoiceChannel
          })
        },
        {
          id: 'recipient-ended-summary',
          label: 'Ended summary',
          description: 'The archived DM that replaces an old audience invite when the call ends.',
          previewPayload: buildNotificationDirectMessagePreview({
            notificationId: 'template-ended-summary',
            notificationType: NotificationType.SYSTEM,
            title: 'Call to play ended',
            body: templateArchivedBody,
            actorDisplayName: creatorDisplayName,
            actorDiscordUserId: creatorDiscordUserId
          })
        },
        {
          id: 'recipient-creator-launched-game',
          label: 'Creator launched the game',
          description: 'The one-time alert sent to interested audience members when the creator launches the selected game.',
          previewPayload: buildNotificationDirectMessagePreview({
            notificationId: 'template-creator-launched-game',
            notificationType: NotificationType.SYSTEM,
            title: 'Creator launched the game',
            body: `${creatorDisplayName} just launched ${gameTitle} for the active call to play you are interested in.`,
            actorDisplayName: creatorDisplayName,
            actorDiscordUserId: creatorDiscordUserId
          })
        }
      ]
    },
    {
      id: 'call-to-play-creator',
      label: 'Call to Play Creator',
      description: 'Creator-facing DM templates for summaries, interest updates, and scheduled check-ins.',
      entries: [
        {
          id: 'creator-summary-live',
          label: 'Live summary',
          description: 'The persistent creator summary while a call is currently active.',
          previewPayload: liveSummaryPreview
        },
        {
          id: 'creator-summary-scheduled',
          label: 'Scheduled summary',
          description: 'The creator summary for a future scheduled call before go-time.',
          previewPayload: scheduledSummaryPreview
        },
        {
          id: 'creator-summary-ended',
          label: 'Ended summary',
          description: 'The creator summary after the call has already ended.',
          previewPayload: endedSummaryPreview
        },
        {
          id: 'creator-interest-update',
          label: 'Interest update',
          description: 'The separate creator-facing DM sent when someone marks themselves interested.',
          previewPayload: buildNotificationDirectMessagePreview({
            notificationId: 'template-interest-update',
            notificationType: NotificationType.SYSTEM,
            title: 'Someone is interested',
            body: `Jordan is interested in playing ${gameTitle}.`,
            actorDisplayName: 'Jordan',
            actorDiscordUserId: '200000000000000001'
          })
        },
        {
          id: 'creator-interest-withdrawn',
          label: 'Interest withdrawn',
          description: 'The separate creator-facing DM sent when someone who was interested changes their mind.',
          previewPayload: buildNotificationDirectMessagePreview({
            notificationId: 'template-interest-withdrawn',
            notificationType: NotificationType.SYSTEM,
            title: 'Someone passed',
            body: `Jordan passed on ${gameTitle}.`,
            actorDisplayName: 'Jordan',
            actorDiscordUserId: '200000000000000001'
          })
        },
        {
          id: 'creator-interested-player-launched-game',
          label: 'Interested player launched the game',
          description: 'The one-time alert sent to the creator when an interested audience member launches the selected game.',
          previewPayload: buildNotificationDirectMessagePreview({
            notificationId: 'template-interested-player-launched-game',
            notificationType: NotificationType.SYSTEM,
            title: 'Interested player launched the game',
            body: `Jordan just launched ${gameTitle} for your active call to play.`,
            actorDisplayName: 'Jordan',
            actorDiscordUserId: '200000000000000001'
          })
        },
        {
          id: 'creator-check-in-prompt',
          label: 'Go-time check-in',
          description: 'The prompt asking the creator whether the scheduled call is still happening.',
          previewPayload: buildNotificationDirectMessagePreview({
            notificationId: 'template-check-in',
            notificationType: NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN,
            title: 'Is your scheduled call to play still on?',
            body: 'Your scheduled call to play is starting now. Confirm if it is still on.',
            creatorDiscordUserId,
            creatorDisplayName,
            playIntentIsActive: true
          })
        },
        {
          id: 'creator-check-in-confirmed',
          label: 'Confirmed response',
          description: 'The confirmation the creator sees after saying the scheduled call is still on.',
          previewPayload: buildNotificationDirectMessagePreview({
            notificationId: 'template-check-in-confirmed',
            notificationType: NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN,
            title: 'Is your scheduled call to play still on?',
            body: 'Your scheduled call to play is starting now. Confirm if it is still on.',
            responseChoice: NotificationResponseChoice.CONFIRMED,
            creatorDiscordUserId,
            creatorDisplayName,
            playIntentIsActive: true
          })
        },
        {
          id: 'creator-check-in-ended',
          label: 'Ended response',
          description: 'The confirmation the creator sees after ending a scheduled call from Discord.',
          previewPayload: buildNotificationDirectMessagePreview({
            notificationId: 'template-check-in-ended',
            notificationType: NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN,
            title: 'Is your scheduled call to play still on?',
            body: 'Your scheduled call to play is starting now. Confirm if it is still on.',
            responseChoice: NotificationResponseChoice.CANCELED,
            creatorDiscordUserId,
            creatorDisplayName,
            playIntentIsActive: true
          })
        },
        {
          id: 'creator-check-in-expired',
          label: 'Expired check-in',
          description: 'The fallback state if the creator never confirms before the scheduled prompt expires.',
          previewPayload: buildNotificationDirectMessagePreview({
            notificationId: 'template-check-in-expired',
            notificationType: NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN,
            title: 'Is your scheduled call to play still on?',
            body: 'Your scheduled call to play is starting now. Confirm if it is still on.',
            responseChoice: NotificationResponseChoice.EXPIRED,
            creatorDiscordUserId,
            creatorDisplayName,
            playIntentIsActive: false
          })
        }
      ]
    },
    {
      id: 'auto-play-prompts',
      label: 'Auto-Play Prompts',
      description: 'Discord DM templates for automatic prompts that appear when the bot sees someone start a game.',
      entries: [
        {
          id: 'auto-play-initial',
          label: 'Initial prompt',
          description: 'The first prompt offering to create a call to play from detected gameplay.',
          previewPayload: buildDiscordAutoPlayPromptPreview({
            promptId: 'template-auto-play-initial',
            status: DiscordAutoPlayPromptStatus.SENT,
            gameTitle,
            durationMinutes: null,
            notifyScope: null,
            friendRecipientCount: 3,
            networkRecipientCount: 7,
            statusDetail: 'Prompt DM queued.',
            deliveredCount: 0
          }) ?? { content: '', components: [] }
        },
        {
          id: 'auto-play-audience',
          label: 'Audience picker',
          description: 'The second prompt after the user picks a duration and needs to choose who gets the call.',
          previewPayload: buildDiscordAutoPlayPromptPreview({
            promptId: 'template-auto-play-audience',
            status: DiscordAutoPlayPromptStatus.SENT,
            gameTitle,
            durationMinutes: 120,
            notifyScope: null,
            friendRecipientCount: 3,
            networkRecipientCount: 7,
            statusDetail: 'Waiting for audience selection.',
            deliveredCount: 0
          }) ?? { content: '', components: [] }
        },
        {
          id: 'auto-play-live',
          label: 'Call created',
          description: 'The regular creator summary that replaces the auto-play prompt after the call is created.',
          previewPayload: autoPlayCreatedSummaryPreview
        },
        {
          id: 'auto-play-declined',
          label: 'Declined prompt',
          description: 'The response shown after choosing Not now.',
          previewPayload: buildDiscordAutoPlayPromptPreview({
            promptId: 'template-auto-play-declined',
            status: DiscordAutoPlayPromptStatus.DECLINED,
            gameTitle,
            durationMinutes: null,
            notifyScope: null,
            friendRecipientCount: 3,
            networkRecipientCount: 7,
            statusDetail: 'The user declined the prompt from Discord.',
            deliveredCount: 0
          }) ?? { content: '', components: [] }
        },
        {
          id: 'auto-play-expired',
          label: 'Closed prompt',
          description: 'The state shown when the prompt is no longer valid because the game activity ended or conditions changed.',
          previewPayload: buildDiscordAutoPlayPromptPreview({
            promptId: 'template-auto-play-expired',
            status: DiscordAutoPlayPromptStatus.EXPIRED,
            gameTitle,
            durationMinutes: 120,
            notifyScope: PlayIntentScope.FRIENDS_ONLY,
            friendRecipientCount: 0,
            networkRecipientCount: 0,
            statusDetail: `This prompt was closed because we are no longer seeing you in ${gameTitle}.`,
            deliveredCount: 0
          }) ?? { content: '', components: [] }
        }
      ]
    }
  ]
}

function buildDebugDmTemplates(now: Date) {
  return buildDebugDmTemplateDefinitions(now).map((group) => ({
    id: group.id,
    label: group.label,
    description: group.description,
    entries: group.entries.map((entry) => buildDebugDmTemplateEntry(entry))
  }))
}

export function getDebugDmTemplateSendPayload(templateId: string, now: Date = new Date()) {
  for (const group of buildDebugDmTemplateDefinitions(now)) {
    const template = group.entries.find((entry) => entry.id === templateId)

    if (template) {
      return {
        groupLabel: group.label,
        templateLabel: template.label,
        previewPayload: template.previewPayload
      }
    }
  }

  return null
}

function toCreatorSummaryNotificationsAtTime(
  notifications: Array<{
    userId: string;
    type: NotificationType;
    respondedAt: Date | null;
    responseChoice: NotificationResponseChoice | null;
    deliveredAt: Date | null;
    createdAt: Date;
  }>,
  currentTime: Date
) {
  return notifications
    .filter((notification) => notification.createdAt.getTime() <= currentTime.getTime())
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .map((notification) => ({
      userId: notification.userId,
      type: notification.type,
      respondedAt: notification.respondedAt && notification.respondedAt.getTime() <= currentTime.getTime()
        ? notification.respondedAt
        : null,
      responseChoice: notification.respondedAt && notification.respondedAt.getTime() <= currentTime.getTime()
        ? notification.responseChoice
        : null,
      deliveredAt: notification.deliveredAt && notification.deliveredAt.getTime() <= currentTime.getTime()
        ? notification.deliveredAt
        : null,
      createdAt: notification.createdAt
    }))
}

function buildCreatorSummaryRevisions(intent: {
  createdAt: Date;
  id: string;
  headline: string;
  note: string;
  selectionMode: PlayIntentSelectionMode;
  scope: PlayIntentScope;
  windowStartsAt: Date;
  windowEndsAt: Date;
  expiresAt: Date;
  voiceChannelName: string | null;
  discordSpace: {
    status: 'REQUESTED' | 'PROVISIONING' | 'ACTIVE' | 'RETAINED' | 'DELETE_REQUESTED' | 'DELETED' | 'PROVISION_FAILED';
    textChannelName: string | null;
    textChannelUrl: string | null;
    voiceChannelName: string | null;
    voiceChannelUrl: string | null;
    inviteUrl: string | null;
    deleteAfter: Date | null;
  } | null;
  user: {
    displayName: string;
    timezoneId: string;
  };
  targetDiscordServers: Array<{
    server: {
      name: string;
    };
  }>;
  targetFriends: Array<{
    friendUser: {
      displayName: string;
      identities: { providerUserId: string }[];
    };
  }>;
  games: Array<{
    game: {
      title: string;
    };
  }>;
  notifications: Array<{
    userId: string;
    type: NotificationType;
    respondedAt: Date | null;
    responseChoice: NotificationResponseChoice | null;
    deliveredAt: Date | null;
    createdAt: Date;
  }>;
}, now: Date) {
  const revisionTimestamps = new Set<number>([intent.createdAt.getTime()])

  for (const notification of intent.notifications) {
    revisionTimestamps.add(notification.createdAt.getTime())

    if (notification.deliveredAt) {
      revisionTimestamps.add(notification.deliveredAt.getTime())
    }

    if (notification.respondedAt) {
      revisionTimestamps.add(notification.respondedAt.getTime())
    }
  }

  if (intent.expiresAt.getTime() <= now.getTime()) {
    revisionTimestamps.add(intent.expiresAt.getTime())
  }

  return finalizeDmRevisions(
    `creator-summary:${intent.id}`,
    [...revisionTimestamps]
      .sort((left, right) => left - right)
      .map((timestamp) => {
        const currentTime = new Date(timestamp)
        const previewPayload = buildCreatorPlayIntentSummaryPreview({
          id: intent.id,
          headline: intent.headline,
          note: intent.note,
          selectionMode: intent.selectionMode,
          scope: intent.scope,
          windowStartsAt: intent.windowStartsAt,
          windowEndsAt: intent.windowEndsAt,
          expiresAt: intent.expiresAt,
          voiceChannelName: intent.voiceChannelName,
          discordSpace: intent.discordSpace,
          user: intent.user,
          targetDiscordServers: intent.targetDiscordServers,
          targetFriends: intent.targetFriends,
          games: intent.games,
          notifications: toCreatorSummaryNotificationsAtTime(intent.notifications, currentTime),
          currentTime
        })

        return {
          occurredAt: currentTime.toISOString(),
          preview: buildDebugDmPreview(previewPayload.content, previewPayload.components, previewPayload.embeds)
        }
      })
  )
}

function buildNotificationMessageRevisions(options: {
  messageId: string;
  notification: {
    id: string;
    createdAt: Date;
    respondedAt: Date | null;
    responseChoice: NotificationResponseChoice | null;
    type: NotificationType;
    title: string;
    body: string;
    userId: string;
    game: {
      title: string;
    } | null;
  };
  creatorUserId: string;
  creatorDiscordUserId: string | null;
  creatorDisplayName: string;
  gameTitle: string | null;
  voiceChannel: { channelId: string | null; channelName: string | null; recipientSharesServer: boolean } | null;
  discordSpace?: Parameters<typeof buildNotificationDirectMessagePreview>[0]['discordSpace'];
  interestedCount?: number;
  actorDisplayName?: string | null;
  actorDiscordUserId?: string | null;
}) {
  const basePreviewOptions = {
    notificationId: options.notification.id,
    notificationType: options.notification.type,
    title: options.notification.title,
    body: options.notification.body,
    creatorUserId: options.creatorUserId,
    creatorDiscordUserId: options.creatorDiscordUserId,
    creatorDisplayName: options.creatorDisplayName,
    gameTitle: options.gameTitle,
    voiceChannel: options.voiceChannel,
    discordSpace: options.discordSpace,
    interestedCount: options.interestedCount,
    actorDisplayName: options.actorDisplayName,
    actorDiscordUserId: options.actorDiscordUserId
  }
  const revisions: DebugDmRevisionDraft[] = [{
    occurredAt: options.notification.createdAt.toISOString(),
    preview: (() => {
      const previewPayload = options.notification.type === NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN
        ? buildScheduledCheckInPromptPreview({
            notificationId: options.notification.id,
            creatorDiscordUserId: options.creatorDiscordUserId,
            creatorDisplayName: options.creatorDisplayName
          })
        : options.notification.type === NotificationType.FRIEND_PLAYING
          || options.notification.type === NotificationType.SCHEDULED_PLAY_INTENT_REMINDER
          || options.notification.type === NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED
          ? buildPlayIntentNotificationPromptPreview({
              ...basePreviewOptions,
              responseChoice: null
            })
          : buildNotificationDirectMessagePreview({
              ...basePreviewOptions,
              responseChoice: null,
              playIntentIsActive: true
            })

      return buildDebugDmPreview(previewPayload.content, previewPayload.components, previewPayload.embeds)
    })()
  }]

  if (options.notification.responseChoice && options.notification.respondedAt) {
    const resolvedPreview = options.notification.type === NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN
      ? buildScheduledCheckInPromptPreview({
          notificationId: options.notification.id,
          creatorDiscordUserId: options.creatorDiscordUserId,
          creatorDisplayName: options.creatorDisplayName,
          resolved: true
        })
      : options.notification.type === NotificationType.FRIEND_PLAYING
        || options.notification.type === NotificationType.SCHEDULED_PLAY_INTENT_REMINDER
        || options.notification.type === NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED
        ? options.notification.responseChoice === NotificationResponseChoice.EXPIRED
          ? buildNotificationDirectMessagePreview({
              ...basePreviewOptions,
              responseChoice: options.notification.responseChoice,
              playIntentIsActive: false
            })
          : buildPlayIntentNotificationPromptPreview({
              ...basePreviewOptions,
              responseChoice: options.notification.responseChoice
            })
        : buildNotificationDirectMessagePreview({
            ...basePreviewOptions,
            responseChoice: options.notification.responseChoice,
            playIntentIsActive: options.notification.responseChoice === NotificationResponseChoice.EXPIRED ? false : true
          })

    revisions.push({
      occurredAt: options.notification.respondedAt.toISOString(),
      preview: buildDebugDmPreview(resolvedPreview.content, resolvedPreview.components, resolvedPreview.embeds)
    })
  }

  return finalizeDmRevisions(options.messageId, revisions)
}

function buildNotificationFollowUpPreview(options: {
  notificationId: string;
  notificationType: NotificationType;
  responseChoice: NotificationResponseChoice;
  title: string;
  body: string;
  creatorUserId: string;
  creatorDiscordUserId: string | null;
  creatorDisplayName: string;
  gameTitle: string | null;
  voiceChannel: { channelId: string | null; channelName: string | null; recipientSharesServer: boolean } | null;
  discordSpace?: Parameters<typeof buildNotificationDirectMessagePreview>[0]['discordSpace'];
  interestedCount?: number;
  actorDisplayName?: string | null;
  actorDiscordUserId?: string | null;
}) {
  return buildNotificationDirectMessagePreview({
    notificationId: options.notificationId,
    notificationType: options.notificationType,
    title: options.title,
    body: options.body,
    responseChoice: options.responseChoice,
    creatorUserId: options.creatorUserId,
    creatorDiscordUserId: options.creatorDiscordUserId,
    creatorDisplayName: options.creatorDisplayName,
    gameTitle: options.gameTitle,
    voiceChannel: options.voiceChannel,
    discordSpace: options.discordSpace,
    interestedCount: options.interestedCount,
    actorDisplayName: options.actorDisplayName,
    actorDiscordUserId: options.actorDiscordUserId,
    playIntentIsActive: options.responseChoice !== NotificationResponseChoice.EXPIRED
  })
}

function toClientPromptStatus(status: DiscordAutoPlayPromptStatus) {
  switch (status) {
    case DiscordAutoPlayPromptStatus.ACCEPTED:
      return 'accepted'
    case DiscordAutoPlayPromptStatus.DECLINED:
      return 'declined'
    case DiscordAutoPlayPromptStatus.EXPIRED:
      return 'expired'
    case DiscordAutoPlayPromptStatus.FAILED:
      return 'failed'
    case DiscordAutoPlayPromptStatus.SKIPPED:
      return 'skipped'
    default:
      return 'sent'
  }
}

function toClientNotifyScope(scope: PlayIntentScope | null) {
  if (!scope) {
    return null
  }

  switch (scope) {
    case PlayIntentScope.FRIENDS_ONLY:
      return 'friends-only'
    case PlayIntentScope.SPECIFIC_DISCORD_SERVER:
      return 'specific-discord-server'
    case PlayIntentScope.SPECIFIC_FRIENDS:
      return 'specific-friends'
    default:
      return 'network'
  }
}

function toClientSelectionMode(selectionMode: PlayIntentSelectionMode) {
  return selectionMode === PlayIntentSelectionMode.ENTIRE_LIBRARY ? 'library' : 'subset'
}

function toNotificationTypeLabel(notificationType: NotificationType) {
  switch (notificationType) {
    case NotificationType.FRIEND_PLAYING:
      return 'Friend playing notification'
    case NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN:
      return 'Scheduled check-in'
    case NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED:
      return 'Go-time confirmed'
    case NotificationType.SCHEDULED_PLAY_INTENT_REMINDER:
      return 'Go-time reminder'
    case NotificationType.MUTUAL_FRIEND:
      return 'Mutual friend notification'
    default:
      return 'System notification'
  }
}

function getInterestedCountBeforeNotification(
  notifications: Array<{
    userId: string;
    type: NotificationType;
    createdAt: Date;
    responseChoice: NotificationResponseChoice | null;
  }>,
  cutoff: Date
) {
  const latestByUserId = new Map<string, NotificationResponseChoice | null>()

  const sortedNotifications = notifications
    .filter((notification) =>
      (
        notification.type === NotificationType.FRIEND_PLAYING
        || notification.type === NotificationType.SCHEDULED_PLAY_INTENT_REMINDER
        || notification.type === NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED
      )
      && notification.createdAt.getTime() < cutoff.getTime()
    )
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())

  for (const notification of sortedNotifications) {
    if (!latestByUserId.has(notification.userId)) {
      latestByUserId.set(notification.userId, notification.responseChoice)
    }
  }

  let interestedCount = 0

  for (const responseChoice of latestByUserId.values()) {
    if (responseChoice === NotificationResponseChoice.JOIN) {
      interestedCount += 1
    }
  }

  return interestedCount
}

function toDebugDmDeliveryState(deliveredAt: Date | null, emulated = false) {
  if (emulated) {
    return 'emulated' as const
  }

  return deliveredAt ? 'dm-delivered' as const : 'stored-only' as const
}

function getLatestActivityAt(values: Array<Date | null | undefined>) {
  const timestamps = values
    .filter((value): value is Date => value instanceof Date)
    .map((value) => value.getTime())

  if (timestamps.length === 0) {
    return null
  }

  return new Date(Math.max(...timestamps)).toISOString()
}

function toInboxMessageKind(notificationType: NotificationType) {
  switch (notificationType) {
    case NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN:
      return 'scheduled-check-in' as const
    case NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED:
      return 'go-time-confirmed' as const
    case NotificationType.SCHEDULED_PLAY_INTENT_REMINDER:
      return 'go-time-reminder' as const
    default:
      return 'call-to-play' as const
  }
}

function toInboxMessageLabel(notificationType: NotificationType) {
  switch (notificationType) {
    case NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN:
      return 'Scheduled check-in'
    case NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED:
      return 'Go-time confirmed'
    case NotificationType.SCHEDULED_PLAY_INTENT_REMINDER:
      return 'Go-time reminder'
    case NotificationType.SYSTEM:
      return 'System notice'
    default:
      return 'Call to play'
  }
}

export async function buildDebugAdminSnapshot() {
  const now = new Date()
  const [recentAutoPlayPrompts, recentInviteAttributions, recentNotifications, recentPlayIntents] = await Promise.all([
    prisma.discordAutoPlayPrompt.findMany({
      orderBy: {
        createdAt: 'desc'
      },
      take: 25,
      include: {
        user: {
          select: {
            id: true,
            handle: true,
            displayName: true,
            discordAutoPromptPlayIntent: true
          }
        },
        game: {
          select: {
            id: true,
            title: true
          }
        },
        sourceServer: {
          select: {
            name: true
          }
        },
        createdPlayIntent: {
          select: {
            notifications: {
              where: {
                type: NotificationType.FRIEND_PLAYING,
                deliveredAt: {
                  not: null
                }
              },
              select: {
                id: true
              }
            }
          }
        },
        observation: {
          select: {
            startedAt: true
          }
        }
      }
    }),
    prisma.discordInviteAttribution.findMany({
      orderBy: {
        acceptedAt: 'desc'
      },
      take: 50,
      include: {
        acceptedUser: {
          select: {
            id: true,
            handle: true,
            displayName: true
          }
        },
        inviterUser: {
          select: {
            id: true,
            handle: true,
            displayName: true
          }
        }
      }
    }),
    prisma.notification.findMany({
      orderBy: {
        createdAt: 'desc'
      },
      take: 25,
      select: {
        id: true,
        createdAt: true,
        deliveredAt: true,
        responseChoice: true,
        type: true,
        playIntentId: true,
        title: true,
        body: true,
        triggeredByUserId: true,
        game: {
          select: {
            title: true
          }
        },
        user: {
          select: {
            id: true,
            handle: true,
            displayName: true,
            timezoneId: true
          }
        }
      }
    }),
    prisma.playIntent.findMany({
      orderBy: {
        createdAt: 'desc'
      },
      take: 250,
      include: {
        user: {
          select: {
            id: true,
            handle: true,
            displayName: true,
            timezoneId: true
          }
        },
        targetDiscordServers: {
          include: {
            server: {
              select: {
                id: true,
                name: true
              }
            }
          },
          orderBy: {
            createdAt: 'asc'
          }
        },
        games: {
          select: {
            game: {
              select: {
                id: true,
                title: true
              }
            }
          }
        },
        platforms: {
          select: {
            platformLabel: true
          }
        },
        targetFriends: {
          select: {
            friendUser: {
              select: {
                id: true,
                handle: true,
                displayName: true,
                timezoneId: true,
                identities: {
                  where: {
                    provider: AuthProvider.DISCORD
                  },
                  select: {
                    providerUserId: true
                  }
                }
              }
            }
          }
        },
        notifications: {
          select: {
            id: true,
            userId: true,
            createdAt: true,
            deliveredAt: true,
            respondedAt: true,
            responseChoice: true,
            recipientResponseDiscordDmChannelId: true,
            recipientResponseDiscordDmMessageId: true,
            type: true,
            title: true,
            body: true,
            triggeredByUserId: true,
            game: {
              select: {
                title: true
              }
            },
            user: {
              select: {
                id: true,
                handle: true,
                displayName: true,
                timezoneId: true
              }
            }
          }
        },
        discordSpace: {
          select: {
            serverId: true,
            status: true,
            textChannelId: true,
            textChannelName: true,
            voiceChannelId: true,
            voiceChannelName: true,
            inviteUrl: true,
            deleteAfter: true
          }
        }
      }
    })
  ])

  const playIntentIds = recentPlayIntents.map((intent) => intent.id)
  const librarySelectionCreatorUserIds = [...new Set(
    recentPlayIntents
      .filter((intent) => intent.selectionMode === PlayIntentSelectionMode.ENTIRE_LIBRARY)
      .map((intent) => intent.user.id)
  )]
  const previewPlayIntentIds = [...new Set([
    ...recentNotifications.map((notification) => notification.playIntentId),
    ...recentAutoPlayPrompts.map((prompt) => prompt.createdPlayIntentId)
  ].filter((playIntentId): playIntentId is string => Boolean(playIntentId)))]
  const playIntentAutoPrompts = playIntentIds.length > 0
    ? await prisma.discordAutoPlayPrompt.findMany({
        where: {
          createdPlayIntentId: {
            in: playIntentIds
          }
        },
        include: {
          user: {
            select: {
              displayName: true
            }
          },
          game: {
            select: {
              title: true
            }
          }
        },
        orderBy: {
          createdAt: 'asc'
        }
      })
    : []
  const previewPlayIntents = previewPlayIntentIds.length > 0
    ? await prisma.playIntent.findMany({
        where: {
          id: {
            in: previewPlayIntentIds
          }
        },
        select: {
          id: true,
          userId: true,
          expiresAt: true,
          voiceChannelId: true,
          voiceChannelName: true,
          user: {
            select: {
              displayName: true,
              identities: {
                where: {
                  provider: AuthProvider.DISCORD
                },
                select: {
                  providerUserId: true
                }
              }
            }
          },
          notifications: {
            select: {
              userId: true,
              type: true,
              createdAt: true,
              responseChoice: true
            }
          }
        }
      })
    : []
  const creatorUserIdsWithVoiceChannels = [...new Set(
    previewPlayIntents
      .filter((intent) => Boolean(intent.voiceChannelId))
      .map((intent) => intent.userId)
  )]
  const notificationRecipientUserIds = [...new Set(recentNotifications.map((notification) => notification.user.id))]
  const [creatorServerMemberships, recipientServerMemberships] = await Promise.all([
    creatorUserIdsWithVoiceChannels.length > 0
      ? prisma.discordServerMembership.findMany({
          where: {
            userId: {
              in: creatorUserIdsWithVoiceChannels
            }
          },
          select: {
            userId: true,
            serverId: true
          }
        })
      : Promise.resolve([] as Array<{ userId: string; serverId: string }>),
    notificationRecipientUserIds.length > 0
      ? prisma.discordServerMembership.findMany({
          where: {
            userId: {
              in: notificationRecipientUserIds
            }
          },
          select: {
            userId: true,
            serverId: true
          }
        })
      : Promise.resolve([] as Array<{ userId: string; serverId: string }>)
  ])
  const creatorLibraryEntries = librarySelectionCreatorUserIds.length > 0
    ? await prisma.userGameInterest.findMany({
        where: {
          userId: {
            in: librarySelectionCreatorUserIds
          },
          intentType: {
            not: 'COMPLETED'
          }
        },
        select: {
          userId: true,
          gameId: true
        }
      })
    : []
  const creatorLibraryGameIdsByUserId = new Map<string, string[]>()
  for (const entry of creatorLibraryEntries) {
    const existing = creatorLibraryGameIdsByUserId.get(entry.userId) ?? []
    existing.push(entry.gameId)
    creatorLibraryGameIdsByUserId.set(entry.userId, existing)
  }
  const triggeredByUserIds = [...new Set([
    ...recentNotifications.map((notification) => notification.triggeredByUserId),
    ...recentPlayIntents.flatMap((intent) => intent.notifications.map((notification) => notification.triggeredByUserId))
  ].filter((userId): userId is string => Boolean(userId)))]
  const triggeredByUsers = triggeredByUserIds.length > 0
    ? await prisma.user.findMany({
        where: {
          id: {
            in: triggeredByUserIds
          }
        },
        select: {
          id: true,
          handle: true,
          displayName: true,
          identities: {
            where: {
              provider: AuthProvider.DISCORD
            },
            select: {
              providerUserId: true
            }
          }
        }
      })
    : []
  const triggeredByUserMap = new Map(triggeredByUsers.map((user) => [user.id, user]))
  const previewPlayIntentMap = new Map(previewPlayIntents.map((intent) => [intent.id, intent]))
  const recentNotificationDiscordSpaceRecipientContextsByPlayIntentId = new Map(
    await Promise.all(
      previewPlayIntents.map(async (intent) => {
        const recentNotificationRecipientUserIds = recentNotifications
          .filter((notification) => notification.playIntentId === intent.id)
          .map((notification) => notification.user.id)

        return [
          intent.id,
          await getPlayIntentDiscordSpaceRecipientContexts(intent.id, recentNotificationRecipientUserIds)
        ] as const
      })
    )
  )
  const autoPromptIdsByPlayIntentId = new Map<string, string[]>()
  const creatorServerIdsByUserId = new Map<string, Set<string>>()
  const recipientServerIdsByUserId = new Map<string, Set<string>>()

  for (const membership of creatorServerMemberships) {
    const existingServerIds = creatorServerIdsByUserId.get(membership.userId) ?? new Set<string>()
    existingServerIds.add(membership.serverId)
    creatorServerIdsByUserId.set(membership.userId, existingServerIds)
  }

  for (const membership of recipientServerMemberships) {
    const existingServerIds = recipientServerIdsByUserId.get(membership.userId) ?? new Set<string>()
    existingServerIds.add(membership.serverId)
    recipientServerIdsByUserId.set(membership.userId, existingServerIds)
  }

  for (const prompt of playIntentAutoPrompts) {
    if (!prompt.createdPlayIntentId) {
      continue
    }

    const existingPromptIds = autoPromptIdsByPlayIntentId.get(prompt.createdPlayIntentId) ?? []
    existingPromptIds.push(prompt.id)
    autoPromptIdsByPlayIntentId.set(prompt.createdPlayIntentId, existingPromptIds)
  }

  const lifecycleEvents = recentPlayIntents.flatMap((intent) => {
    const events: Array<{
      id: string;
      playIntentId: string;
      occurredAt: string;
      source: 'play-intent' | 'notification' | 'auto-play-prompt' | 'system';
      eventType: string;
      summary: string;
      details: string | null;
      isError: boolean;
      notificationId: string | null;
      promptId: string | null;
      actorDisplayName: string | null;
      recipientDisplayName: string | null;
    }> = []

    events.push({
      id: `play-intent:${intent.id}:created`,
      playIntentId: intent.id,
      occurredAt: intent.createdAt.toISOString(),
      source: 'play-intent',
      eventType: 'created',
      summary: 'Call to play created',
      details: `${intent.user.displayName} created this call to play.`,
      isError: false,
      notificationId: null,
      promptId: null,
      actorDisplayName: intent.user.displayName,
      recipientDisplayName: null
    })

    if (intent.windowStartsAt.getTime() > intent.createdAt.getTime() + 60 * 1000) {
      events.push({
        id: `play-intent:${intent.id}:window-start`,
        playIntentId: intent.id,
        occurredAt: intent.windowStartsAt.toISOString(),
        source: 'play-intent',
        eventType: 'scheduled-start',
        summary: 'Scheduled start time reached',
        details: `The scheduled session window opened for ${intent.user.displayName}.`,
        isError: false,
        notificationId: null,
        promptId: null,
        actorDisplayName: intent.user.displayName,
        recipientDisplayName: null
      })
    }

    const intentPrompts = playIntentAutoPrompts.filter((prompt) => prompt.createdPlayIntentId === intent.id)
    for (const prompt of intentPrompts) {
      events.push({
        id: `auto-play-prompt:${prompt.id}:created`,
        playIntentId: intent.id,
        occurredAt: prompt.createdAt.toISOString(),
        source: 'auto-play-prompt',
        eventType: 'prompt-created',
        summary: 'Auto-play prompt recorded',
        details: `${prompt.user.displayName} · ${prompt.game.title} · status ${toClientPromptStatus(prompt.status)}.`,
        isError: prompt.status === DiscordAutoPlayPromptStatus.FAILED || Boolean(prompt.dmError),
        notificationId: null,
        promptId: prompt.id,
        actorDisplayName: prompt.user.displayName,
        recipientDisplayName: null
      })

      if (prompt.deliveredAt) {
        events.push({
          id: `auto-play-prompt:${prompt.id}:delivered`,
          playIntentId: intent.id,
          occurredAt: prompt.deliveredAt.toISOString(),
          source: 'auto-play-prompt',
          eventType: 'prompt-delivered',
          summary: 'Auto-play prompt DM delivered',
          details: null,
          isError: false,
          notificationId: null,
          promptId: prompt.id,
          actorDisplayName: prompt.user.displayName,
          recipientDisplayName: prompt.user.displayName
        })
      }

      if (prompt.respondedAt) {
        events.push({
          id: `auto-play-prompt:${prompt.id}:responded`,
          playIntentId: intent.id,
          occurredAt: prompt.respondedAt.toISOString(),
          source: 'auto-play-prompt',
          eventType: 'prompt-responded',
          summary: `Auto-play prompt ${toClientPromptStatus(prompt.status)}`,
          details: prompt.statusDetail,
          isError: prompt.status === DiscordAutoPlayPromptStatus.FAILED || Boolean(prompt.dmError),
          notificationId: null,
          promptId: prompt.id,
          actorDisplayName: prompt.user.displayName,
          recipientDisplayName: prompt.user.displayName
        })
      }
    }

    for (const notification of intent.notifications) {
      events.push({
        id: `notification:${notification.id}:created`,
        playIntentId: intent.id,
        occurredAt: notification.createdAt.toISOString(),
        source: 'notification',
        eventType: 'notification-created',
        summary: `${toNotificationTypeLabel(notification.type)} created`,
        details: notification.title,
        isError: false,
        notificationId: notification.id,
        promptId: null,
        actorDisplayName: notification.triggeredByUserId ? (triggeredByUserMap.get(notification.triggeredByUserId)?.displayName ?? null) : null,
        recipientDisplayName: notification.user.displayName
      })

      if (notification.deliveredAt) {
        events.push({
          id: `notification:${notification.id}:delivered`,
          playIntentId: intent.id,
          occurredAt: notification.deliveredAt.toISOString(),
          source: 'notification',
          eventType: 'notification-delivered',
          summary: 'Notification DM delivered',
          details: notification.body,
          isError: false,
          notificationId: notification.id,
          promptId: null,
          actorDisplayName: null,
          recipientDisplayName: notification.user.displayName
        })
      }

      if (notification.respondedAt) {
        const responseLabel = notification.responseChoice ? notification.responseChoice.toLowerCase() : 'handled'
        events.push({
          id: `notification:${notification.id}:responded`,
          playIntentId: intent.id,
          occurredAt: notification.respondedAt.toISOString(),
          source: 'notification',
          eventType: 'notification-responded',
          summary: `Notification response recorded: ${responseLabel}`,
          details: null,
          isError: false,
          notificationId: notification.id,
          promptId: null,
          actorDisplayName: notification.user.displayName,
          recipientDisplayName: notification.user.displayName
        })
      }
    }

    if (intent.expiresAt.getTime() <= now.getTime()) {
      events.push({
        id: `play-intent:${intent.id}:ended`,
        playIntentId: intent.id,
        occurredAt: intent.expiresAt.toISOString(),
        source: 'play-intent',
        eventType: 'ended',
        summary: 'Call to play ended',
        details: `${intent.user.displayName}'s call to play ended.`,
        isError: false,
        notificationId: null,
        promptId: null,
        actorDisplayName: intent.user.displayName,
        recipientDisplayName: null
      })
    }

    events.sort((left, right) => new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime())
    return events
  })

  const recentErrors = [
    ...(getDiscordPresenceBotState().lastError
      ? [{
          id: 'bot:last-error',
          occurredAt: new Date().toISOString(),
          source: 'system' as const,
          message: 'Discord bot reported an error',
          detail: getDiscordPresenceBotState().lastError,
          playIntentId: null,
          notificationId: null,
          promptId: null
        }]
      : []),
    ...recentAutoPlayPrompts
      .filter((prompt) => prompt.dmError || prompt.status === DiscordAutoPlayPromptStatus.FAILED)
      .map((prompt) => ({
        id: `auto-play-prompt:error:${prompt.id}`,
        occurredAt: (prompt.respondedAt ?? prompt.deliveredAt ?? prompt.createdAt).toISOString(),
        source: 'auto-play-prompt' as const,
        message: prompt.dmError ? 'Auto-play prompt DM error' : 'Auto-play prompt failed',
        detail: prompt.dmError ?? prompt.statusDetail ?? null,
        playIntentId: prompt.createdPlayIntentId ?? null,
        notificationId: null,
        promptId: prompt.id
      }))
  ]

  const recentPlayIntentRows = await Promise.all(recentPlayIntents.map(async (intent) => {
    const notificationCount = intent.notifications.length
    const deliveredNotificationCount = intent.notifications.filter((notification) => Boolean(notification.deliveredAt)).length
    const respondedNotificationCount = intent.notifications.filter((notification) => Boolean(notification.respondedAt)).length
    const errorCount = recentErrors.filter((errorEntry) => errorEntry.playIntentId === intent.id).length
    const creatorSummaryRevisions = buildCreatorSummaryRevisions({
      ...intent,
      discordSpace: intent.discordSpace
        ? {
            status: intent.discordSpace.status,
            textChannelName: intent.discordSpace.textChannelName,
            textChannelUrl: buildDiscordChannelUrl(intent.discordSpace.serverId, intent.discordSpace.textChannelId),
            voiceChannelName: intent.discordSpace.voiceChannelName,
            voiceChannelUrl: buildDiscordChannelUrl(intent.discordSpace.serverId, intent.discordSpace.voiceChannelId),
            inviteUrl: intent.discordSpace.inviteUrl,
            deleteAfter: intent.discordSpace.deleteAfter
          }
        : null,
      user: {
        displayName: intent.user.displayName,
        timezoneId: intent.user.timezoneId
      },
      notifications: intent.notifications.map((notification) => ({
        userId: notification.userId,
        type: notification.type,
        respondedAt: notification.respondedAt,
        responseChoice: notification.responseChoice,
        deliveredAt: notification.deliveredAt,
        createdAt: notification.createdAt
      }))
    }, now)
    const creatorPreview = getLatestRevisionPreview(creatorSummaryRevisions)
    const previewIntent = previewPlayIntentMap.get(intent.id)
    const creatorDiscordUserId = previewIntent?.user.identities[0]?.providerUserId ?? null
    const creatorServerIds = creatorServerIdsByUserId.get(intent.user.id)
    const creatorMessages: Array<{
      id: string;
      kind: 'creator-summary' | 'scheduled-check-in' | 'call-to-play';
      label: string;
      sentAt: string;
      deliveryState: 'emulated' | 'stored-only' | 'dm-delivered';
      preview: ReturnType<typeof buildDebugDmPreview>;
      revisions: ReturnType<typeof finalizeDmRevisions>;
    }> = [
      {
        id: `creator-summary:${intent.id}`,
        kind: 'creator-summary' as const,
        label: 'CTP summary',
        sentAt: creatorSummaryRevisions[0]?.occurredAt ?? intent.createdAt.toISOString(),
        deliveryState: toDebugDmDeliveryState(null, true),
        preview: creatorPreview ?? buildDebugDmPreview('', [] as never, []),
        revisions: creatorSummaryRevisions
      }
    ]

    const latestCheckInNotification = intent.notifications
      .filter((notification) => notification.type === NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0]

    if (latestCheckInNotification) {
      const revisions = buildNotificationMessageRevisions({
        messageId: `notification:${latestCheckInNotification.id}`,
        notification: latestCheckInNotification,
        creatorUserId: intent.user.id,
        creatorDiscordUserId,
        creatorDisplayName: intent.user.displayName,
        gameTitle: null,
        voiceChannel: null
      })

      creatorMessages.push({
        id: `notification:${latestCheckInNotification.id}`,
        kind: 'scheduled-check-in',
        label: 'Scheduled check-in',
        sentAt: latestCheckInNotification.createdAt.toISOString(),
        deliveryState: toDebugDmDeliveryState(latestCheckInNotification.deliveredAt, areDiscordDirectMessagesEmulated()),
        preview: getLatestRevisionPreview(revisions),
        revisions
      })

      if (latestCheckInNotification.respondedAt && latestCheckInNotification.responseChoice) {
        const followUpPreview = buildNotificationFollowUpPreview({
          notificationId: latestCheckInNotification.id,
          notificationType: latestCheckInNotification.type,
          responseChoice: latestCheckInNotification.responseChoice,
          title: latestCheckInNotification.title,
          body: latestCheckInNotification.body,
          creatorUserId: intent.user.id,
          creatorDiscordUserId,
          creatorDisplayName: intent.user.displayName,
          gameTitle: latestCheckInNotification.game?.title ?? null,
          voiceChannel: null
        })

        creatorMessages.push({
          id: `notification:${latestCheckInNotification.id}:follow-up`,
          kind: 'scheduled-check-in',
          label: latestCheckInNotification.responseChoice === NotificationResponseChoice.CONFIRMED
            ? 'Confirmed response'
            : latestCheckInNotification.responseChoice === NotificationResponseChoice.CANCELED
              ? 'Ended response'
              : 'Expired check-in',
          sentAt: latestCheckInNotification.respondedAt.toISOString(),
          deliveryState: toDebugDmDeliveryState(latestCheckInNotification.deliveredAt, areDiscordDirectMessagesEmulated()),
          preview: buildDebugDmPreview(followUpPreview.content, followUpPreview.components, followUpPreview.embeds),
          revisions: [{
            id: `notification:${latestCheckInNotification.id}:follow-up:revision:1`,
            label: 'Latest state',
            occurredAt: latestCheckInNotification.respondedAt.toISOString(),
            preview: buildDebugDmPreview(followUpPreview.content, followUpPreview.components, followUpPreview.embeds)
          }]
        })
      }
    }

    const creatorSystemNotifications = intent.notifications
      .filter((notification) => notification.userId === intent.user.id && notification.type === NotificationType.SYSTEM)
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())

    for (const notification of creatorSystemNotifications) {
      const revisions = buildNotificationMessageRevisions({
        messageId: `notification:${notification.id}`,
        notification,
        creatorUserId: intent.user.id,
        creatorDiscordUserId,
        creatorDisplayName: intent.user.displayName,
        gameTitle: notification.game?.title ?? null,
        voiceChannel: null,
        actorDisplayName: notification.triggeredByUserId ? (triggeredByUserMap.get(notification.triggeredByUserId)?.displayName ?? null) : null,
        actorDiscordUserId: notification.triggeredByUserId ? (triggeredByUserMap.get(notification.triggeredByUserId)?.identities[0]?.providerUserId ?? null) : null
      })

      creatorMessages.push({
        id: `notification:${notification.id}`,
        kind: 'call-to-play',
        label: notification.title,
        sentAt: notification.createdAt.toISOString(),
        deliveryState: toDebugDmDeliveryState(notification.deliveredAt, areDiscordDirectMessagesEmulated()),
        preview: getLatestRevisionPreview(revisions),
        revisions
      })
    }

    const audienceNotificationsByUserId = new Map<string, typeof intent.notifications>()

    for (const notification of intent.notifications) {
      if (
        notification.type !== NotificationType.FRIEND_PLAYING
        && notification.type !== NotificationType.SCHEDULED_PLAY_INTENT_REMINDER
        && notification.type !== NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED
        && notification.type !== NotificationType.SYSTEM
      ) {
        continue
      }

      if (notification.userId === intent.user.id && notification.type === NotificationType.SYSTEM) {
        continue
      }

      const existingNotifications = audienceNotificationsByUserId.get(notification.userId) ?? []
      existingNotifications.push(notification)
      audienceNotificationsByUserId.set(notification.userId, existingNotifications)
    }

    const overlappingGameIds = intent.selectionMode === PlayIntentSelectionMode.ENTIRE_LIBRARY
      ? creatorLibraryGameIdsByUserId.get(intent.user.id) ?? []
      : intent.games.map((entry) => entry.game.id)
    const includeSelf = intent.notifications.some((notification) => (
      notification.userId === intent.user.id
      && (
        notification.type === NotificationType.FRIEND_PLAYING
        || notification.type === NotificationType.SCHEDULED_PLAY_INTENT_REMINDER
        || notification.type === NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED
      )
    ))
    const expectedAudienceScope = toClientNotifyScope(intent.scope) ?? 'friends-only'
    const expectedAudienceUserIds = await getPlayIntentRecipientUserIdsForDebug({
      userId: intent.user.id,
      scope: expectedAudienceScope,
      overlappingGameIds,
      targetUserIds: intent.targetFriends.map((entry) => entry.friendUser.id),
      includeSelf,
      targetDiscordServerIds: intent.targetDiscordServers.map((entry) => entry.server.id)
    })
    const intentDiscordSpaceRecipientContexts = intent.discordSpace
      ? await getPlayIntentDiscordSpaceRecipientContexts(intent.id, expectedAudienceUserIds)
      : new Map()

    const audienceParticipants = [...audienceNotificationsByUserId.entries()].map(([recipientUserId, notifications]) => {
      const recipient = notifications[0]?.user
      const recipientServerIds = recipientServerIdsByUserId.get(recipientUserId)
      const recipientSharesServer = creatorServerIds != null && recipientServerIds != null
        ? [...creatorServerIds].some((serverId) => recipientServerIds.has(serverId))
        : false
      const messages = notifications
        .flatMap((notification) => {
          const revisions = buildNotificationMessageRevisions({
            messageId: `notification:${notification.id}`,
            notification,
            creatorUserId: intent.user.id,
            creatorDiscordUserId,
            creatorDisplayName: intent.user.displayName,
            gameTitle: notification.game?.title ?? null,
            voiceChannel: previewIntent && (previewIntent.voiceChannelId || previewIntent.voiceChannelName)
              ? {
                  channelId: previewIntent.voiceChannelId,
                  channelName: previewIntent.voiceChannelName,
                  recipientSharesServer
                }
              : null,
            discordSpace: intentDiscordSpaceRecipientContexts.get(recipientUserId) ?? null,
            interestedCount: (
              notification.type === NotificationType.SCHEDULED_PLAY_INTENT_REMINDER
              || notification.type === NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED
            )
              ? getInterestedCountBeforeNotification(
                  intent.notifications.map((entry) => ({
                    userId: entry.userId,
                    type: entry.type,
                    createdAt: entry.createdAt,
                    responseChoice: entry.responseChoice
                  })),
                  notification.createdAt
                )
              : undefined
          })

          const promptMessage = {
            id: `notification:${notification.id}`,
            kind: toInboxMessageKind(notification.type),
            label: toInboxMessageLabel(notification.type),
            sentAt: notification.createdAt.toISOString(),
            deliveryState: toDebugDmDeliveryState(notification.deliveredAt, areDiscordDirectMessagesEmulated()),
            preview: revisions[revisions.length - 1]?.preview,
            revisions
          }

          if (!notification.respondedAt || !notification.responseChoice) {
            return [promptMessage]
          }

          const followUpPreview = buildNotificationFollowUpPreview({
            notificationId: notification.id,
            notificationType: notification.type,
            responseChoice: notification.responseChoice,
            title: notification.title,
            body: notification.body,
            creatorUserId: intent.user.id,
            creatorDiscordUserId,
            creatorDisplayName: intent.user.displayName,
            gameTitle: notification.game?.title ?? null,
            voiceChannel: previewIntent && (previewIntent.voiceChannelId || previewIntent.voiceChannelName)
              ? {
                  channelId: previewIntent.voiceChannelId,
                  channelName: previewIntent.voiceChannelName,
                  recipientSharesServer
                }
              : null,
            discordSpace: intentDiscordSpaceRecipientContexts.get(recipientUserId) ?? null,
            interestedCount: undefined
          })
          const followUpMessage = {
            id: `notification:${notification.id}:follow-up`,
            kind: 'call-to-play' as const,
            label: notification.responseChoice === NotificationResponseChoice.JOIN ? 'Interested confirmation' : 'Declined',
            sentAt: notification.respondedAt.toISOString(),
            deliveryState: toDebugDmDeliveryState(
              notification.recipientResponseDiscordDmChannelId && notification.recipientResponseDiscordDmMessageId
                ? notification.respondedAt
                : null,
              areDiscordDirectMessagesEmulated()
            ),
            preview: buildDebugDmPreview(followUpPreview.content, followUpPreview.components, followUpPreview.embeds),
            revisions: [{
              id: `notification:${notification.id}:follow-up:revision:1`,
              label: 'Latest state',
              occurredAt: notification.respondedAt.toISOString(),
              preview: buildDebugDmPreview(followUpPreview.content, followUpPreview.components, followUpPreview.embeds)
            }]
          }

          return [promptMessage, followUpMessage]
        })
        .sort((left, right) => new Date(right.sentAt).getTime() - new Date(left.sentAt).getTime())

      return recipient
        ? {
            user: {
              id: recipient.id,
              handle: recipient.handle,
              displayName: recipient.displayName,
              timezoneId: recipient.timezoneId
            },
            role: 'audience' as const,
            lastActivityAt: getLatestMessageActivityAt(messages),
            messages
          }
        : null
    }).filter((participant): participant is NonNullable<typeof participant> => participant != null)

    const existingAudienceUserIdSet = new Set(audienceParticipants.map((participant) => participant.user.id))
    const missingAudienceUserIds = expectedAudienceUserIds.filter((recipientUserId) => !existingAudienceUserIdSet.has(recipientUserId))
    const missingAudienceUsers = missingAudienceUserIds.length > 0
      ? await prisma.user.findMany({
          where: {
            id: {
              in: missingAudienceUserIds
            }
          },
          select: {
            id: true,
            handle: true,
            displayName: true,
            timezoneId: true
          }
        })
      : []
    const syntheticAudienceParticipants = missingAudienceUsers.map((recipient) => {
      const notificationCopy = buildPlayIntentNotificationCopy(
        intent.user.displayName,
        toClientSelectionMode(intent.selectionMode),
        intent.games.map((entry) => entry.game.title),
        Math.max(1, Math.round((intent.windowEndsAt.getTime() - intent.windowStartsAt.getTime()) / 60000)),
        intent.windowStartsAt,
        now,
        recipient.timezoneId
      )
      const previewPayload = buildPlayIntentNotificationPromptPreview({
        notificationId: `synthetic-notification:${intent.id}:${recipient.id}`,
        playIntentId: intent.id,
        notificationType: NotificationType.FRIEND_PLAYING,
        title: notificationCopy.title,
        body: notificationCopy.body,
        creatorUserId: intent.user.id,
        creatorDiscordUserId,
        creatorDisplayName: intent.user.displayName,
        voiceChannel: previewIntent && (previewIntent.voiceChannelId || previewIntent.voiceChannelName)
          ? {
              channelId: previewIntent.voiceChannelId,
              channelName: previewIntent.voiceChannelName,
              recipientSharesServer: false
            }
          : null,
        discordSpace: intentDiscordSpaceRecipientContexts.get(recipient.id) ?? null
      })
      const syntheticPreview = buildDebugDmPreview(
        previewPayload.content,
        previewPayload.components,
        previewPayload.embeds
      )

      return {
        user: {
          id: recipient.id,
          handle: recipient.handle,
          displayName: recipient.displayName,
          timezoneId: recipient.timezoneId
        },
        role: 'audience' as const,
        lastActivityAt: intent.createdAt.toISOString(),
        messages: [{
          id: `synthetic-notification:${intent.id}:${recipient.id}`,
          kind: 'call-to-play' as const,
          label: 'Call to play',
          sentAt: intent.createdAt.toISOString(),
          deliveryState: 'emulated' as const,
          preview: syntheticPreview,
          revisions: [{
            id: `synthetic-notification:${intent.id}:${recipient.id}:revision:1`,
            label: 'Latest state',
            occurredAt: intent.createdAt.toISOString(),
            preview: syntheticPreview
          }]
        }]
      }
    })

    const dmInboxParticipants = [
      {
        user: {
          id: intent.user.id,
          handle: intent.user.handle,
          displayName: intent.user.displayName,
          timezoneId: intent.user.timezoneId
        },
        role: 'creator' as const,
        lastActivityAt: getLatestMessageActivityAt(creatorMessages),
        messages: creatorMessages.sort((left, right) => new Date(right.sentAt).getTime() - new Date(left.sentAt).getTime())
      },
      ...[...audienceParticipants, ...syntheticAudienceParticipants].sort((left, right) => left.user.displayName.localeCompare(right.user.displayName))
    ]

    return {
      id: intent.id,
      createdAt: intent.createdAt.toISOString(),
      windowStartsAt: intent.windowStartsAt.toISOString(),
      windowEndsAt: intent.windowEndsAt.toISOString(),
      expiresAt: intent.expiresAt.toISOString(),
      status: intent.expiresAt.getTime() > now.getTime() ? 'active' : 'ended',
      headline: intent.headline,
      note: intent.note,
      selectionMode: toClientSelectionMode(intent.selectionMode),
      notifyScope: toClientNotifyScope(intent.scope),
      gameTitles: intent.games.map((entry) => entry.game.title).sort((left, right) => left.localeCompare(right)),
      platformLabels: intent.platforms.map((entry) => entry.platformLabel).sort((left, right) => left.localeCompare(right)),
      targetedFriendCount: intent.targetFriends.length,
      notificationCount,
      deliveredNotificationCount,
      respondedNotificationCount,
      errorCount,
      creator: {
        id: intent.user.id,
        handle: intent.user.handle,
        displayName: intent.user.displayName,
        timezoneId: intent.user.timezoneId
      },
      creatorDmPreview: creatorPreview ?? null,
      dmInboxParticipants
    }
  }))

  const creatorSummaryPreviewByPlayIntentId = new Map(
    recentPlayIntentRows.flatMap((intent) => intent.creatorDmPreview ? [[intent.id, intent.creatorDmPreview]] : [])
  )

  const recentAutoPlayPromptRows = recentAutoPlayPrompts.map((prompt) => {
    const previewPayload = buildDiscordAutoPlayPromptPreview({
      promptId: prompt.id,
      status: prompt.status,
      gameTitle: prompt.game.title,
      durationMinutes: prompt.durationMinutes,
      notifyScope: prompt.notifyScope,
      friendRecipientCount: prompt.friendRecipientCount,
      networkRecipientCount: prompt.networkRecipientCount,
      statusDetail: prompt.statusDetail,
      deliveredCount: prompt.createdPlayIntent?.notifications.length ?? 0
    })
    const dmPreview = prompt.status === DiscordAutoPlayPromptStatus.ACCEPTED && prompt.createdPlayIntentId
      ? creatorSummaryPreviewByPlayIntentId.get(prompt.createdPlayIntentId)
        ?? (previewPayload ? buildDebugDmPreview(previewPayload.content, previewPayload.components, previewPayload.embeds) : null)
      : previewPayload
        ? buildDebugDmPreview(previewPayload.content, previewPayload.components, previewPayload.embeds)
        : null

    return {
      id: prompt.id,
      createdAt: prompt.createdAt.toISOString(),
      deliveredAt: prompt.deliveredAt?.toISOString() ?? null,
      respondedAt: prompt.respondedAt?.toISOString() ?? null,
      status: toClientPromptStatus(prompt.status),
      statusDetail: prompt.statusDetail,
      dmError: prompt.dmError,
      durationMinutes: prompt.durationMinutes,
      notifyScope: toClientNotifyScope(prompt.notifyScope ?? null),
      friendRecipientCount: prompt.friendRecipientCount,
      networkRecipientCount: prompt.networkRecipientCount,
      sourceServerName: prompt.sourceServer?.name ?? null,
      observationStartedAt: prompt.observation.startedAt?.toISOString() ?? null,
      createdPlayIntentId: prompt.createdPlayIntentId,
      user: prompt.user,
      game: prompt.game,
      dmPreview
    }
  })

  const recentNotificationRows = recentNotifications.map((notification) => {
    const playIntent = notification.playIntentId ? (previewPlayIntentMap.get(notification.playIntentId) ?? null) : null
    const discordSpaceRecipientContext = notification.playIntentId
      ? recentNotificationDiscordSpaceRecipientContextsByPlayIntentId.get(notification.playIntentId)?.get(notification.user.id) ?? null
      : null
    const creatorServerIds = playIntent ? creatorServerIdsByUserId.get(playIntent.userId) : null
    const recipientServerIds = recipientServerIdsByUserId.get(notification.user.id)
    const recipientSharesServer = creatorServerIds != null && recipientServerIds != null
      ? [...creatorServerIds].some((serverId) => recipientServerIds.has(serverId))
      : false
    const previewPayload = notification.type === NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN
      ? buildScheduledCheckInPromptPreview({
          notificationId: notification.id,
          creatorDiscordUserId: playIntent?.user.identities[0]?.providerUserId ?? null,
          creatorDisplayName: playIntent?.user.displayName ?? null,
          resolved: Boolean(notification.responseChoice)
        })
      : notification.type === NotificationType.FRIEND_PLAYING
        || notification.type === NotificationType.SCHEDULED_PLAY_INTENT_REMINDER
        || notification.type === NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED
        ? notification.responseChoice === NotificationResponseChoice.EXPIRED
          ? buildNotificationDirectMessagePreview({
              notificationId: notification.id,
              notificationType: notification.type,
              title: notification.title,
              body: notification.body,
              responseChoice: notification.responseChoice,
              creatorUserId: playIntent?.userId ?? notification.triggeredByUserId ?? null,
              creatorDiscordUserId: playIntent?.user.identities[0]?.providerUserId ?? null,
              creatorDisplayName: playIntent?.user.displayName ?? (notification.triggeredByUserId ? (triggeredByUserMap.get(notification.triggeredByUserId)?.displayName ?? null) : null),
              gameTitle: notification.game?.title ?? null,
              playIntentIsActive: false,
              voiceChannel: playIntent && (playIntent.voiceChannelId || playIntent.voiceChannelName)
                ? {
                    channelId: playIntent.voiceChannelId,
                    channelName: playIntent.voiceChannelName,
                    recipientSharesServer
                  }
                : null,
              discordSpace: discordSpaceRecipientContext,
              interestedCount: (
                notification.type === NotificationType.SCHEDULED_PLAY_INTENT_REMINDER
                || notification.type === NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED
              ) && playIntent
                ? getInterestedCountBeforeNotification(playIntent.notifications, notification.createdAt)
                : undefined
            })
          : buildPlayIntentNotificationPromptPreview({
            notificationId: notification.id,
            notificationType: notification.type,
            title: notification.title,
            body: notification.body,
            responseChoice: notification.responseChoice,
            creatorUserId: playIntent?.userId ?? notification.triggeredByUserId ?? null,
            creatorDiscordUserId: playIntent?.user.identities[0]?.providerUserId ?? null,
            creatorDisplayName: playIntent?.user.displayName ?? (notification.triggeredByUserId ? (triggeredByUserMap.get(notification.triggeredByUserId)?.displayName ?? null) : null),
            voiceChannel: playIntent && (playIntent.voiceChannelId || playIntent.voiceChannelName)
              ? {
                  channelId: playIntent.voiceChannelId,
                  channelName: playIntent.voiceChannelName,
                  recipientSharesServer
                }
              : null,
            discordSpace: discordSpaceRecipientContext,
            interestedCount: (
              notification.type === NotificationType.SCHEDULED_PLAY_INTENT_REMINDER
              || notification.type === NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED
            ) && playIntent
              ? getInterestedCountBeforeNotification(playIntent.notifications, notification.createdAt)
              : undefined
          })
        : buildNotificationDirectMessagePreview({
            notificationId: notification.id,
            notificationType: notification.type,
            title: notification.title,
            body: notification.body,
            responseChoice: notification.responseChoice,
            creatorUserId: playIntent?.userId ?? notification.triggeredByUserId ?? null,
            creatorDiscordUserId: playIntent?.user.identities[0]?.providerUserId ?? null,
            creatorDisplayName: playIntent?.user.displayName ?? (notification.triggeredByUserId ? (triggeredByUserMap.get(notification.triggeredByUserId)?.displayName ?? null) : null),
            gameTitle: notification.game?.title ?? null,
            playIntentIsActive: playIntent ? playIntent.expiresAt.getTime() > now.getTime() : undefined,
            voiceChannel: playIntent && (playIntent.voiceChannelId || playIntent.voiceChannelName)
              ? {
                  channelId: playIntent.voiceChannelId,
                  channelName: playIntent.voiceChannelName,
                  recipientSharesServer
                }
              : null,
            discordSpace: discordSpaceRecipientContext,
            actorDisplayName: notification.triggeredByUserId ? (triggeredByUserMap.get(notification.triggeredByUserId)?.displayName ?? null) : null,
            actorDiscordUserId: notification.triggeredByUserId ? (triggeredByUserMap.get(notification.triggeredByUserId)?.identities[0]?.providerUserId ?? null) : null
          })

    return {
      id: notification.id,
      createdAt: notification.createdAt.toISOString(),
      deliveredAt: notification.deliveredAt?.toISOString() ?? null,
      title: notification.title,
      body: notification.body,
      gameTitle: notification.game?.title ?? null,
      recipient: notification.user,
      triggeredBy: notification.triggeredByUserId ? (triggeredByUserMap.get(notification.triggeredByUserId) ?? null) : null,
      dmPreview: buildDebugDmPreview(previewPayload.content, previewPayload.components, previewPayload.embeds)
    }
  })

  const recentInviteAttributionRows = recentInviteAttributions.map((attribution) => ({
    id: attribution.id,
    acceptedAt: attribution.acceptedAt.toISOString(),
    kind: attribution.kind === 'DIRECT' ? 'direct' : 'server',
    serverId: attribution.serverId,
    serverName: attribution.serverName,
    memberCount: attribution.hintedMemberCount,
    acceptedUser: attribution.acceptedUser,
    inviterUser: attribution.inviterUser,
    inviterDiscordUserId: attribution.inviterDiscordUserId,
    inviterLabel: attribution.inviterLabel
  }))

  return debugAdminResponseSchema.parse({
    generatedAt: new Date().toISOString(),
    bot: getDiscordPresenceBotState(),
    dmTemplates: buildDebugDmTemplates(now),
    recentAutoPlayPrompts: recentAutoPlayPromptRows,
    recentInviteAttributions: recentInviteAttributionRows,
    recentNotifications: recentNotificationRows,
    recentPlayIntents: recentPlayIntentRows,
    playIntentLifecycleEvents: lifecycleEvents,
    recentErrors
  })
}