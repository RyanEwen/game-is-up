/** Builds local Discord previews, including interested-player delay estimates and their revisions. */
import { formatRunningLateLabel } from './running-late.js'
import {
  buildAutoPlayInactiveObservationClosedReason,
  buildDecoratedSectionHeading,
  buildDiscordNotice,
  decorateFieldLabel,
} from './discord-formatting.js'

type SimulatorDebugDmPreviewButtonStyle =
  'primary' | 'secondary' | 'danger' | 'link'

type SimulatorDebugDmPreviewButton = {
  label: string
  style: SimulatorDebugDmPreviewButtonStyle
  disabled: boolean
  url: string | null
  customId: string | null
}

type SimulatorDebugDmPreviewEmbedField = {
  name: string
  value: string
  inline: boolean
}

type SimulatorDebugDmPreviewEmbed = {
  title: string | null
  description: string | null
  color: number | null
  fields: SimulatorDebugDmPreviewEmbedField[]
  footerText: string | null
  imageUrl: string | null
  thumbnailUrl: string | null
}

export type SimulatorDebugDmPreview = {
  content: string
  embeds: SimulatorDebugDmPreviewEmbed[]
  buttonRows: SimulatorDebugDmPreviewButton[][]
}

export type SimulatedLifecycleStage =
  'scheduled' | 'check-in' | 'confirmed' | 'ended'
export type SimulatedAudienceResponse = 'interested' | 'pass' | null
export type SimulatedCreatorCheckInState =
  'pending' | 'confirmed' | 'canceled' | null

export type SimulatedLifecycleEntry = {
  id: number
  actor: 'creator' | 'audience' | 'system'
  summary: string
  occurredAt: string
}

export type SimulatedLifecycleState = {
  stage: SimulatedLifecycleStage
  audienceResponse: SimulatedAudienceResponse
  /** True when an interested audience member flagged that they will be late. */
  audienceRunningLate: boolean
  audienceRunningLateMinutes?: number | null
  creatorCheckInState: SimulatedCreatorCheckInState
  hasGoTimeBroadcast: boolean
  hasVoiceChannelActivity: boolean
  hasGameLaunchActivity: boolean
  latestAudienceUpdateFields: string[] | null
  latestAudienceUpdateRequiresFreshResponse: boolean
  creatorThreadArchived: boolean
  audienceThreadArchived: boolean
  history: SimulatedLifecycleEntry[]
  nextEntryId: number
}

export type SimulatedScenarioDraft = {
  creatorName: string
  audienceName: string
  gameTitle: string
  scheduledForLabel: string
  note: string
}

export type SimulatedAutoPlayNotifyScope = 'friends-only' | 'network' | null

/**
 * Auto-play prompt UI states surfaced by the debug simulator. These do NOT
 * map 1:1 to the live `DiscordAutoPlayPromptStatus` Prisma enum (which only
 * tracks `SENT | SKIPPED | FAILED | ACCEPTED | DECLINED | EXPIRED`).
 *
 * The simulator adds intermediate UI-only stages so the harness can preview
 * the whole flow:
 *   - 'initial'        — the prompt has not been opened yet
 *   - 'audience'       — audience picker is open
 *   - 'created'        — a play-intent has been created from the prompt
 *   - 'created-ended'  — the created play-intent has since ended
 *   - 'declined'       — maps to live DECLINED
 *   - 'expired'        — maps to live EXPIRED
 *   - 'archived'       — the recipient archived the prompt DM
 */
export type SimulatedAutoPlayPromptStatus =
  | 'initial'
  | 'composing'
  | 'audience'
  | 'created'
  | 'created-ended'
  | 'declined'
  | 'expired'
  | 'archived'

export type SimulatedAutoPlayPromptState = {
  status: SimulatedAutoPlayPromptStatus
  durationMinutes: number | null
  notifyScope: SimulatedAutoPlayNotifyScope
  closedReason: string | null
  history: SimulatedLifecycleEntry[]
  nextEntryId: number
}

export type SimulatedAutoPlayPromptDraft = {
  creatorName: string
  gameTitle: string
  friendRecipientCount: number
  networkRecipientCount: number
}

export type SimulatedDmMessage = {
  id: string
  label: string
  preview: SimulatorDebugDmPreview
  explanation?: string[]
  isInteractive?: boolean
}

export const simulatedDmActionIds = {
  audienceInterested: 'simulated:audience:interested',
  audiencePass: 'simulated:audience:pass',
  audienceRunningLate: 'simulated:audience:late',
  audienceMute: 'simulated:audience:mute',
  creatorConfirmCheckIn: 'simulated:creator:confirm-check-in',
  creatorStartNow: 'simulated:creator:start-now',
  creatorEnd: 'simulated:creator:end',
  creatorCleanup: 'simulated:creator:cleanup',
  audienceCleanup: 'simulated:audience:cleanup',
} as const

export const simulatedLifecycleShortcutActionIds = {
  creatorJoinedVoice: 'simulated:event:creator-joined-voice',
  audienceJoinedVoice: 'simulated:event:audience-joined-voice',
  creatorLaunchedGame: 'simulated:event:creator-launched-game',
  audienceLaunchedGame: 'simulated:event:audience-launched-game',
} as const

const simulatedAutoPlayPromptId = 'simulated-auto-play-prompt'

