type SimulatorDebugDmPreviewButtonStyle = 'primary' | 'secondary' | 'danger' | 'link'

type SimulatorDebugDmPreviewButton = {
  label: string;
  style: SimulatorDebugDmPreviewButtonStyle;
  disabled: boolean;
  url: string | null;
  customId: string | null;
}

type SimulatorDebugDmPreviewEmbedField = {
  name: string;
  value: string;
  inline: boolean;
}

type SimulatorDebugDmPreviewEmbed = {
  title: string | null;
  description: string | null;
  color: number | null;
  fields: SimulatorDebugDmPreviewEmbedField[];
  footerText: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
}

export type SimulatorDebugDmPreview = {
  content: string;
  embeds: SimulatorDebugDmPreviewEmbed[];
  buttonRows: SimulatorDebugDmPreviewButton[][];
}

export type SimulatedLifecycleStage = 'scheduled' | 'check-in' | 'confirmed' | 'ended'
export type SimulatedAudienceResponse = 'interested' | 'pass' | null
export type SimulatedCreatorCheckInState = 'pending' | 'confirmed' | 'canceled' | null

export type SimulatedLifecycleEntry = {
  id: number;
  actor: 'creator' | 'audience' | 'system';
  summary: string;
  occurredAt: string;
}

export type SimulatedLifecycleState = {
  stage: SimulatedLifecycleStage;
  audienceResponse: SimulatedAudienceResponse;
  creatorCheckInState: SimulatedCreatorCheckInState;
  hasGoTimeBroadcast: boolean;
  latestAudienceUpdateFields: string[] | null;
  history: SimulatedLifecycleEntry[];
  nextEntryId: number;
}

export type SimulatedScenarioDraft = {
  creatorName: string;
  audienceName: string;
  gameTitle: string;
  scheduledForLabel: string;
  note: string;
}

export type SimulatedDmMessage = {
  id: string;
  label: string;
  preview: SimulatorDebugDmPreview;
  explanation?: string[];
  isInteractive?: boolean;
}

export const simulatedDmActionIds = {
  audienceInterested: 'simulated:audience:interested',
  audiencePass: 'simulated:audience:pass',
  audienceMute: 'simulated:audience:mute',
  creatorConfirmCheckIn: 'simulated:creator:confirm-check-in',
  creatorStartNow: 'simulated:creator:start-now',
  creatorEnd: 'simulated:creator:end'
} as const

const simulatedOpenInAppUrl = 'https://gamesup.app/play'

function buildSimulatorPlainMessage(title: string, bodyLines: string[], trailingSubtext?: string) {
  const blocks = [title, ...bodyLines]

  if (trailingSubtext) {
    blocks.push(`-# ${trailingSubtext}`)
  }

  return blocks.join('\n\n')
}

