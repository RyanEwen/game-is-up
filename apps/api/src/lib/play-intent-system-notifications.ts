type PlayIntentSystemNotificationComponentMode = 'none' | 'link' | 'archived-cleanup'

type PlayIntentSystemNotificationDefinition = {
  key: string;
  title: string;
  componentMode: PlayIntentSystemNotificationComponentMode;
}

type SystemNotificationCopy = {
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

export const creatorInterestWithdrawnSystemNotification = createPlayIntentSystemNotificationDefinition(
  'creator-interest-withdrawn',
  '❎ Someone passed',
  'none'
)

const playIntentSystemNotificationDefinitions = [
  callToPlayEndedSystemNotification,
  creatorLaunchedGameSystemNotification,
  interestedPlayerLaunchedGameSystemNotification,
  creatorInterestUpdateSystemNotification,
  creatorInterestWithdrawnSystemNotification
]

const playIntentSystemNotificationByTitle = new Map(
  playIntentSystemNotificationDefinitions.map((definition) => [definition.title, definition] as const)
)

function formatLaunchedGameBody(actorLabel: string, gameTitle: string, audienceContext: string) {
  return `${actorLabel} just launched ${gameTitle} for ${audienceContext}.`
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