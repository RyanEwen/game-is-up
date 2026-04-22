import {
  buildSimulatedAutoPlayDmMessages,
  buildSimulatedDmMessages,
  buildSimulatorUpdatedReplyPreview,
  type SimulatedDmMessage
} from './debug-dm-simulator.js'
import {
  type SimulatedAutoPlayAction,
  type SimulatedAutoPlayPromptSnapshot,
  type SimulatedLifecycleAction,
  type SimulatedLifecycleEntryWithAction,
  type SimulatedLifecycleSnapshot,
  type SimulatedScenarioHistoryEntry,
  type SimulatedScenarioKind
} from './debug-dm-simulator-state.js'

export type SimulatedThreadMessageMeta = {
  sentAt: string;
  editedAt: string | null;
}

export type SimulatedThreadMessageMetaById = Record<string, SimulatedThreadMessageMeta>

export function orderSimulatedThreadMessages(
  messages: SimulatedDmMessage[],
  messageMetaById: SimulatedThreadMessageMetaById
) {
  return messages
    .map((message, index) => ({
      message,
      index,
      sentAt: messageMetaById[message.id]?.sentAt ?? null
    }))
    .sort((left, right) => {
      if (left.sentAt && right.sentAt) {
        const leftTime = new Date(left.sentAt).getTime()
        const rightTime = new Date(right.sentAt).getTime()

        if (leftTime !== rightTime) {
          return leftTime - rightTime
        }
      } else if (left.sentAt) {
        return -1
      } else if (right.sentAt) {
        return 1
      }

      return left.index - right.index
    })
    .map((entry) => entry.message)
}

function buildSimulatedMessagePreviewFingerprint(message: SimulatedDmMessage) {
  return JSON.stringify({
    preview: message.preview,
    isInteractive: message.isInteractive ?? false
  })
}

function buildSimulatedAudienceUpdateReplyMessages(history: SimulatedLifecycleEntryWithAction[]) {
  const latestEntry = history[history.length - 1]

  if (!latestEntry || latestEntry.stateSnapshot.stage === 'ended' || latestEntry.stateSnapshot.audienceThreadArchived) {
    return []
  }

  return history
    .filter((entry) => entry.action === 'scenario-updated' && Boolean(entry.stateSnapshot.latestAudienceUpdateFields?.length))
    .map<SimulatedDmMessage>((entry) => ({
      id: `audience-update-${entry.id}`,
      label: 'Audience update reply',
      preview: buildSimulatorUpdatedReplyPreview(entry.stateSnapshot.latestAudienceUpdateFields ?? [], {
        requiresFreshResponse: entry.stateSnapshot.latestAudienceUpdateRequiresFreshResponse
      }),
      explanation: [
        'Meaningful call edits add fresh update replies beneath the invite instead of overwriting the audience acknowledgement message.',
        'Each update reply stays in the thread as a trail of changes while the invite above keeps the latest details.'
      ],
      isInteractive: false
    }))
}

export function buildSimulatedCallToPlayMessagesForHistory(history: SimulatedLifecycleEntryWithAction[]) {
  const latestEntry = history[history.length - 1]

  if (!latestEntry) {
    return {
      creatorMessages: [],
      audienceMessages: []
    }
  }

  const messages = buildSimulatedDmMessages(
    latestEntry.draftSnapshot,
    {
      ...latestEntry.stateSnapshot,
      latestAudienceUpdateFields: latestEntry.stateSnapshot.latestAudienceUpdateFields
        ? [...latestEntry.stateSnapshot.latestAudienceUpdateFields]
        : null,
      history: [],
      nextEntryId: 0
    }
  )

  return {
    ...messages,
    audienceMessages: [...messages.audienceMessages, ...buildSimulatedAudienceUpdateReplyMessages(history)]
  }
}

