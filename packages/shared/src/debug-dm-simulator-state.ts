/** Owns simulated response transitions and snapshots; unchanged delay estimates stay quiet. */
import { formatRunningLateLabel, runningLateMinutesSchema } from './running-late.js'
import type { PlayIntentUpdatedField } from './play-intent-update-effects.js'
import {
  buildInitialAutoPlayPromptHistory,
  buildInitialSimulatorHistory,
  buildSimulatorAutoPlayClosedReason,
  formatSimulatorDurationLabel,
  simulatedAutoPlayDmActionIds,
  simulatedDmActionIds,
  type SimulatedAutoPlayPromptDraft,
  type SimulatedAutoPlayPromptState,
  type SimulatedLifecycleEntry,
  type SimulatedLifecycleState,
  type SimulatedScenarioDraft
} from './debug-dm-simulator.js'
import {
  buildPlayIntentUpdatedFieldsSummary,
  resolvePlayIntentUpdatedFields,
  shouldInvalidatePlayIntentAudienceResponse
} from './play-intent-update-effects.js'

export type SimulatedLifecycleAction =
  | 'session-created'
  | 'scenario-updated'
  | 'scheduled-start-reached'
  | 'audience-interested'
  | 'audience-pass'
  | 'audience-running-late'
  | 'audience-mute'
  | 'creator-joined-voice'
  | 'audience-joined-voice'
  | 'creator-launched-game'
  | 'audience-launched-game'
  | 'creator-check-in-confirmed'
  | 'creator-start-now'
  | 'creator-end'
  | 'creator-archived'
  | 'audience-archived'

export type SimulatedAutoPlayAction =
  | 'session-created'
  | 'auto-play-composer-opened'
  | 'auto-play-duration-selected'
  | 'auto-play-audience-confirmed'
  | 'auto-play-declined'
  | 'auto-play-expired'
  | 'auto-play-archived'
  | 'creator-end'

export type SimulatedScenarioKind = 'call-to-play' | 'auto-play-prompt'

export type SimulatedLifecycleSnapshot = Omit<SimulatedLifecycleState, 'history' | 'nextEntryId'>
export type SimulatedAutoPlayPromptSnapshot = Omit<SimulatedAutoPlayPromptState, 'history' | 'nextEntryId'>

export type SimulatedLifecycleEntryWithAction = SimulatedLifecycleEntry & {
  scenarioKind: 'call-to-play';
  action: SimulatedLifecycleAction;
  draftSnapshot: SimulatedScenarioDraft;
  stateSnapshot: SimulatedLifecycleSnapshot;
}

export type SimulatedLifecycleStateWithActions = Omit<SimulatedLifecycleState, 'history'> & {
  history: SimulatedLifecycleEntryWithAction[];
}

export type SimulatedAutoPlayEntryWithAction = SimulatedLifecycleEntry & {
  scenarioKind: 'auto-play-prompt';
  action: SimulatedAutoPlayAction;
  draftSnapshot: SimulatedAutoPlayPromptDraft;
  stateSnapshot: SimulatedAutoPlayPromptSnapshot;
}

export type SimulatedAutoPlayStateWithActions = Omit<SimulatedAutoPlayPromptState, 'history'> & {
  history: SimulatedAutoPlayEntryWithAction[];
}

export type SimulatedScenarioHistoryEntry = SimulatedLifecycleEntryWithAction | SimulatedAutoPlayEntryWithAction
export type SimulatedSimulatorStartMode = 'scheduled' | 'live'

type SimulatedAutoPlayResolvedAction =
  | { action: 'auto-play-composer-opened' }
  | { action: 'auto-play-duration-selected'; durationMinutes: number }
  | { action: 'auto-play-audience-confirmed'; durationMinutes: number; notifyScope: 'friends-only' | 'network' }
  | { action: 'auto-play-declined' }
  | { action: 'auto-play-archived' }
  | { action: 'creator-end' }