export const simulatedAutoPlayDmActionIds = {
  compose: `auto-play:${simulatedAutoPlayPromptId}:compose`,
  post: `auto-play:${simulatedAutoPlayPromptId}:confirm:friends-only:60`,
  duration60: `auto-play:${simulatedAutoPlayPromptId}:duration:60`,
  duration120: `auto-play:${simulatedAutoPlayPromptId}:duration:120`,
  duration240: `auto-play:${simulatedAutoPlayPromptId}:duration:240`,
  confirmFriendsOnly120: `auto-play:${simulatedAutoPlayPromptId}:confirm:friends-only:120`,
  confirmNetwork120: `auto-play:${simulatedAutoPlayPromptId}:confirm:network:120`,
  decline: `auto-play:${simulatedAutoPlayPromptId}:decline`,
  cleanup: `auto-play:${simulatedAutoPlayPromptId}:cleanup`,
} as const

const simulatedOpenInAppUrl = 'https://gamesup.app/play'

function buildSimulatorOpenInAppButtons(): SimulatorDebugDmPreview['buttonRows'] {
  return [
    [
      {
        label: 'Open in App',
        style: 'link',
        disabled: false,
        url: simulatedOpenInAppUrl,
        customId: null,
      },
    ],
  ]
}

function buildSimulatorAudienceInviteHeading(
  draft: SimulatedScenarioDraft,
  state: SimulatedLifecycleState,
) {
  return state.stage === 'scheduled'
    ? `🎮 ${draft.creatorName} scheduled ${draft.gameTitle} ${draft.scheduledForLabel}`
    : `🎮 ${draft.creatorName} wants to play ${draft.gameTitle} (right now!)`
}

function buildSimulatorArchiveButtons(
  customId: string,
): SimulatorDebugDmPreview['buttonRows'] {
  return [
    [
      {
        label: 'Archive',
        style: 'secondary',
        disabled: false,
        url: null,
        customId,
      },
      {
        label: 'Open in App',
        style: 'link',
        disabled: false,
        url: simulatedOpenInAppUrl,
        customId: null,
      },
    ],
  ]
}

function buildSimulatorPlainMessage(
  title: string,
  bodyLines: string[],
  trailingSubtext?: string,
) {
  const blocks = [title, ...bodyLines]

  if (trailingSubtext) {
    blocks.push(`-# ${trailingSubtext}`)
  }

  return blocks.join('\n\n')
}

function buildSimulatorNotice(
  title: string,
  sections: Array<string | null>,
  subtext?: string | null,
) {
  return buildDiscordNotice(title, sections, subtext)
}

function buildSimulatorPromptSection(label: string, value: string) {
  const trimmed = value.trim()

  if (trimmed.length === 0) {
    return null
  }

  return `${buildDecoratedSectionHeading(label)}\n${trimmed}`
}

export function formatSimulatorDurationLabel(durationMinutes: number) {
  if (durationMinutes % 60 === 0) {
    const hours = durationMinutes / 60
    return `${hours} hour${hours === 1 ? '' : 's'}`
  }

  return `${durationMinutes} minutes`
}

export function buildSimulatorAutoPlayClosedReason(gameTitle: string) {
  return buildAutoPlayInactiveObservationClosedReason(gameTitle)
}

function buildSimulatorTimingLabel(
  draft: SimulatedScenarioDraft,
  state: SimulatedLifecycleState,
) {
  if (state.stage === 'check-in') {
    return 'Starting now. Waiting for creator confirmation.'
  }

  if (state.stage === 'confirmed') {
    return 'Starting now.'
  }

  if (state.stage === 'ended') {
    return 'This session has ended.'
  }

  return draft.scheduledForLabel.trim() || 'Later today.'
}

function buildSimulatorCreatorSummaryHeading(
  draft: SimulatedScenarioDraft,
  state: SimulatedLifecycleState,
) {
  if (state.stage === 'ended') {
    return '🎮 Your Call to Play'
  }

  return `🎮 Your Call to Play for ${buildSimulatorTimingLabel(draft, state)}`
}

function buildSimulatorAudienceFieldValue(audienceName: string) {
  return `Friends and your selected network\nIncludes @${audienceName}`
}

function buildInterestFieldValue(
  audienceName: string,
  audienceResponse: SimulatedAudienceResponse,
) {
  if (audienceResponse !== 'interested') {
    return 'No one is showing interest yet.'
  }

  return `1 person is showing interest:\n@${audienceName}`
}

function buildSimulatorAudienceActionButtons(
  draft: SimulatedScenarioDraft,
  state: SimulatedLifecycleState,
): SimulatorDebugDmPreview['buttonRows'] {
  if (state.stage === 'ended') {
    return []
  }

  const primaryRow: SimulatorDebugDmPreviewButton[] = []
  const isGoTimeConfirmed =
    state.stage === 'confirmed' &&
    state.hasGoTimeBroadcast &&
    state.audienceResponse === 'interested'

  if (!isGoTimeConfirmed && state.audienceResponse !== 'interested') {
    primaryRow.push({
      label: "I'm interested",
      style: 'primary',
      disabled: false,
      url: null,
      customId: simulatedDmActionIds.audienceInterested,
    })
  }

  if (state.audienceResponse === 'interested') {
    primaryRow.push({
      label: state.audienceRunningLate ? 'Update delay' : "I'll be late",
      style: 'secondary',
      disabled: false,
      url: null,
      customId: simulatedDmActionIds.audienceRunningLate,
    })
  }

  if (state.audienceResponse !== 'pass') {
    primaryRow.push({
      label: isGoTimeConfirmed ? 'No longer interested' : "Can't make it",
      style: 'secondary',
      disabled: false,
      url: null,
      customId: simulatedDmActionIds.audiencePass,
    })
  }

  if (state.audienceResponse === 'pass') {
    primaryRow.push({
      label: `Mute ${draft.creatorName}`,
      style: 'danger',
      disabled: false,
      url: null,
      customId: simulatedDmActionIds.audienceMute,
    })
  }

  primaryRow.push({
    label: 'Open in App',
    style: 'link',
    disabled: false,
    url: simulatedOpenInAppUrl,
    customId: null,
  })

  return primaryRow.length > 0 ? [primaryRow] : []
}