function buildSimulatedMessagesForHistory(history: SimulatedScenarioHistoryEntry[]) {
  const latestEntry = history[history.length - 1]

  if (!latestEntry) {
    return []
  }

  if (latestEntry.scenarioKind === 'call-to-play') {
    const messages = buildSimulatedCallToPlayMessagesForHistory(history as SimulatedLifecycleEntryWithAction[])

    return [...messages.creatorMessages, ...messages.audienceMessages]
  }

  const messages = buildSimulatedAutoPlayDmMessages(
    latestEntry.draftSnapshot,
    {
      ...latestEntry.stateSnapshot,
      history: [],
      nextEntryId: 0
    }
  )

  return [...messages.promptMessages, ...messages.createdCallMessages]
}

function shouldTreatSimulatorMessageChangeAsReplacement(options: {
  scenarioKind: SimulatedScenarioKind;
  messageId: string;
  action: SimulatedLifecycleAction | SimulatedAutoPlayAction;
  previousState: SimulatedLifecycleSnapshot | SimulatedAutoPlayPromptSnapshot;
  nextState: SimulatedLifecycleSnapshot | SimulatedAutoPlayPromptSnapshot;
}) {
  if (options.scenarioKind !== 'call-to-play') {
    return false
  }

  const previousState = options.previousState as SimulatedLifecycleSnapshot
  const nextState = options.nextState as SimulatedLifecycleSnapshot

  if (options.messageId !== 'creator-follow-up') {
    if (options.messageId === 'audience-follow-up') {
      if (
        (options.action === 'creator-start-now' || options.action === 'creator-check-in-confirmed')
        && nextState.stage === 'confirmed'
        && nextState.audienceResponse !== 'pass'
      ) {
        return true
      }
    }

    return false
  }

  if (options.action !== 'audience-interested' && options.action !== 'audience-pass') {
    return false
  }

  return previousState.audienceResponse != null
    && nextState.audienceResponse != null
    && previousState.audienceResponse !== nextState.audienceResponse
}

export function buildSimulatedThreadMessageMetaById(
  history: SimulatedScenarioHistoryEntry[]
): SimulatedThreadMessageMetaById {
  const chronologicalHistory = [...history].reverse()

  if (chronologicalHistory.length === 0) {
    return {}
  }

  let previousEntry = chronologicalHistory[0]!
  const initialMessages = buildSimulatedMessagesForHistory([previousEntry])
  let previousMessageFingerprints = new Map<string, string>(
    initialMessages.map((message) => [message.id, buildSimulatedMessagePreviewFingerprint(message)])
  )

  const messageMetaById: SimulatedThreadMessageMetaById = {}
  const initialOccurredAt = chronologicalHistory[0]!.occurredAt

  for (const messageId of previousMessageFingerprints.keys()) {
    messageMetaById[messageId] = {
      sentAt: initialOccurredAt,
      editedAt: null
    }
  }

  for (let index = 1; index < chronologicalHistory.length; index += 1) {
    const entry = chronologicalHistory[index]!
    const nextMessages = buildSimulatedMessagesForHistory(chronologicalHistory.slice(0, index + 1))
    const nextMessageFingerprints = new Map<string, string>(
      nextMessages.map((message) => [message.id, buildSimulatedMessagePreviewFingerprint(message)])
    )

    for (const [messageId, fingerprint] of nextMessageFingerprints.entries()) {
      const previousFingerprint = previousMessageFingerprints.get(messageId)

      if (!previousFingerprint) {
        messageMetaById[messageId] = {
          sentAt: entry.occurredAt,
          editedAt: null
        }
        continue
      }

      if (previousFingerprint !== fingerprint) {
        if (shouldTreatSimulatorMessageChangeAsReplacement({
          scenarioKind: entry.scenarioKind,
          messageId,
          action: entry.action,
          previousState: previousEntry.stateSnapshot,
          nextState: entry.stateSnapshot
        })) {
          messageMetaById[messageId] = {
            sentAt: entry.occurredAt,
            editedAt: null
          }
          continue
        }

        messageMetaById[messageId] = {
          sentAt: messageMetaById[messageId]?.sentAt ?? entry.occurredAt,
          editedAt: entry.occurredAt
        }
      }
    }

    previousEntry = entry
    previousMessageFingerprints = nextMessageFingerprints
  }

  return messageMetaById
}