type SimulatedPreviewLifecycleAction = Exclude<
  SimulatedLifecycleAction,
  'session-created' | 'scenario-updated' | 'scheduled-start-reached'
>

const simulatedLifecycleActionByCustomId = {
  [simulatedDmActionIds.creatorConfirmCheckIn]: 'creator-check-in-confirmed',
  [simulatedDmActionIds.audienceInterested]: 'audience-interested',
  [simulatedDmActionIds.audiencePass]: 'audience-pass',
  [simulatedDmActionIds.audienceRunningLate]: 'audience-running-late',
  [simulatedDmActionIds.audienceMute]: 'audience-mute',
  [simulatedDmActionIds.creatorStartNow]: 'creator-start-now',
  [simulatedDmActionIds.creatorEnd]: 'creator-end',
  [simulatedDmActionIds.creatorCleanup]: 'creator-archived',
  [simulatedDmActionIds.audienceCleanup]: 'audience-archived'
} as const satisfies Record<string, SimulatedPreviewLifecycleAction>

function normalizeSimulatorText(value: string) {
  return value.trim()
}

export function cloneSimulatorDraft<T extends SimulatedScenarioDraft | SimulatedAutoPlayPromptDraft>(draft: T): T {
  return {
    ...draft
  }
}

export function normalizeSimulatorRecipientCount(value: number) {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.max(0, Math.floor(value))
}

function snapshotSimulatorLifecycleState(
  state: SimulatedLifecycleState | Omit<SimulatedLifecycleStateWithActions, 'history'>
): SimulatedLifecycleSnapshot {
  return {
    stage: state.stage,
    audienceResponse: state.audienceResponse,
    audienceRunningLate: state.audienceRunningLate,
    audienceRunningLateMinutes: state.audienceRunningLateMinutes ?? null,
    creatorCheckInState: state.creatorCheckInState,
    hasGoTimeBroadcast: state.hasGoTimeBroadcast,
    hasVoiceChannelActivity: state.hasVoiceChannelActivity,
    hasGameLaunchActivity: state.hasGameLaunchActivity,
    latestAudienceUpdateFields: state.latestAudienceUpdateFields ? [...state.latestAudienceUpdateFields] : null,
    latestAudienceUpdateRequiresFreshResponse: state.latestAudienceUpdateRequiresFreshResponse,
    creatorThreadArchived: state.creatorThreadArchived,
    audienceThreadArchived: state.audienceThreadArchived
  }
}

function snapshotAutoPlayPromptState(
  state: SimulatedAutoPlayPromptState | Omit<SimulatedAutoPlayStateWithActions, 'history'>
): SimulatedAutoPlayPromptSnapshot {
  return {
    status: state.status,
    durationMinutes: state.durationMinutes,
    notifyScope: state.notifyScope,
    closedReason: state.closedReason
  }
}

export function areSimulatorDraftsEqual(left: SimulatedScenarioDraft, right: SimulatedScenarioDraft) {
  return normalizeSimulatorText(left.creatorName) === normalizeSimulatorText(right.creatorName)
    && normalizeSimulatorText(left.audienceName) === normalizeSimulatorText(right.audienceName)
    && normalizeSimulatorText(left.gameTitle) === normalizeSimulatorText(right.gameTitle)
    && normalizeSimulatorText(left.scheduledForLabel) === normalizeSimulatorText(right.scheduledForLabel)
    && normalizeSimulatorText(left.note) === normalizeSimulatorText(right.note)
}

export function areAutoPlayDraftsEqual(left: SimulatedAutoPlayPromptDraft, right: SimulatedAutoPlayPromptDraft) {
  return normalizeSimulatorText(left.creatorName) === normalizeSimulatorText(right.creatorName)
    && normalizeSimulatorText(left.gameTitle) === normalizeSimulatorText(right.gameTitle)
    && normalizeSimulatorRecipientCount(left.friendRecipientCount) === normalizeSimulatorRecipientCount(right.friendRecipientCount)
    && normalizeSimulatorRecipientCount(left.networkRecipientCount) === normalizeSimulatorRecipientCount(right.networkRecipientCount)
}