function buildSimulatorTimingLabel(draft: SimulatedScenarioDraft, state: SimulatedLifecycleState) {
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

function buildSimulatorCreatorSummaryHeading(draft: SimulatedScenarioDraft, state: SimulatedLifecycleState) {
  if (state.stage === 'ended') {
    return '🎮 Your Call to Play'
  }

  return `🎮 Your Call to Play for ${buildSimulatorTimingLabel(draft, state)}`
}

function buildSimulatorAudienceFieldValue(audienceName: string) {
  return `Friends and your selected network\nIncludes @${audienceName}`
}

function buildInterestFieldValue(audienceName: string, audienceResponse: SimulatedAudienceResponse) {
  if (audienceResponse !== 'interested') {
    return 'No one is showing interest yet.'
  }

  return `1 person is showing interest:\n@${audienceName}`
}

function buildSimulatorAudienceActionButtons(
  draft: SimulatedScenarioDraft,
  state: SimulatedLifecycleState
): SimulatorDebugDmPreview['buttonRows'] {
  if (state.stage === 'ended') {
    return []
  }

  const primaryRow: SimulatorDebugDmPreviewButton[] = []
  const isGoTimeConfirmed = state.stage === 'confirmed' && state.hasGoTimeBroadcast && state.audienceResponse === 'interested'

  if (!isGoTimeConfirmed && state.audienceResponse !== 'interested') {
    primaryRow.push({
      label: "I'm interested",
      style: 'primary',
      disabled: false,
      url: null,
      customId: simulatedDmActionIds.audienceInterested
    })
  }

  if (state.audienceResponse !== 'pass') {
    primaryRow.push({
      label: isGoTimeConfirmed ? 'No longer interested' : 'Pass',
      style: 'secondary',
      disabled: false,
      url: null,
      customId: simulatedDmActionIds.audiencePass
    })
  }

  if (state.audienceResponse === 'pass') {
    primaryRow.push({
      label: `Mute ${draft.creatorName}`,
      style: 'danger',
      disabled: false,
      url: null,
      customId: simulatedDmActionIds.audienceMute
    })
  }

  primaryRow.push({
    label: 'Open in App',
    style: 'link',
    disabled: false,
    url: simulatedOpenInAppUrl,
    customId: null
  })

  return primaryRow.length > 0 ? [primaryRow] : []
}

function buildSimulatorCreatorSummaryButtons(
  state: SimulatedLifecycleState
): SimulatorDebugDmPreview['buttonRows'] {
  if (state.stage === 'ended') {
    return []
  }

  const primaryRow: SimulatorDebugDmPreviewButton[] = []

  if (state.stage === 'scheduled') {
    primaryRow.push({
      label: 'Start now',
      style: 'primary',
      disabled: false,
      url: null,
      customId: simulatedDmActionIds.creatorStartNow
    })
  }

  primaryRow.push({
    label: 'End call to play',
    style: 'danger',
    disabled: false,
    url: null,
    customId: simulatedDmActionIds.creatorEnd
  })

  primaryRow.push({
    label: 'Open in App',
    style: 'link',
    disabled: false,
    url: simulatedOpenInAppUrl,
    customId: null
  })

  return [primaryRow]
}

function buildSimulatorCreatorCheckInButtons(): SimulatorDebugDmPreview['buttonRows'] {
  return [[
    {
      label: 'Still on',
      style: 'primary',
      disabled: false,
      url: null,
      customId: simulatedDmActionIds.creatorConfirmCheckIn
    },
    {
      label: 'End call to play',
      style: 'secondary',
      disabled: false,
      url: null,
      customId: simulatedDmActionIds.creatorEnd
    },
    {
      label: 'Open in App',
      style: 'link',
      disabled: false,
      url: simulatedOpenInAppUrl,
      customId: null
    }
  ]]
}

export function buildInitialSimulatorHistory(options: {
  now?: Date;
  stage?: 'scheduled' | 'confirmed';
} = {}): SimulatedLifecycleState {
  const now = options.now ?? new Date()
  const stage = options.stage ?? 'scheduled'

  return {
    stage,
    audienceResponse: null,
    creatorCheckInState: null,
    hasGoTimeBroadcast: false,
    latestAudienceUpdateFields: null,
    history: [
      {
        id: 1,
        actor: 'system',
        summary: stage === 'confirmed'
          ? 'Created a fresh live call-to-play session.'
          : 'Created a fresh scheduled call-to-play session.',
        occurredAt: now.toISOString()
      }
    ],
    nextEntryId: 2
  }
}

export function formatSimulatorTimestamp(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit'
  })
}