function buildSimulatorCreatorSummaryButtons(
  state: SimulatedLifecycleState,
): SimulatorDebugDmPreview['buttonRows'] {
  if (state.creatorThreadArchived) {
    return []
  }

  if (state.stage === 'ended') {
    return buildSimulatorArchiveButtons(simulatedDmActionIds.creatorCleanup)
  }

  const primaryRow: SimulatorDebugDmPreviewButton[] = []

  if (state.stage === 'scheduled') {
    primaryRow.push({
      label: 'Start now',
      style: 'primary',
      disabled: false,
      url: null,
      customId: simulatedDmActionIds.creatorStartNow,
    })
  }

  primaryRow.push({
    label: 'End call to play',
    style: 'danger',
    disabled: false,
    url: null,
    customId: simulatedDmActionIds.creatorEnd,
  })

  primaryRow.push({
    label: 'Open in App',
    style: 'link',
    disabled: false,
    url: simulatedOpenInAppUrl,
    customId: null,
  })

  return [primaryRow]
}

function buildSimulatorCreatorCheckInButtons(): SimulatorDebugDmPreview['buttonRows'] {
  return [
    [
      {
        label: 'Still on',
        style: 'primary',
        disabled: false,
        url: null,
        customId: simulatedDmActionIds.creatorConfirmCheckIn,
      },
      {
        label: 'End call to play',
        style: 'secondary',
        disabled: false,
        url: null,
        customId: simulatedDmActionIds.creatorEnd,
      },
      {
        label: 'Open in App',
        style: 'link',
        disabled: false,
        url: simulatedOpenInAppUrl,
        customId: null,
      },
    ],
  ]
}

export function buildInitialSimulatorHistory(
  options: {
    now?: Date
    stage?: 'scheduled' | 'confirmed'
  } = {},
): SimulatedLifecycleState {
  const now = options.now ?? new Date()
  const stage = options.stage ?? 'scheduled'

  return {
    stage,
    audienceResponse: null,
    audienceRunningLate: false,
    audienceRunningLateMinutes: null,
    creatorCheckInState: null,
    hasGoTimeBroadcast: false,
    hasVoiceChannelActivity: false,
    hasGameLaunchActivity: false,
    latestAudienceUpdateFields: null,
    latestAudienceUpdateRequiresFreshResponse: false,
    creatorThreadArchived: false,
    audienceThreadArchived: false,
    history: [
      {
        id: 1,
        actor: 'system',
        summary:
          stage === 'confirmed'
            ? 'Created a fresh live call-to-play session.'
            : 'Created a fresh scheduled call-to-play session.',
        occurredAt: now.toISOString(),
      },
    ],
    nextEntryId: 2,
  }
}