export function resolveSimulatorUpdatedFields(
  previousDraft: SimulatedScenarioDraft,
  nextDraft: SimulatedScenarioDraft
): PlayIntentUpdatedField[] {
  return resolvePlayIntentUpdatedFields(
    {
      timeKey: previousDraft.scheduledForLabel,
      gameSelectionKey: [previousDraft.gameTitle],
      note: previousDraft.note,
      audienceKey: [previousDraft.audienceName]
    },
    {
      timeKey: nextDraft.scheduledForLabel,
      gameSelectionKey: [nextDraft.gameTitle],
      note: nextDraft.note,
      audienceKey: [nextDraft.audienceName]
    }
  ).filter((field): field is PlayIntentUpdatedField => field !== 'temporary Discord channel')
}

export function buildInitialSimulatorDialogState(options: {
  now?: Date;
  mode?: SimulatedSimulatorStartMode;
  draft: SimulatedScenarioDraft;
}): SimulatedLifecycleStateWithActions {
  const draft = cloneSimulatorDraft(options.draft)
  const initialState = buildInitialSimulatorHistory({
    now: options.now,
    stage: options.mode === 'live' ? 'confirmed' : 'scheduled'
  })

  return {
    ...initialState,
    history: initialState.history.map((entry) => ({
      ...entry,
      scenarioKind: 'call-to-play' as const,
      action: 'session-created' as const,
      draftSnapshot: draft,
      stateSnapshot: snapshotSimulatorLifecycleState(initialState)
    }))
  }
}

export function buildInitialAutoPlayDialogState(options: {
  now?: Date;
  draft: SimulatedAutoPlayPromptDraft;
}): SimulatedAutoPlayStateWithActions {
  const draft = cloneSimulatorDraft(options.draft)
  const initialState = buildInitialAutoPlayPromptHistory({
    now: options.now
  })

  return {
    ...initialState,
    history: initialState.history.map((entry) => ({
      ...entry,
      scenarioKind: 'auto-play-prompt' as const,
      action: 'session-created' as const,
      draftSnapshot: draft,
      stateSnapshot: snapshotAutoPlayPromptState(initialState)
    }))
  }
}

function appendHistoryEntry<
  State extends { nextEntryId: number; history: HistoryEntry[] },
  Draft,
  Snapshot,
  HistoryEntry extends SimulatedLifecycleEntry & {
    scenarioKind: SimulatedScenarioKind;
    action: string;
    draftSnapshot: Draft;
    stateSnapshot: Snapshot;
  }
>(
  currentState: State,
  options: {
    scenarioKind: HistoryEntry['scenarioKind'];
    action: HistoryEntry['action'];
    actor: SimulatedLifecycleEntry['actor'];
    summary: string;
    nextState: Omit<State, 'history'>;
    draftSnapshot: Draft;
    occurredAt: string;
    cloneDraft: (draft: Draft) => Draft;
    snapshotState: (state: Omit<State, 'history'>) => Snapshot;
  }
): State {
  return {
    ...options.nextState,
    history: [
      {
        id: currentState.nextEntryId,
        actor: options.actor,
        scenarioKind: options.scenarioKind,
        action: options.action,
        summary: options.summary,
        occurredAt: options.occurredAt,
        draftSnapshot: options.cloneDraft(options.draftSnapshot),
        stateSnapshot: options.snapshotState(options.nextState)
      } as HistoryEntry,
      ...currentState.history
    ],
    nextEntryId: currentState.nextEntryId + 1
  } as State
}

function mapSimulatorCustomIdToAction(customId: string): SimulatedPreviewLifecycleAction | null {
  return simulatedLifecycleActionByCustomId[customId as keyof typeof simulatedLifecycleActionByCustomId] ?? null
}

