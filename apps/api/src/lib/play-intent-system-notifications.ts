/**
 * System notification copy + component spec for play-intent lifecycle events.
 *
 * Defines the canonical body text and the set of interactive components for
 * each event kind (voice join, game launch, interest change, end-of-call,
 * archive cleanup) so the bot, the in-app DM simulator, and the debug
 * snapshot all render the same wording.
 *
 * Bodies are plain text (display names, never `<@id>` mentions): they land in
 * the per-recipient updates-log DM, and Android push notifications render
 * mention markup literally. Mentions belong on the original invite/summary.
 */

type PlayIntentSystemNotificationComponentMode = 'none' | 'link' | 'archived-cleanup'

type PlayIntentSystemNotificationDefinition = {
  key: string;
  title: string;
  componentMode: PlayIntentSystemNotificationComponentMode;
}

export type SystemNotificationCopy = {
  title: string;
  body: string;
}

function createPlayIntentSystemNotificationDefinition(
  key: PlayIntentSystemNotificationDefinition['key'],
  title: string,
  componentMode: PlayIntentSystemNotificationDefinition['componentMode']
) {
  return {
    key,
    title,
    componentMode
  } as const satisfies PlayIntentSystemNotificationDefinition
}

export const callToPlayEndedSystemNotification = createPlayIntentSystemNotificationDefinition(
  'call-to-play-ended',
  'Call to play ended',
  'archived-cleanup'
)

export const voiceChannelJoinedSystemNotification = createPlayIntentSystemNotificationDefinition(
  'voice-channel-joined',
  '🎙 Someone joined the voice channel',
  'none'
)

export const groupLaunchedGameSystemNotification = createPlayIntentSystemNotificationDefinition(
  'group-launched-game',
  '🎮 Someone launched the game',
  'none'
)

export const creatorLaunchedGameSystemNotification = createPlayIntentSystemNotificationDefinition(
  'creator-launched-game',
  'Creator launched the game',
  'none'
)

export const interestedPlayerLaunchedGameSystemNotification = createPlayIntentSystemNotificationDefinition(
  'interested-player-launched-game',
  'Interested player launched the game',
  'none'
)

export const creatorInterestUpdateSystemNotification = createPlayIntentSystemNotificationDefinition(
  'creator-interest-update',
  '✅ Someone is interested',
  'none'
)

export const audienceInterestUpdateSystemNotification = createPlayIntentSystemNotificationDefinition(
  'audience-interest-update',
  '✅ Another player is interested',
  'none'
)

export const creatorInterestWithdrawnSystemNotification = createPlayIntentSystemNotificationDefinition(
  'creator-interest-withdrawn',
  '❎ Someone passed',
  'none'
)

export const audienceInterestWithdrawnSystemNotification = createPlayIntentSystemNotificationDefinition(
  'audience-interest-withdrawn',
  '❎ Another player passed',
  'none'
)

export const creatorRunningLateSystemNotification = createPlayIntentSystemNotificationDefinition(
  'creator-running-late',
  '⏰ Someone is running late',
  'none'
)

export const audienceRunningLateSystemNotification = createPlayIntentSystemNotificationDefinition(
  'audience-running-late',
  '⏰ Another player is running late',
  'none'
)

const playIntentSystemNotificationDefinitions = [
  callToPlayEndedSystemNotification,
  voiceChannelJoinedSystemNotification,
  groupLaunchedGameSystemNotification,
  creatorLaunchedGameSystemNotification,
  interestedPlayerLaunchedGameSystemNotification,
  creatorInterestUpdateSystemNotification,
  audienceInterestUpdateSystemNotification,
  creatorInterestWithdrawnSystemNotification,
  audienceInterestWithdrawnSystemNotification,
  creatorRunningLateSystemNotification,
  audienceRunningLateSystemNotification
]

const playIntentSystemNotificationByTitle = new Map(
  playIntentSystemNotificationDefinitions.map((definition) => [definition.title, definition] as const)
)

function formatLaunchedGameBody(actorDisplayName: string, gameTitle: string, audienceContext: string) {
  return `${actorDisplayName} just launched ${gameTitle} for ${audienceContext}.`
}

function formatVoiceChannelBody(actorDisplayName: string, voiceChannelName: string | null | undefined) {
  const channelLabel = voiceChannelName ? `the voice channel ${voiceChannelName}` : 'the voice channel'

  return `${actorDisplayName} just joined ${channelLabel} for this call to play.`
}

