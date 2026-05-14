/**
 * System notification copy + component spec for play-intent lifecycle events.
 *
 * Defines the canonical body text and the set of interactive components for
 * each event kind (voice join, game launch, interest change, end-of-call,
 * archive cleanup) so the bot, the in-app DM simulator, and the debug
 * snapshot all render the same wording.
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
  discordBody: string;
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

const playIntentSystemNotificationDefinitions = [
  callToPlayEndedSystemNotification,
  voiceChannelJoinedSystemNotification,
  groupLaunchedGameSystemNotification,
  creatorLaunchedGameSystemNotification,
  interestedPlayerLaunchedGameSystemNotification,
  creatorInterestUpdateSystemNotification,
  audienceInterestUpdateSystemNotification,
  creatorInterestWithdrawnSystemNotification
]

const playIntentSystemNotificationByTitle = new Map(
  playIntentSystemNotificationDefinitions.map((definition) => [definition.title, definition] as const)
)

function formatLaunchedGameBody(actorLabel: string, gameTitle: string, audienceContext: string) {
  return `${actorLabel} just launched ${gameTitle} for ${audienceContext}.`
}

function formatVoiceChannelBody(actorLabel: string, voiceChannelName: string | null | undefined) {
  const channelLabel = voiceChannelName ? `the voice channel ${voiceChannelName}` : 'the voice channel'

  return `${actorLabel} just joined ${channelLabel} for this call to play.`
}

function formatInterestBody(subjectLabel: string, gameTitle: string | null, activeVerb: string, fallbackTarget: string) {
  return gameTitle
    ? `${subjectLabel} ${activeVerb} ${gameTitle}.`
    : `${subjectLabel} ${fallbackTarget}.`
}

export function getPlayIntentSystemNotificationDefinitionByTitle(title: string) {
  return playIntentSystemNotificationByTitle.get(title) ?? null
}

export function formatCreatorLaunchedGameSystemNotification(options: {
  actorDisplayName: string;
  actorLabel?: string;
  gameTitle: string;
}): SystemNotificationCopy {
  return {
    title: creatorLaunchedGameSystemNotification.title,
    body: formatLaunchedGameBody(
      options.actorDisplayName,
      options.gameTitle,
      'the active call to play you are interested in'
    ),
    discordBody: formatLaunchedGameBody(
      options.actorLabel ?? options.actorDisplayName,
      options.gameTitle,
      'the active call to play you are interested in'
    )
  }
}

export function formatGroupLaunchedGameSystemNotification(options: {
  actorDisplayName: string;
  actorLabel?: string;
  gameTitle: string;
}): SystemNotificationCopy {
  return {
    title: groupLaunchedGameSystemNotification.title,
    body: formatLaunchedGameBody(
      options.actorDisplayName,
      options.gameTitle,
      'this call to play'
    ),
    discordBody: formatLaunchedGameBody(
      options.actorLabel ?? options.actorDisplayName,
      options.gameTitle,
      'this call to play'
    )
  }
}

export function formatVoiceChannelJoinedSystemNotification(options: {
  actorDisplayName: string;
  actorLabel?: string;
  voiceChannelName?: string | null;
}): SystemNotificationCopy {
  return {
    title: voiceChannelJoinedSystemNotification.title,
    body: formatVoiceChannelBody(options.actorDisplayName, options.voiceChannelName),
    discordBody: formatVoiceChannelBody(
      options.actorLabel ?? options.actorDisplayName,
      options.voiceChannelName
    )
  }
}

export function formatInterestedPlayerLaunchedGameSystemNotification(options: {
  actorDisplayName: string;
  actorLabel?: string;
  gameTitle: string;
}): SystemNotificationCopy {
  return {
    title: interestedPlayerLaunchedGameSystemNotification.title,
    body: formatLaunchedGameBody(
      options.actorDisplayName,
      options.gameTitle,
      'your active call to play'
    ),
    discordBody: formatLaunchedGameBody(
      options.actorLabel ?? options.actorDisplayName,
      options.gameTitle,
      'your active call to play'
    )
  }
}

export function formatCreatorInterestUpdateSystemNotification(options: {
  recipientDisplayName: string;
  recipientLabel?: string;
  gameTitle: string | null;
}): SystemNotificationCopy {
  return {
    title: creatorInterestUpdateSystemNotification.title,
    body: formatInterestBody(
      options.recipientDisplayName,
      options.gameTitle,
      'is interested in playing',
      'is interested in your call to play'
    ),
    discordBody: formatInterestBody(
      options.recipientLabel ?? options.recipientDisplayName,
      options.gameTitle,
      'is interested in playing',
      'is interested in your call to play'
    )
  }
}

export function formatAudienceInterestUpdateSystemNotification(options: {
  recipientDisplayName: string;
  recipientLabel?: string;
  gameTitle: string | null;
}): SystemNotificationCopy {
  return {
    title: audienceInterestUpdateSystemNotification.title,
    body: formatInterestBody(
      options.recipientDisplayName,
      options.gameTitle,
      'is interested in playing',
      'is interested in this call to play'
    ),
    discordBody: formatInterestBody(
      options.recipientLabel ?? options.recipientDisplayName,
      options.gameTitle,
      'is interested in playing',
      'is interested in this call to play'
    )
  }
}

export function formatCreatorInterestWithdrawnSystemNotification(options: {
  recipientDisplayName: string;
  recipientLabel?: string;
  gameTitle: string | null;
}): SystemNotificationCopy {
  return {
    title: creatorInterestWithdrawnSystemNotification.title,
    body: formatInterestBody(
      options.recipientDisplayName,
      options.gameTitle,
      'passed on',
      'passed on your call to play'
    ),
    discordBody: formatInterestBody(
      options.recipientLabel ?? options.recipientDisplayName,
      options.gameTitle,
      'passed on',
      'passed on your call to play'
    )
  }
}