function mapSimulatorCustomIdToAutoPlayAction(customId: string): SimulatedAutoPlayResolvedAction | null {
  if (customId === simulatedDmActionIds.creatorEnd) {
    return { action: 'creator-end' }
  }

  if (customId === simulatedAutoPlayDmActionIds.decline) {
    return { action: 'auto-play-declined' }
  }

  if (customId === simulatedAutoPlayDmActionIds.cleanup) {
    return { action: 'auto-play-archived' }
  }

  if (customId === simulatedAutoPlayDmActionIds.compose) {
    return { action: 'auto-play-composer-opened' }
  }

  const durationMatch = /^auto-play:[^:]+:duration:(\d+)$/.exec(customId)

  if (durationMatch) {
    return {
      action: 'auto-play-duration-selected',
      durationMinutes: Number(durationMatch[1])
    }
  }

  const confirmMatch = /^auto-play:[^:]+:confirm:(friends-only|network):(\d+)$/.exec(customId)

  if (confirmMatch) {
    const notifyScope = confirmMatch[1]
    const durationMinutes = Number(confirmMatch[2])

    if ((notifyScope !== 'friends-only' && notifyScope !== 'network') || Number.isNaN(durationMinutes)) {
      return null
    }

    return {
      action: 'auto-play-audience-confirmed',
      notifyScope,
      durationMinutes
    }
  }

  return null
}