function formatInterestBody(subjectDisplayName: string, gameTitle: string | null, activeVerb: string, fallbackTarget: string) {
  return gameTitle
    ? `${subjectDisplayName} ${activeVerb} ${gameTitle}.`
    : `${subjectDisplayName} ${fallbackTarget}.`
}

export function getPlayIntentSystemNotificationDefinitionByTitle(title: string) {
  return playIntentSystemNotificationByTitle.get(title) ?? null
}

export function formatCreatorLaunchedGameSystemNotification(options: {
  actorDisplayName: string;
  gameTitle: string;
}): SystemNotificationCopy {
  return {
    title: creatorLaunchedGameSystemNotification.title,
    body: formatLaunchedGameBody(
      options.actorDisplayName,
      options.gameTitle,
      'the active call to play you are interested in'
    )
  }
}

export function formatGroupLaunchedGameSystemNotification(options: {
  actorDisplayName: string;
  gameTitle: string;
}): SystemNotificationCopy {
  return {
    title: groupLaunchedGameSystemNotification.title,
    body: formatLaunchedGameBody(
      options.actorDisplayName,
      options.gameTitle,
      'this call to play'
    )
  }
}

export function formatVoiceChannelJoinedSystemNotification(options: {
  actorDisplayName: string;
  voiceChannelName?: string | null;
}): SystemNotificationCopy {
  return {
    title: voiceChannelJoinedSystemNotification.title,
    body: formatVoiceChannelBody(options.actorDisplayName, options.voiceChannelName)
  }
}

export function formatInterestedPlayerLaunchedGameSystemNotification(options: {
  actorDisplayName: string;
  gameTitle: string;
}): SystemNotificationCopy {
  return {
    title: interestedPlayerLaunchedGameSystemNotification.title,
    body: formatLaunchedGameBody(
      options.actorDisplayName,
      options.gameTitle,
      'your active call to play'
    )
  }
}

export function formatCreatorInterestUpdateSystemNotification(options: {
  recipientDisplayName: string;
  gameTitle: string | null;
}): SystemNotificationCopy {
  return {
    title: creatorInterestUpdateSystemNotification.title,
    body: formatInterestBody(
      options.recipientDisplayName,
      options.gameTitle,
      'is interested in playing',
      'is interested in your call to play'
    )
  }
}

export function formatAudienceInterestUpdateSystemNotification(options: {
  recipientDisplayName: string;
  gameTitle: string | null;
}): SystemNotificationCopy {
  return {
    title: audienceInterestUpdateSystemNotification.title,
    body: formatInterestBody(
      options.recipientDisplayName,
      options.gameTitle,
      'is interested in playing',
      'is interested in this call to play'
    )
  }
}

export function formatCreatorRunningLateSystemNotification(options: {
  recipientDisplayName: string;
  gameTitle: string | null;
}): SystemNotificationCopy {
  return {
    title: creatorRunningLateSystemNotification.title,
    body: formatInterestBody(
      options.recipientDisplayName,
      options.gameTitle,
      'is interested but running late for',
      'is interested but running late for your call to play'
    )
  }
}

export function formatAudienceRunningLateSystemNotification(options: {
  recipientDisplayName: string;
  gameTitle: string | null;
}): SystemNotificationCopy {
  return {
    title: audienceRunningLateSystemNotification.title,
    body: formatInterestBody(
      options.recipientDisplayName,
      options.gameTitle,
      'is interested but running late for',
      'is interested but running late for this call to play'
    )
  }
}

export function formatCreatorInterestWithdrawnSystemNotification(options: {
  recipientDisplayName: string;
  gameTitle: string | null;
}): SystemNotificationCopy {
  return {
    title: creatorInterestWithdrawnSystemNotification.title,
    body: formatInterestBody(
      options.recipientDisplayName,
      options.gameTitle,
      'passed on',
      'passed on your call to play'
    )
  }
}

export function formatAudienceInterestWithdrawnSystemNotification(options: {
  recipientDisplayName: string;
  gameTitle: string | null;
}): SystemNotificationCopy {
  return {
    title: audienceInterestWithdrawnSystemNotification.title,
    body: formatInterestBody(
      options.recipientDisplayName,
      options.gameTitle,
      'passed on',
      'passed on this call to play'
    )
  }
}