export function buildSimulatorCreatorSummaryPreview(
  draft: SimulatedScenarioDraft,
  state: SimulatedLifecycleState
): SimulatorDebugDmPreview {
  const statusLabel = state.stage === 'check-in'
    ? 'Starting now - waiting for confirmation'
    : state.stage === 'confirmed'
    ? 'Live now'
    : state.stage === 'ended'
      ? 'Ended'
      : 'Scheduled'
  const interestedCount = state.audienceResponse === 'interested' ? 1 : 0
  const passedCount = state.audienceResponse === 'pass' ? 1 : 0
  const waitingCount = state.stage === 'ended' || state.audienceResponse != null ? 0 : 1

  return {
    content: buildSimulatorCreatorSummaryHeading(draft, state),
    embeds: [
      {
        title: null,
        description: draft.note.trim().length > 0
          ? draft.note.trim()
          : 'No note set for this simulated call to play.',
        color: state.stage === 'confirmed'
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
            inline: true
          },
          {
            name: 'Games',
            value: draft.gameTitle,
            inline: false
          },
          {
            name: 'Audience',
            value: buildSimulatorAudienceFieldValue(draft.audienceName),
            inline: false
          },
          {
            name: 'Window',
            value: buildSimulatorTimingLabel(draft, state),
            inline: true
          },
          {
            name: 'Responses',
            value: `Interested: ${interestedCount}\nPassed: ${passedCount}\nWaiting: ${waitingCount}`,
            inline: true
          },
          {
            name: 'Interested Players',
            value: state.audienceResponse === 'interested'
              ? `@${draft.audienceName}`
              : 'No one yet.',
            inline: false
          },
          {
            name: 'Note',
            value: draft.note.trim().length > 0 ? draft.note.trim() : 'No note.',
            inline: false
          },
          {
            name: 'Voice Channel',
            value: 'Not set.',
            inline: false
          }
        ],
        footerText: state.stage === 'ended'
          ? 'Open the app below if you want to post another call to play.'
          : state.stage === 'check-in'
            ? 'Confirm the go-time check-in below or end this call to play.'
          : 'Use the buttons below to open the app or end this call to play.',
        imageUrl: null,
        thumbnailUrl: null
      }
    ],
    buttonRows: buildSimulatorCreatorSummaryButtons(state)
  }
}