function resolveSimulatorLifecycleTransition(
  currentState: SimulatedLifecycleState,
  action: Exclude<SimulatedLifecycleAction, 'session-created'>,
  draft: SimulatedScenarioDraft,
  runningLateMinutes: number | null
): {
  nextState: SimulatedLifecycleState;
  summary: string;
  actor: SimulatedLifecycleEntry['actor'];
} | null {
  let nextState: SimulatedLifecycleState = {
    ...currentState,
    latestAudienceUpdateFields: currentState.latestAudienceUpdateFields ? [...currentState.latestAudienceUpdateFields] : null
  }
  let summary: string | null = null
  let actor: SimulatedLifecycleEntry['actor'] = 'system'

  switch (action) {
    case 'scenario-updated':
    case 'scheduled-start-reached':
      return null
    case 'audience-interested':
      nextState = {
        ...nextState,
        audienceResponse: 'interested',
        audienceRunningLate: false,
        audienceRunningLateMinutes: null,
        latestAudienceUpdateFields: null,
        latestAudienceUpdateRequiresFreshResponse: false
      }
      actor = 'audience'
      summary = currentState.stage === 'confirmed'
        ? `${draft.audienceName} is in after go-time.`
        : `${draft.audienceName} is showing interest.`
      break
    case 'audience-pass':
      nextState = {
        ...nextState,
        audienceResponse: 'pass',
        audienceRunningLate: false,
        audienceRunningLateMinutes: null,
        latestAudienceUpdateFields: null,
        latestAudienceUpdateRequiresFreshResponse: false
      }
      actor = 'audience'
      summary = currentState.stage === 'confirmed'
        ? `${draft.audienceName} could not make it after the creator confirmed the session.`
        : `${draft.audienceName} can't make it.`
      break
    case 'audience-running-late':
      if (currentState.stage === 'ended' || currentState.audienceResponse !== 'interested'
        || (currentState.audienceRunningLate && (currentState.audienceRunningLateMinutes ?? null) === runningLateMinutes)) {
        return null
      }

      nextState = {
        ...nextState,
        audienceRunningLate: true,
        audienceRunningLateMinutes: runningLateMinutesSchema.parse(runningLateMinutes)
      }
      actor = 'audience'
      summary = `${draft.audienceName} is interested but ${formatRunningLateLabel(runningLateMinutes).toLowerCase()}.`
      break
    case 'audience-mute':
      actor = 'audience'
      summary = `${draft.audienceName} muted ${draft.creatorName} in the simulator.`
      break
    case 'creator-joined-voice':
      if (currentState.stage !== 'confirmed' || currentState.audienceResponse !== 'interested' || currentState.hasVoiceChannelActivity) {
        return null
      }

      nextState = {
        ...nextState,
        hasVoiceChannelActivity: true
      }
      actor = 'creator'
      summary = `${draft.creatorName} joined the voice channel.`
      break
    case 'audience-joined-voice':
      if (currentState.stage !== 'confirmed' || currentState.audienceResponse !== 'interested' || currentState.hasVoiceChannelActivity) {
        return null
      }

      nextState = {
        ...nextState,
        hasVoiceChannelActivity: true
      }
      actor = 'audience'
      summary = `${draft.audienceName} joined the voice channel.`
      break
    case 'creator-launched-game':
      if (currentState.stage !== 'confirmed' || currentState.audienceResponse !== 'interested' || currentState.hasGameLaunchActivity) {
        return null
      }

      nextState = {
        ...nextState,
        hasGameLaunchActivity: true
      }
      actor = 'creator'
      summary = `${draft.creatorName} launched ${draft.gameTitle}.`
      break
    case 'audience-launched-game':
      if (currentState.stage !== 'confirmed' || currentState.audienceResponse !== 'interested' || currentState.hasGameLaunchActivity) {
        return null
      }

      nextState = {
        ...nextState,
        hasGameLaunchActivity: true
      }
      actor = 'audience'
      summary = `${draft.audienceName} launched ${draft.gameTitle}.`
      break
    case 'creator-check-in-confirmed':
      if (currentState.stage !== 'check-in' || currentState.creatorCheckInState !== 'pending') {
        return null
      }

      nextState = {
        ...nextState,
        stage: 'confirmed',
        creatorCheckInState: 'confirmed',
        hasGoTimeBroadcast: true,
        latestAudienceUpdateFields: currentState.audienceResponse === 'pass'
          ? currentState.latestAudienceUpdateFields
          : null,
        latestAudienceUpdateRequiresFreshResponse: false
      }
      actor = 'creator'
      summary = `${draft.creatorName} confirmed the session is still on.`
      break
    case 'creator-start-now':
      if (currentState.stage !== 'scheduled') {
        return null
      }

      nextState = {
        ...nextState,
        stage: 'confirmed',
        creatorCheckInState: null,
        hasGoTimeBroadcast: true,
        latestAudienceUpdateFields: currentState.audienceResponse === 'pass'
          ? currentState.latestAudienceUpdateFields
          : null,
        latestAudienceUpdateRequiresFreshResponse: false
      }
      actor = 'creator'
      summary = `${draft.creatorName} started the session now.`
      break
    case 'creator-end':
      nextState = {
        ...nextState,
        stage: 'ended',
        creatorCheckInState: currentState.creatorCheckInState === 'pending'
          ? 'canceled'
          : currentState.creatorCheckInState,
        latestAudienceUpdateFields: null,
        latestAudienceUpdateRequiresFreshResponse: false
      }
      actor = 'creator'
      summary = `${draft.creatorName} ended the session.`
      break
    case 'creator-archived':
      if (currentState.stage !== 'ended' || currentState.creatorThreadArchived) {
        return null
      }

      nextState = {
        ...nextState,
        creatorThreadArchived: true,
        latestAudienceUpdateFields: null,
        latestAudienceUpdateRequiresFreshResponse: false
      }
      actor = 'creator'
      summary = `${draft.creatorName} archived the creator summary thread.`
      break
    case 'audience-archived':
      if (currentState.stage !== 'ended' || currentState.audienceThreadArchived) {
        return null
      }

      nextState = {
        ...nextState,
        audienceThreadArchived: true,
        latestAudienceUpdateFields: null,
        latestAudienceUpdateRequiresFreshResponse: false
      }
      actor = 'audience'
      summary = `${draft.audienceName} archived the audience invite thread.`
      break
  }

  if (summary == null) {
    return null
  }

  return {
    nextState,
    summary,
    actor
  }
}