export function formatSimulatorTimestamp(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function buildSimulatorCreatorSummaryPreview(
  draft: SimulatedScenarioDraft,
  state: SimulatedLifecycleState,
): SimulatorDebugDmPreview {
  const statusLabel =
    state.stage === 'check-in'
      ? 'Starting now - waiting for confirmation'
      : state.stage === 'confirmed'
        ? 'Live now'
        : state.stage === 'ended'
          ? 'Ended'
          : 'Scheduled'
  const isRunningLate =
    state.audienceResponse === 'interested' && state.audienceRunningLate
  const onTimeInterestedCount =
    state.audienceResponse === 'interested' && !state.audienceRunningLate
      ? 1
      : 0
  const runningLateCount = isRunningLate ? 1 : 0
  const passedCount = state.audienceResponse === 'pass' ? 1 : 0
  const waitingCount =
    state.stage === 'ended' || state.audienceResponse != null ? 0 : 1

  return {
    content: buildSimulatorCreatorSummaryHeading(draft, state),
    embeds: [
      {
        title: null,
        description:
          draft.note.trim().length > 0
            ? draft.note.trim()
            : 'No note set for this simulated call to play.',
        color:
          state.stage === 'confirmed'
            ? 0x22c55e
            : state.stage === 'check-in'
              ? 0xf59e0b
              : state.stage === 'ended'
                ? 0xef4444
                : 0x3b82f6,
        fields: [
          {
            name: 'Status',
            value: statusLabel,
            inline: true,
          },
          {
            name: 'Games',
            value: draft.gameTitle,
            inline: false,
          },
          {
            name: 'Audience',
            value: buildSimulatorAudienceFieldValue(draft.audienceName),
            inline: false,
          },
          {
            name: 'Window',
            value: buildSimulatorTimingLabel(draft, state),
            inline: true,
          },
          {
            name: 'Responses',
            value: [
              `Interested: ${onTimeInterestedCount}`,
              runningLateCount > 0 ? `Running late: ${runningLateCount}` : null,
              `Can't make it: ${passedCount}`,
              `Waiting: ${waitingCount}`,
            ]
              .filter((line): line is string => line != null)
              .join('\n'),
            inline: true,
          },
          {
            name: 'Interested Players',
            value:
              onTimeInterestedCount > 0
                ? `@${draft.audienceName}`
                : 'No one yet.',
            inline: false,
          },
          ...(isRunningLate
            ? [
                {
                  name: 'Running Late',
                  value:
                    state.audienceRunningLateMinutes == null
                      ? `@${draft.audienceName}`
                      : `@${draft.audienceName} (${formatRunningLateLabel(state.audienceRunningLateMinutes).toLowerCase()})`,
                  inline: false,
                },
              ]
            : []),
          {
            name: 'Note',
            value:
              draft.note.trim().length > 0 ? draft.note.trim() : 'No note.',
            inline: false,
          },
          {
            name: 'Voice Channel',
            value: 'Not set.',
            inline: false,
          },
        ],
        footerText:
          state.stage === 'ended'
            ? 'Open the app below if you want to post another call to play.'
            : state.stage === 'check-in'
              ? 'Confirm the go-time check-in below or end this call to play.'
              : 'Use the buttons below to open the app or end this call to play.',
        imageUrl: null,
        thumbnailUrl: null,
      },
    ],
    buttonRows: buildSimulatorCreatorSummaryButtons(state),
  }
}

export function buildSimulatorAudienceInvitePreview(
  draft: SimulatedScenarioDraft,
  state: SimulatedLifecycleState,
): SimulatorDebugDmPreview {
  const isEnded = state.stage === 'ended'

  return {
    content: buildSimulatorAudienceInviteHeading(draft, state),
    embeds: [
      {
        title: null,
        description:
          draft.note.trim().length > 0
            ? draft.note.trim()
            : 'No note set for this simulated session.',
        color:
          state.stage === 'confirmed' || state.stage === 'check-in'
            ? 0x22c55e
            : isEnded
              ? 0xef4444
              : 0x5865f2,
        fields: [
          {
            name: 'Creator',
            value: `@${draft.creatorName}`,
            inline: false,
          },
          {
            name: 'Games',
            value: draft.gameTitle,
            inline: false,
          },
          {
            name: 'Timing',
            value: buildSimulatorTimingLabel(draft, state),
            inline: false,
          },
          {
            name: 'Audience',
            value: buildSimulatorAudienceFieldValue(draft.audienceName),
            inline: false,
          },
          {
            name: 'Interest',
            value: buildInterestFieldValue(
              draft.audienceName,
              state.audienceResponse,
            ),
            inline: false,
          },
          {
            name: 'Note',
            value:
              draft.note.trim().length > 0 ? draft.note.trim() : 'No note.',
            inline: false,
          },
        ],
        footerText: 'Respond from the buttons below or open the app.',
        imageUrl: null,
        thumbnailUrl: null,
      },
    ],
    buttonRows: state.audienceThreadArchived
      ? []
      : isEnded
        ? buildSimulatorArchiveButtons(simulatedDmActionIds.audienceCleanup)
        : buildSimulatorAudienceActionButtons(draft, state),
  }
}

function formatSimulatedUpdatedFieldChange(field: string) {
  switch (field) {
    case 'time':
      return 'Timing changed.'
    case 'game selection':
      return 'Games changed.'
    case 'audience':
      return 'Audience changed.'
    case 'note':
      return 'Note changed.'
    default:
      return `${field.charAt(0).toUpperCase()}${field.slice(1)} changed.`
  }
}

export function buildSimulatorUpdatedReplyPreview(
  updatedFields: string[],
  options: {
    requiresFreshResponse?: boolean
  } = {},
): SimulatorDebugDmPreview {
  return {
    content: buildSimulatorPlainMessage(
      'ℹ️ Call Updated',
      [
        ...updatedFields.map(formatSimulatedUpdatedFieldChange),
        ...(options.requiresFreshResponse
          ? [
              'Your previous response was cleared because the timing or games changed.',
            ]
          : []),
      ],
      options.requiresFreshResponse
        ? 'Use the buttons on the original invite above to respond again.'
        : 'The original invite above now shows the latest details.',
    ),
    embeds: [],
    buttonRows: [],
  }
}

export function buildSimulatorAudienceFollowUpPreview(
  draft: SimulatedScenarioDraft,
  state: SimulatedLifecycleState,
): SimulatorDebugDmPreview | null {
  if (state.stage === 'ended') {
    if (state.audienceResponse != null) {
      return null
    }

    return {
      content: buildSimulatorPlainMessage(
        '🛑 Call Ended',
        ['This call to play ended.'],
        'Open the app if you still want to coordinate or post your own call to play.',
      ),
      embeds: [],
      buttonRows: buildSimulatorOpenInAppButtons(),
    }
  }

  // Response acknowledgements ("You're In" / "Can't Make It" / "Running Late")
  // are no longer sent as a separate reply. The invite anchor above updates in
  // place and the pressed button shows a momentary confirmation instead, so the
  // only audience-side replies that remain are the go-time broadcast and the
  // ended notice for an unanswered invite.
  if (state.stage === 'confirmed' && state.hasGoTimeBroadcast) {
    if (state.audienceResponse === 'pass') {
      return null
    }

    if (state.audienceResponse === 'interested') {
      return {
        content: buildSimulatorPlainMessage('⏰ Go Time', [
          `${draft.creatorName} confirmed the session is starting now.`,
          'See original invite above for details or to change your response.',
        ]),
        embeds: [],
        buttonRows: [],
      }
    }

    return {
      content: buildSimulatorPlainMessage(
        '⏰ Go Time',
        [`${draft.creatorName} confirmed this session is still on.`],
        'See original invite above for details or to change your response.',
      ),
      embeds: [],
      buttonRows: [],
    }
  }

  return null
}

export function buildSimulatorCreatorCheckInPreview(
  draft: SimulatedScenarioDraft,
  state: SimulatedLifecycleState,
): SimulatorDebugDmPreview | null {
  if (!state.creatorCheckInState || state.stage === 'ended') {
    return null
  }

  if (state.creatorCheckInState === 'confirmed') {
    return {
      content: buildSimulatorPlainMessage('✅ Call Confirmed', [
        'I let everyone know your call to play is still on.',
        'I reminded anyone who had not answered yet.',
      ]),
      embeds: [],
      buttonRows: [],
    }
  }

  if (state.creatorCheckInState === 'canceled') {
    return {
      content: buildSimulatorPlainMessage('🛑 Call Ended', [
        'I ended this call to play.',
        'I let your audience know it ended.',
      ]),
      embeds: [],
      buttonRows: buildSimulatorOpenInAppButtons(),
    }
  }

  return {
    content: '⏰ Go-Time Check-In',
    embeds: [
      {
        title: null,
        description: `Your scheduled call to play is starting now, @${draft.creatorName}.`,
        color: 0xf59e0b,
        fields: [
          {
            name: 'Status',
            value:
              'Confirm if it is still on, or end the call if plans changed.',
            inline: false,
          },
        ],
        footerText: 'Use the buttons below for the fastest response.',
        imageUrl: null,
        thumbnailUrl: null,
      },
    ],
    buttonRows: buildSimulatorCreatorCheckInButtons(),
  }
}

export function buildSimulatorCreatorFollowUpPreview(
  draft: SimulatedScenarioDraft,
  state: SimulatedLifecycleState,
): SimulatorDebugDmPreview | null {
  if (state.audienceResponse == null || state.stage === 'ended') {
    return null
  }

  if (state.audienceResponse === 'interested' && state.audienceRunningLate) {
    return {
      content: buildSimulatorPlainMessage('⏰ Someone is running late', [
        `@${draft.audienceName} is interested but ${formatRunningLateLabel(state.audienceRunningLateMinutes).toLowerCase()} for ${draft.gameTitle}.`,
      ]),
      embeds: [],
      buttonRows: [],
    }
  }

  return {
    content: buildSimulatorPlainMessage(
      state.audienceResponse === 'interested'
        ? '✅ Someone is interested'
        : "❌ Someone can't make it",
      [
        state.audienceResponse === 'interested'
          ? `@${draft.audienceName} is interested in playing ${draft.gameTitle}.`
          : `@${draft.audienceName} can't make it for ${draft.gameTitle}.`,
      ],
    ),
    embeds: [],
    buttonRows: [],
  }
}

export function buildSimulatorVoiceChannelActivityReplyPreview(options: {
  actorName: string
  voiceChannelName?: string | null
}): SimulatorDebugDmPreview {
  const channelLabel = options.voiceChannelName
    ? `the voice channel ${options.voiceChannelName}`
    : 'the voice channel'

  return {
    content: buildSimulatorPlainMessage(
      '🎙 Someone joined the voice channel',
      [
        `@${options.actorName} just joined ${channelLabel} for this call to play.`,
      ],
      'The retained call summary above still has the latest details.',
    ),
    embeds: [],
    buttonRows: [],
  }
}

export function buildSimulatorLaunchedGameActivityReplyPreview(options: {
  actorName: string
  gameTitle: string
}): SimulatorDebugDmPreview {
  return {
    content: buildSimulatorPlainMessage(
      '🎮 Someone launched the game',
      [
        `@${options.actorName} just launched ${options.gameTitle} for this call to play.`,
      ],
      'The retained call summary above still has the latest details.',
    ),
    embeds: [],
    buttonRows: [],
  }
}

export function buildSimulatedDmMessages(
  draft: SimulatedScenarioDraft,
  state: SimulatedLifecycleState,
): {
  creatorMessages: SimulatedDmMessage[]
  audienceMessages: SimulatedDmMessage[]
} {
  const creatorMessages: SimulatedDmMessage[] = []

  if (!state.creatorThreadArchived) {
    creatorMessages.push({
      id: 'creator-summary',
      label: 'Creator retained summary',
      preview: buildSimulatorCreatorSummaryPreview(draft, state),
      explanation: [
        'This stays as the main creator control surface and updates in place across the simulated lifecycle.',
        'The separate creator reply below should only carry audience-change notifications, not duplicate this summary.',
      ],
      isInteractive: true,
    })
  }

  const creatorCheckInPreview = buildSimulatorCreatorCheckInPreview(
    draft,
    state,
  )

  if (creatorCheckInPreview && !state.creatorThreadArchived) {
    creatorMessages.push({
      id: 'creator-check-in',
      label:
        state.creatorCheckInState === 'pending'
          ? 'Creator go-time check-in'
          : 'Creator resolved check-in',
      preview: creatorCheckInPreview,
      explanation: [
        'This appears when a scheduled start time is reached before the creator has confirmed the session is still on.',
        'The prompt itself edits in place to a resolved state once the creator confirms or ends the call.',
      ],
      isInteractive: state.creatorCheckInState === 'pending',
    })
  }

  const creatorFollowUpPreview = buildSimulatorCreatorFollowUpPreview(
    draft,
    state,
  )

  if (creatorFollowUpPreview && !state.creatorThreadArchived) {
    creatorMessages.push({
      id: 'creator-follow-up',
      label:
        state.stage === 'confirmed'
          ? 'Creator audience status reply'
          : 'Creator interest notification',
      preview: creatorFollowUpPreview,
      explanation: [
        "This is the creator-side per-audience status reply, such as “Someone is interested” or “Someone can't make it.”",
        'Quiet recovery can reuse the same message, but flips between interested and pass should be treated as a fresh creator notification so Discord notifies the creator again. It disappears once the call ends while the retained summary above remains.',
      ],
      isInteractive: false,
    })
  }

  const audienceMessages: SimulatedDmMessage[] = []

  if (!state.audienceThreadArchived) {
    audienceMessages.push({
      id: 'audience-anchor',
      label: 'Audience invite anchor',
      preview: buildSimulatorAudienceInvitePreview(draft, state),
      explanation: [
        'This is the original invite anchor and should remain present for the whole lifecycle.',
        'Response changes should update this message in place rather than replacing it with acknowledgement-only copy.',
      ],
      isInteractive: true,
    })
  }

  const followUpPreview = buildSimulatorAudienceFollowUpPreview(draft, state)

  if (followUpPreview && !state.audienceThreadArchived) {
    audienceMessages.push({
      id: 'audience-follow-up',
      label:
        state.stage === 'confirmed'
          ? 'Audience go-time reply'
          : 'Audience ended notice',
      preview: followUpPreview,
      explanation: [
        'This is the retained audience-side go-time reply beneath the original invite, or the ended notice when the call ends before the recipient answers.',
        'Response acknowledgements ("You\'re In" / "Passed for Now" / "Running Late") are no longer sent as a separate reply: the invite above updates in place and the pressed button shows a momentary confirmation instead.',
      ],
      isInteractive: false,
    })
  }

  return {
    creatorMessages,
    audienceMessages,
  }
}

function buildSimulatorAutoPlayInitialButtons(): SimulatorDebugDmPreview['buttonRows'] {
  return [
    [
      {
        label: 'Create call to play',
        style: 'primary',
        disabled: false,
        url: null,
        customId: simulatedAutoPlayDmActionIds.compose,
      },
      {
        label: 'Not now',
        style: 'secondary',
        disabled: false,
        url: null,
        customId: simulatedAutoPlayDmActionIds.decline,
      },
      {
        label: 'Open App',
        style: 'link',
        disabled: false,
        url: simulatedOpenInAppUrl,
        customId: null,
      },
    ],
  ]
}

function buildSimulatorAutoPlayAudienceButtons(
  draft: SimulatedAutoPlayPromptDraft,
  durationMinutes: number,
): SimulatorDebugDmPreview['buttonRows'] {
  return [
    [
      {
        label: `Friends only (${draft.friendRecipientCount})`,
        style: 'secondary',
        disabled: draft.friendRecipientCount === 0,
        url: null,
        customId: `auto-play:${simulatedAutoPlayPromptId}:confirm:friends-only:${durationMinutes}`,
      },
      {
        label: `Your network + friends (${draft.networkRecipientCount})`,
        style: 'primary',
        disabled: false,
        url: null,
        customId: `auto-play:${simulatedAutoPlayPromptId}:confirm:network:${durationMinutes}`,
      },
      {
        label: 'Cancel',
        style: 'secondary',
        disabled: false,
        url: null,
        customId: simulatedAutoPlayDmActionIds.decline,
      },
      {
        label: 'Open App',
        style: 'link',
        disabled: false,
        url: simulatedOpenInAppUrl,
        customId: null,
      },
    ],
  ]
}

function buildSimulatorAutoPlayCleanupButtons(): SimulatorDebugDmPreview['buttonRows'] {
  return [
    [
      {
        label: 'Archive',
        style: 'secondary',
        disabled: false,
        url: null,
        customId: simulatedAutoPlayDmActionIds.cleanup,
      },
      {
        label: 'Open App',
        style: 'link',
        disabled: false,
        url: simulatedOpenInAppUrl,
        customId: null,
      },
    ],
  ]
}

function buildSimulatorAutoPlaySummaryButtons(
  status: SimulatedAutoPlayPromptStatus,
): SimulatorDebugDmPreview['buttonRows'] {
  if (status !== 'created') {
    return []
  }

  return [
    [
      {
        label: 'End call to play',
        style: 'danger',
        disabled: false,
        url: null,
        customId: simulatedDmActionIds.creatorEnd,
      },
      {
        label: 'Open in App',
        style: 'link',
        disabled: false,
        url: simulatedOpenInAppUrl,
        customId: null,
      },
    ],
  ]
}

function buildSimulatorAutoPlayInitialPreview(
  draft: SimulatedAutoPlayPromptDraft,
): SimulatorDebugDmPreview {
  return {
    content: '🎮 Do you want to send out a call to play?',
    embeds: [
      {
        title: null,
        description: null,
        color: 0x3b82f6,
        fields: [
          {
            name: decorateFieldLabel('Game'),
            value: draft.gameTitle,
            inline: false,
          },
          {
            name: decorateFieldLabel('Reach'),
            value: `${draft.networkRecipientCount} people in your network and friends could receive a call to play for it right now.`,
            inline: false,
          },
          {
            name: decorateFieldLabel('Next Step'),
            value:
              'Open the composer to choose audience, duration, voice setup, title, and note. The detected game and immediate start are already set.',
            inline: false,
          },
        ],
        footerText: 'The same full composer is available here in Discord.',
        imageUrl: null,
        thumbnailUrl: null,
      },
    ],
    buttonRows: buildSimulatorAutoPlayInitialButtons(),
  }
}

function buildSimulatorAutoPlayAudiencePreview(
  draft: SimulatedAutoPlayPromptDraft,
  durationMinutes: number,
  options: {
    includeCleanup?: boolean
  } = {},
): SimulatorDebugDmPreview {
  return {
    content: '👥 Choose an Audience',
    embeds: [
      {
        title: null,
        description: null,
        color: 0x3b82f6,
        fields: [
          {
            name: decorateFieldLabel('Game'),
            value: draft.gameTitle,
            inline: false,
          },
          {
            name: decorateFieldLabel('Duration'),
            value: `Next ${formatSimulatorDurationLabel(durationMinutes)}.`,
            inline: true,
          },
          {
            name: decorateFieldLabel('Reach'),
            value: `Friends only: ${draft.friendRecipientCount}\nYour network + friends: ${draft.networkRecipientCount}`,
            inline: false,
          },
        ],
        footerText: 'Choose who should receive this call to play.',
        imageUrl: null,
        thumbnailUrl: null,
      },
    ],
    buttonRows: options.includeCleanup
      ? buildSimulatorAutoPlayCleanupButtons()
      : buildSimulatorAutoPlayAudienceButtons(draft, durationMinutes),
  }
}

function buildSimulatorAutoPlayDeclinedPreview(
  draft: SimulatedAutoPlayPromptDraft,
): SimulatorDebugDmPreview {
  return {
    content: `🛑 ${draft.gameTitle} Prompt Closed`,
    embeds: [
      {
        title: null,
        description: null,
        color: 0xef4444,
        fields: [
          {
            name: decorateFieldLabel('Game'),
            value: draft.gameTitle,
            inline: false,
          },
          {
            name: decorateFieldLabel('Status'),
            value: `You chose not to create a call to play for ${draft.gameTitle} right now.`,
            inline: false,
          },
        ],
        footerText:
          'Open the app if you want to create or edit a call to play later.',
        imageUrl: null,
        thumbnailUrl: null,
      },
    ],
    buttonRows: buildSimulatorAutoPlayCleanupButtons(),
  }
}

function buildSimulatorAutoPlayCreatedSummaryPreview(
  draft: SimulatedAutoPlayPromptDraft,
  state: SimulatedAutoPlayPromptState,
): SimulatorDebugDmPreview {
  const deliveredCount =
    state.notifyScope === 'friends-only'
      ? draft.friendRecipientCount
      : draft.networkRecipientCount

  return {
    content:
      state.status === 'created-ended'
        ? '🎮 Your Call to Play'
        : '🎮 Your Call to Play',
    embeds: [
      {
        title: null,
        description: 'Picked up from Discord auto-play.',
        color: state.status === 'created-ended' ? 0xef4444 : 0x22c55e,
        fields: [
          {
            name: 'Status',
            value: state.status === 'created-ended' ? 'Ended' : 'Live now',
            inline: true,
          },
          {
            name: 'Games',
            value: draft.gameTitle,
            inline: false,
          },
          {
            name: 'Audience',
            value:
              state.notifyScope === 'friends-only'
                ? `Friends only\n${draft.friendRecipientCount} recipients`
                : `Your network + friends\n${draft.networkRecipientCount} recipients`,
            inline: false,
          },
          {
            name: 'Window',
            value:
              state.durationMinutes != null
                ? `Next ${formatSimulatorDurationLabel(state.durationMinutes)}.`
                : 'Starting now.',
            inline: true,
          },
          {
            name: 'Responses',
            value: `Interested: 0\nPassed: 0\nWaiting: ${deliveredCount}`,
            inline: true,
          },
          {
            name: 'Note',
            value: 'Picked up from Discord auto-play.',
            inline: false,
          },
        ],
        footerText:
          state.status === 'created-ended'
            ? 'This call to play came from Discord auto-play and has already ended.'
            : 'This creator summary took over after the Discord auto-play prompt created a call to play.',
        imageUrl: null,
        thumbnailUrl: null,
      },
    ],
    buttonRows: buildSimulatorAutoPlaySummaryButtons(state.status),
  }
}

function buildSimulatorAutoPlayClosedReplyPreview(
  reason: string,
): SimulatorDebugDmPreview {
  return {
    content: buildSimulatorNotice(
      '🛑 Prompt Closed',
      [buildSimulatorPromptSection('Status', reason)],
      'Open the app if you still want to create or edit a call to play.',
    ),
    embeds: [],
    buttonRows: [],
  }
}

export function buildInitialAutoPlayPromptHistory(
  options: {
    now?: Date
  } = {},
): SimulatedAutoPlayPromptState {
  const now = options.now ?? new Date()

  return {
    status: 'initial',
    durationMinutes: null,
    notifyScope: null,
    closedReason: null,
    history: [
      {
        id: 1,
        actor: 'system',
        summary: 'Recorded a fresh Discord auto-play prompt.',
        occurredAt: now.toISOString(),
      },
    ],
    nextEntryId: 2,
  }
}

export function buildSimulatedAutoPlayDmMessages(
  draft: SimulatedAutoPlayPromptDraft,
  state: SimulatedAutoPlayPromptState,
): {
  promptMessages: SimulatedDmMessage[]
  createdCallMessages: SimulatedDmMessage[]
} {
  const promptMessages: SimulatedDmMessage[] = []
  const createdCallMessages: SimulatedDmMessage[] = []

  if (state.status === 'initial') {
    promptMessages.push({
      id: 'auto-play-anchor',
      label: 'Auto-play prompt anchor',
      preview: buildSimulatorAutoPlayInitialPreview(draft),
      explanation: [
        'This prompt offers the full bot composer when Discord detects someone launching a game.',
        'The detected game and immediate start are fixed; the remaining settings use the same composer as manual calls.',
      ],
      isInteractive: true,
    })
  }

  if (state.status === 'composing') {
    promptMessages.push({
      id: 'auto-play-anchor',
      label: 'Auto-play prompt anchor',
      preview: buildSimulatorAutoPlayInitialPreview(draft),
      explanation: [
        'The original prompt stays available while a separate private composer draft is open.',
      ],
      isInteractive: false,
    })
    promptMessages.push({
      id: 'auto-play-composer',
      label: 'Detected-game composer review',
      preview: {
        content: '',
        embeds: [
          {
            title: 'Post a call to play - Review',
            description: 'Check everything, then post your call to play.',
            color: 0x33d7a6,
            fields: [
              {
                name: 'Your call to play so far',
                value: `Game: ${draft.gameTitle}\nStart: Now\nDuration: 1 hour\nAudience: Friends only\nTitle: Call to play\nNote: None\nVoice: No voice channel`,
                inline: false,
              },
            ],
            footerText: null,
            imageUrl: null,
            thumbnailUrl: null,
          },
        ],
        buttonRows: [
          [
            {
              label: 'Post call to play',
              style: 'primary',
              disabled: false,
              url: null,
              customId: simulatedAutoPlayDmActionIds.post,
            },
          ],
        ],
      },
      explanation: [
        'The lifecycle simulator resumes at review with a sample draft. Live admin previews show the saved composer step, selections, and controls.',
      ],
      isInteractive: true,
    })
  }

  if (state.status === 'audience') {
    promptMessages.push({
      id: 'auto-play-anchor',
      label: 'Legacy auto-play audience picker',
      preview: buildSimulatorAutoPlayAudiencePreview(
        draft,
        state.durationMinutes ?? 120,
      ),
      explanation: [
        'This is still the original prompt anchor, now edited in place to the audience-selection step.',
        'Choosing an audience creates a normal call-to-play summary and hands future lifecycle ownership over to that summary thread.',
      ],
      isInteractive: true,
    })
  }

  if (state.status === 'declined') {
    promptMessages.push({
      id: 'auto-play-anchor',
      label: 'Declined auto-play prompt',
      preview: buildSimulatorAutoPlayDeclinedPreview(draft),
      explanation: [
        'Declining the prompt rewrites the original anchor in place into a closed state with cleanup controls.',
        'The closed prompt stays put until the user archives it.',
      ],
      isInteractive: true,
    })
  }

  if (state.status === 'expired') {
    promptMessages.push({
      id: 'auto-play-anchor',
      label: 'Closed auto-play prompt anchor',
      preview:
        state.durationMinutes != null
          ? buildSimulatorAutoPlayAudiencePreview(
              draft,
              state.durationMinutes,
              { includeCleanup: true },
            )
          : {
              ...buildSimulatorAutoPlayInitialPreview(draft),
              buttonRows: buildSimulatorAutoPlayCleanupButtons(),
            },
      explanation: [
        'Closed auto-play outcomes freeze the original prompt anchor in place and leave cleanup controls on it.',
        'The specific close reason moves to a dangling reply beneath that retained anchor.',
      ],
      isInteractive: true,
    })

    if (state.closedReason) {
      promptMessages.push({
        id: 'auto-play-closed-reply',
        label: 'Closed auto-play reply',
        preview: buildSimulatorAutoPlayClosedReplyPreview(state.closedReason),
        explanation: [
          'This dangling reply explains why the prompt closed after the original prompt was frozen.',
          'Archiving the prompt should clear both the retained anchor and this reply together.',
        ],
        isInteractive: false,
      })
    }
  }

  if (state.status === 'created' || state.status === 'created-ended') {
    createdCallMessages.push({
      id: 'auto-play-created-summary',
      label:
        state.status === 'created'
          ? 'Auto-play created call summary'
          : 'Ended auto-play created call summary',
      preview: buildSimulatorAutoPlayCreatedSummaryPreview(draft, state),
      explanation: [
        'Accepted auto-play prompts hand off into the regular creator-summary thread instead of keeping the original prompt as the cleanup anchor.',
        'From this point on, the DM behavior should match the creator summary path for a live call to play.',
      ],
      isInteractive: state.status === 'created',
    })
  }

  return {
    promptMessages,
    createdCallMessages,
  }
}