export function buildSimulatorAudienceInvitePreview(
  draft: SimulatedScenarioDraft,
  state: SimulatedLifecycleState
): SimulatorDebugDmPreview {
  const isEnded = state.stage === 'ended'

  return {
    content: state.stage === 'scheduled'
      ? `🎮 ${draft.creatorName} scheduled ${draft.gameTitle}`
      : `🎮 ${draft.creatorName} wants to play ${draft.gameTitle}`,
    embeds: [
      {
        title: null,
        description: draft.note.trim().length > 0 ? draft.note.trim() : 'No note set for this simulated session.',
        color: state.stage === 'confirmed' || state.stage === 'check-in' ? 0x22c55e : isEnded ? 0xef4444 : 0x5865f2,
        fields: [
          {
            name: 'Creator',
            value: `@${draft.creatorName}`,
            inline: false
          },
          {
            name: 'Games',
            value: draft.gameTitle,
            inline: false
          },
          {
            name: 'Timing',
            value: buildSimulatorTimingLabel(draft, state),
            inline: false
          },
          {
            name: 'Audience',
            value: buildSimulatorAudienceFieldValue(draft.audienceName),
            inline: false
          },
          {
            name: 'Interest',
            value: buildInterestFieldValue(draft.audienceName, state.audienceResponse),
            inline: false
          },
          {
            name: 'Note',
            value: draft.note.trim().length > 0 ? draft.note.trim() : 'No note.',
            inline: false
          }
        ],
        footerText: 'Respond from the buttons below or open the app.',
        imageUrl: null,
        thumbnailUrl: null
      }
    ],
    buttonRows: isEnded ? [] : buildSimulatorAudienceActionButtons(draft, state)
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

function buildSimulatorUpdatedReplyPreview(updatedFields: string[]): SimulatorDebugDmPreview {
  return {
    content: buildSimulatorPlainMessage(
      'ℹ️ Call Updated',
      updatedFields.map(formatSimulatedUpdatedFieldChange),
      'The original invite above now shows the latest details.'
    ),
    embeds: [],
    buttonRows: []
  }
}

export function buildSimulatorAudienceFollowUpPreview(
  draft: SimulatedScenarioDraft,
  state: SimulatedLifecycleState
): SimulatorDebugDmPreview | null {
  if (state.stage === 'ended') {
    if (state.audienceResponse != null) {
      return null
    }

    return {
      content: buildSimulatorPlainMessage(
        '🛑 Call Ended',
        ['This call to play ended.'],
        'Open the app if you still want to coordinate or post your own call to play.'
      ),
      embeds: [],
      buttonRows: []
    }
  }

  if (state.latestAudienceUpdateFields && state.latestAudienceUpdateFields.length > 0) {
    return buildSimulatorUpdatedReplyPreview(state.latestAudienceUpdateFields)
  }

  if ((state.stage === 'scheduled' || state.stage === 'check-in') && state.audienceResponse == null) {
    return null
  }

  if (state.stage === 'confirmed') {
    if (!state.hasGoTimeBroadcast) {
      if (state.audienceResponse == null) {
        return null
      }

      return {
        content: state.audienceResponse === 'interested'
          ? buildSimulatorPlainMessage(
              '✅ You\'re In',
              [`You are marked as interested. ${draft.creatorName} has been notified.`],
              'If you change your mind you can switch to "Pass" later.'
            )
          : buildSimulatorPlainMessage(
              '👍 Passed for Now',
              [
                'You are marked as passing for now.',
                'Passing is anonymous.'
              ],
              'If you change your mind you can switch to "I\'m interested" later.'
            ),
        embeds: [],
        buttonRows: []
      }
    }

    if (state.audienceResponse === 'interested') {
      return {
        content: buildSimulatorPlainMessage(
          '🎮 Go Time',
          [
            `${draft.creatorName} confirmed the session is starting now.`,
            'The original invite above has the full details.'
          ]
        ),
        embeds: [],
        buttonRows: []
      }
    }

    if (state.audienceResponse === 'pass') {
      return {
        content: buildSimulatorPlainMessage(
          '👍 Passed for Now',
          [
            'You are marked as passing for now.',
            'Passing is anonymous.'
          ],
          'If you change your mind you can switch to "I\'m interested" later.'
        ),
        embeds: [],
        buttonRows: []
      }
    }

    return {
      content: buildSimulatorPlainMessage(
        '⏰ Go Time',
        [
          `${draft.creatorName} confirmed this session is still on.`,
          'Use the buttons below if you want in.'
        ],
        'The original invite above has the full details.'
      ),
      embeds: [],
      buttonRows: []
    }
  }

  return {
    content: state.audienceResponse === 'interested'
      ? buildSimulatorPlainMessage(
          '✅ You\'re In',
          [`You are marked as interested. ${draft.creatorName} has been notified.`],
          'If you change your mind you can switch to "Pass" later.'
        )
      : buildSimulatorPlainMessage(
          '👍 Passed for Now',
          [
            'You are marked as passing for now.',
            'Passing is anonymous.'
          ],
          'If you change your mind you can switch to "I\'m interested" later.'
        ),
    embeds: [],
    buttonRows: []
  }
}

export function buildSimulatorCreatorCheckInPreview(
  draft: SimulatedScenarioDraft,
  state: SimulatedLifecycleState
): SimulatorDebugDmPreview | null {
  if (!state.creatorCheckInState || state.stage === 'ended') {
    return null
  }

  if (state.creatorCheckInState === 'confirmed') {
    return {
      content: buildSimulatorPlainMessage(
        '✅ Call Confirmed',
        [
          'I let everyone know your call to play is still on.',
          'I reminded anyone who had not answered yet.'
        ]
      ),
      embeds: [],
      buttonRows: []
    }
  }

  if (state.creatorCheckInState === 'canceled') {
    return {
      content: buildSimulatorPlainMessage(
        '🛑 Call Ended',
        [
          'I ended this call to play.',
          'I let your audience know it ended.'
        ]
      ),
      embeds: [],
      buttonRows: []
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
            value: 'Confirm if it is still on, or end the call if plans changed.',
            inline: false
          }
        ],
        footerText: 'Use the buttons below for the fastest response.',
        imageUrl: null,
        thumbnailUrl: null
      }
    ],
    buttonRows: buildSimulatorCreatorCheckInButtons()
  }
}