function resolveAutoPlayPromptResolvedAction(
  currentState: SimulatedAutoPlayPromptState,
  resolvedAction: SimulatedAutoPlayResolvedAction,
  draft: SimulatedAutoPlayPromptDraft
): {
  nextState: SimulatedAutoPlayPromptState;
  summary: string;
  actor: SimulatedLifecycleEntry['actor'];
} | null {
  switch (resolvedAction.action) {
    case 'auto-play-composer-opened':
      if (currentState.status !== 'initial') {
        return null
      }
      return {
        nextState: { ...currentState, status: 'composing', durationMinutes: 60, notifyScope: 'friends-only', closedReason: null },
        summary: `${draft.creatorName} opened the full detected-game composer.`,
        actor: 'creator'
      }
    case 'auto-play-duration-selected':
      if (currentState.status !== 'initial') {
        return null
      }

      return {
        nextState: {
          ...currentState,
          status: 'audience',
          durationMinutes: resolvedAction.durationMinutes,
          notifyScope: null,
          closedReason: null
        },
        summary: `${draft.creatorName} picked a ${formatSimulatorDurationLabel(resolvedAction.durationMinutes)} auto-play window.`,
        actor: 'creator'
      }
    case 'auto-play-audience-confirmed':
      if ((currentState.status !== 'audience' && currentState.status !== 'composing') || currentState.durationMinutes !== resolvedAction.durationMinutes) {
        return null
      }

      return {
        nextState: {
          ...currentState,
          status: 'created',
          notifyScope: resolvedAction.notifyScope,
          closedReason: null
        },
        summary: resolvedAction.notifyScope === 'friends-only'
          ? `${draft.creatorName} created a friends-only call from the auto-play prompt.`
          : `${draft.creatorName} created a network call from the auto-play prompt.`,
        actor: 'creator'
      }
    case 'auto-play-declined':
      if (currentState.status !== 'initial' && currentState.status !== 'audience' && currentState.status !== 'composing') {
        return null
      }

      return {
        nextState: {
          ...currentState,
          status: 'declined',
          closedReason: 'The user declined the prompt from Discord.'
        },
        summary: `${draft.creatorName} declined the auto-play prompt.`,
        actor: 'creator'
      }
    case 'auto-play-archived':
      if (currentState.status !== 'declined' && currentState.status !== 'expired') {
        return null
      }

      return {
        nextState: {
          ...currentState,
          status: 'archived'
        },
        summary: `${draft.creatorName} archived the closed auto-play prompt.`,
        actor: 'creator'
      }
    case 'creator-end':
      if (currentState.status !== 'created') {
        return null
      }

      return {
        nextState: {
          ...currentState,
          status: 'created-ended'
        },
        summary: `${draft.creatorName} ended the call created from the auto-play prompt.`,
        actor: 'creator'
      }
  }
}

export function applySimulatorScenarioChanges(
  currentState: SimulatedLifecycleStateWithActions,
  previousDraft: SimulatedScenarioDraft,
  nextDraft: SimulatedScenarioDraft,
  now = new Date()
) {
  if (areSimulatorDraftsEqual(previousDraft, nextDraft)) {
    return currentState
  }

  const updatedFields = resolveSimulatorUpdatedFields(previousDraft, nextDraft)
  const shouldSendAudienceUpdateReply = updatedFields.length > 0 && currentState.stage !== 'ended' && !currentState.audienceThreadArchived
  const shouldResetAudienceResponse = shouldSendAudienceUpdateReply
    && shouldInvalidatePlayIntentAudienceResponse(updatedFields)
  const nextState: SimulatedLifecycleState = {
    ...currentState,
    audienceResponse: shouldResetAudienceResponse ? null : currentState.audienceResponse,
    latestAudienceUpdateRequiresFreshResponse: shouldResetAudienceResponse && currentState.audienceResponse != null,
    latestAudienceUpdateFields: shouldSendAudienceUpdateReply
      ? updatedFields
      : currentState.latestAudienceUpdateFields
  }

  return appendHistoryEntry(currentState, {
    scenarioKind: 'call-to-play',
    action: 'scenario-updated',
    actor: 'creator',
    summary: buildPlayIntentUpdatedFieldsSummary(updatedFields),
    nextState,
    draftSnapshot: nextDraft,
    occurredAt: now.toISOString(),
    cloneDraft: cloneSimulatorDraft,
    snapshotState: snapshotSimulatorLifecycleState
  })
}