export function buildSimulatorCreatorFollowUpPreview(
  draft: SimulatedScenarioDraft,
  state: SimulatedLifecycleState
): SimulatorDebugDmPreview | null {
  if (state.audienceResponse == null || state.stage === 'ended') {
    return null
  }

  return {
    content: buildSimulatorPlainMessage(
      state.audienceResponse === 'interested' ? 'Someone is interested' : 'Someone passed',
      [
        state.audienceResponse === 'interested'
          ? `@${draft.audienceName} is interested in playing ${draft.gameTitle}.`
          : `@${draft.audienceName} passed on ${draft.gameTitle}.`
      ]
    ),
    embeds: [],
    buttonRows: []
  }
}

export function buildSimulatedDmMessages(
  draft: SimulatedScenarioDraft,
  state: SimulatedLifecycleState
): {
  creatorMessages: SimulatedDmMessage[];
  audienceMessages: SimulatedDmMessage[];
} {
  const creatorMessages: SimulatedDmMessage[] = [
    {
      id: 'creator-summary',
      label: 'Creator retained summary',
      preview: buildSimulatorCreatorSummaryPreview(draft, state),
      explanation: [
        'This stays as the main creator control surface and updates in place across the simulated lifecycle.',
        'The separate creator reply below should only carry audience-change notifications, not duplicate this summary.'
      ],
      isInteractive: true
    }
  ]

  const creatorCheckInPreview = buildSimulatorCreatorCheckInPreview(draft, state)

  if (creatorCheckInPreview) {
    creatorMessages.push({
      id: 'creator-check-in',
      label: state.creatorCheckInState === 'pending' ? 'Creator go-time check-in' : 'Creator resolved check-in',
      preview: creatorCheckInPreview,
      explanation: [
        'This appears when a scheduled start time is reached before the creator has confirmed the session is still on.',
        'The prompt itself edits in place to a resolved state once the creator confirms or ends the call.'
      ],
      isInteractive: state.creatorCheckInState === 'pending'
    })
  }

  const creatorFollowUpPreview = buildSimulatorCreatorFollowUpPreview(draft, state)

  if (creatorFollowUpPreview) {
    creatorMessages.push({
      id: 'creator-follow-up',
      label: state.stage === 'confirmed' ? 'Creator audience status reply' : 'Creator interest notification',
      preview: creatorFollowUpPreview,
      explanation: [
        'This is the creator-side per-audience status reply, such as “Someone is interested” or “Someone passed.”',
        'Quiet recovery can reuse the same message, but flips between interested and pass should be treated as a fresh creator notification so Discord notifies the creator again. It disappears once the call ends while the retained summary above remains.'
      ],
      isInteractive: false
    })
  }

  const audienceMessages: SimulatedDmMessage[] = [
    {
      id: 'audience-anchor',
      label: 'Audience invite anchor',
      preview: buildSimulatorAudienceInvitePreview(draft, state),
      explanation: [
        'This is the original invite anchor and should remain present for the whole lifecycle.',
        'Response changes should update this message in place rather than replacing it with acknowledgement-only copy.'
      ],
      isInteractive: true
    }
  ]

  const followUpPreview = buildSimulatorAudienceFollowUpPreview(draft, state)

  if (followUpPreview) {
    audienceMessages.push({
      id: 'audience-follow-up',
      label: state.latestAudienceUpdateFields && state.latestAudienceUpdateFields.length > 0
        ? 'Audience update reply'
        : state.stage === 'confirmed'
          ? 'Audience follow-up reply'
          : 'Audience acknowledgement reply',
      preview: followUpPreview,
      explanation: [
        'This is one retained audience-side reply slot beneath the original invite.',
        'Meaningful call edits or go-time reminders can replace this slot with a fresh reply, while quieter lifecycle changes can edit it in place. If the call ends before the recipient answers, this becomes the ended notice; otherwise the invite above carries the ended state on its own.'
      ],
      isInteractive: state.stage === 'confirmed' && state.audienceResponse !== 'pass'
    })
  }

  return {
    creatorMessages,
    audienceMessages
  }
}