export function applyScheduledStartReached(
  currentState: SimulatedLifecycleStateWithActions,
  draft: SimulatedScenarioDraft,
  now = new Date()
) {
  if (currentState.stage !== 'scheduled') {
    return currentState
  }

  return appendHistoryEntry(currentState, {
    scenarioKind: 'call-to-play',
    action: 'scheduled-start-reached',
    actor: 'system',
    summary: `${draft.creatorName}'s scheduled start time was reached.`,
    nextState: {
      ...currentState,
      stage: 'check-in',
      creatorCheckInState: 'pending'
    },
    draftSnapshot: draft,
    occurredAt: now.toISOString(),
    cloneDraft: cloneSimulatorDraft,
    snapshotState: snapshotSimulatorLifecycleState
  })
}

export function applySimulatorPreviewAction(
  currentState: SimulatedLifecycleStateWithActions,
  customId: string,
  draft: SimulatedScenarioDraft,
  now = new Date()
) {
  if (currentState.creatorThreadArchived && currentState.audienceThreadArchived) {
    return currentState
  }

  const action = mapSimulatorCustomIdToAction(customId)

  if (!action) {
    return currentState
  }

  return applySimulatorLifecycleAction(currentState, action, draft, now)
}

export function applySimulatorLifecycleAction(
  currentState: SimulatedLifecycleStateWithActions,
  action: SimulatedPreviewLifecycleAction,
  draft: SimulatedScenarioDraft,
  now = new Date(),
  runningLateMinutes: number | null = null
) {
  const transition = resolveSimulatorLifecycleTransition(currentState, action, draft, runningLateMinutes)

  if (!transition) {
    return currentState
  }

  return appendHistoryEntry(currentState, {
    scenarioKind: 'call-to-play',
    action,
    actor: transition.actor,
    summary: transition.summary,
    nextState: transition.nextState,
    draftSnapshot: draft,
    occurredAt: now.toISOString(),
    cloneDraft: cloneSimulatorDraft,
    snapshotState: snapshotSimulatorLifecycleState
  })
}

export function applyAutoPlayObservationEnded(
  currentState: SimulatedAutoPlayStateWithActions,
  draft: SimulatedAutoPlayPromptDraft,
  now = new Date()
) {
  if (currentState.status !== 'initial' && currentState.status !== 'audience' && currentState.status !== 'composing') {
    return currentState
  }

  return appendHistoryEntry(currentState, {
    scenarioKind: 'auto-play-prompt',
    action: 'auto-play-expired',
    actor: 'system',
    summary: `${draft.creatorName}'s observed ${draft.gameTitle} session ended before the auto-play prompt was finished.`,
    nextState: {
      ...currentState,
      status: 'expired',
      closedReason: buildSimulatorAutoPlayClosedReason(draft.gameTitle)
    },
    draftSnapshot: draft,
    occurredAt: now.toISOString(),
    cloneDraft: cloneSimulatorDraft,
    snapshotState: snapshotAutoPlayPromptState
  })
}

export function applyAutoPlayPreviewAction(
  currentState: SimulatedAutoPlayStateWithActions,
  customId: string,
  draft: SimulatedAutoPlayPromptDraft,
  now = new Date()
) {
  const action = mapSimulatorCustomIdToAutoPlayAction(customId)

  if (!action) {
    return currentState
  }

  const transition = resolveAutoPlayPromptResolvedAction(currentState, action, draft)

  if (!transition) {
    return currentState
  }

  return appendHistoryEntry(currentState, {
    scenarioKind: 'auto-play-prompt',
    action: action.action,
    actor: transition.actor,
    summary: transition.summary,
    nextState: transition.nextState,
    draftSnapshot: draft,
    occurredAt: now.toISOString(),
    cloneDraft: cloneSimulatorDraft,
    snapshotState: snapshotAutoPlayPromptState
  })
}
