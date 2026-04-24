/**
 * Drives the in-app debug DM lifecycle simulator on the admin debug page.
 *
 * Holds the simulated state machine inputs (recipient response, prompt
 * confirmation, scheduled check-in, archive cleanup) and produces the same
 * payloads the live bot would emit by delegating to the shared simulator in
 * `@game-is-up/shared`. Used to inspect message rendering without firing
 * real Discord traffic.
 */

import { useEffect, useState } from 'react'
import type {
  SimulatedAutoPlayPromptDraft,
  SimulatedDmMessage,
  SimulatedLifecycleEntryWithAction,
  SimulatedScenarioDraft,
  SimulatedScenarioKind,
  SimulatedSimulatorStartMode
} from '@game-is-up/shared'
import {
  applyAutoPlayObservationEnded,
  applyAutoPlayPreviewAction,
  applyScheduledStartReached,
  applySimulatorPreviewAction,
  applySimulatorScenarioChanges,
  areAutoPlayDraftsEqual,
  areSimulatorDraftsEqual,
  buildInitialAutoPlayDialogState,
  buildInitialSimulatorDialogState,
  buildSimulatedCallToPlayMessagesForHistory,
  buildSimulatedThreadMessageMetaById,
  buildSimulatedAutoPlayDmMessages,
  buildSimulatedDmMessages,
  cloneSimulatorDraft,
  normalizeSimulatorRecipientCount,
  orderSimulatedThreadMessages,
  resolveSimulatorUpdatedFields,
  type SimulatedAutoPlayStateWithActions,
  type SimulatedLifecycleStateWithActions
} from '@game-is-up/shared'

type SimulatorThreadViewModel = {
  title: string;
  badgeColor: 'primary' | 'success';
  badgeLabel: string;
  infoLines: string[];
  emptyTitle: string;
  emptyBody: string;
  messages: SimulatedDmMessage[];
}

type UseDmLifecycleSimulatorOptions = {
  open: boolean;
  onClose: () => void;
  defaultSimulatorDraft: SimulatedScenarioDraft;
  defaultAutoPlayDraft: SimulatedAutoPlayPromptDraft;
}

export function useDmLifecycleSimulator(options: UseDmLifecycleSimulatorOptions) {
  const { open, onClose, defaultSimulatorDraft, defaultAutoPlayDraft } = options
  const [scenarioKind, setScenarioKind] = useState<SimulatedScenarioKind>('call-to-play')
  const [draft, setDraft] = useState<SimulatedScenarioDraft>(() => cloneSimulatorDraft(defaultSimulatorDraft))
  const [committedDraft, setCommittedDraft] = useState<SimulatedScenarioDraft | null>(null)
  const [state, setState] = useState<SimulatedLifecycleStateWithActions | null>(null)
  const [autoPlayDraft, setAutoPlayDraft] = useState<SimulatedAutoPlayPromptDraft>(() => cloneSimulatorDraft(defaultAutoPlayDraft))
  const [committedAutoPlayDraft, setCommittedAutoPlayDraft] = useState<SimulatedAutoPlayPromptDraft | null>(null)
  const [autoPlayState, setAutoPlayState] = useState<SimulatedAutoPlayStateWithActions | null>(null)

  const resetState = () => {
    setScenarioKind('call-to-play')
    setDraft(cloneSimulatorDraft(defaultSimulatorDraft))
    setCommittedDraft(null)
    setState(null)
    setAutoPlayDraft(cloneSimulatorDraft(defaultAutoPlayDraft))
    setCommittedAutoPlayDraft(null)
    setAutoPlayState(null)
  }

  useEffect(() => {
    if (open) {
      return
    }

    setScenarioKind('call-to-play')
    setDraft(cloneSimulatorDraft(defaultSimulatorDraft))
    setCommittedDraft(null)
    setState(null)
    setAutoPlayDraft(cloneSimulatorDraft(defaultAutoPlayDraft))
    setCommittedAutoPlayDraft(null)
    setAutoPlayState(null)
  }, [defaultAutoPlayDraft, defaultSimulatorDraft, open])

  const startSimulation = (mode: SimulatedSimulatorStartMode) => {
    setScenarioKind('call-to-play')
    const nextDraft = cloneSimulatorDraft(draft)
    setCommittedDraft(nextDraft)
    setState(buildInitialSimulatorDialogState({
      mode,
      draft: nextDraft
    }))
    setCommittedAutoPlayDraft(null)
    setAutoPlayState(null)
  }

  const startAutoPlaySimulation = () => {
    setScenarioKind('auto-play-prompt')
    const nextDraft = cloneSimulatorDraft(autoPlayDraft)
    setCommittedAutoPlayDraft(nextDraft)
    setAutoPlayState(buildInitialAutoPlayDialogState({
      draft: nextDraft
    }))
    setCommittedDraft(null)
    setState(null)
  }

  const handleScenarioFieldChange = (field: keyof SimulatedScenarioDraft, value: string) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      [field]: value
    }))
  }

  const handleAutoPlayFieldChange = (
    field: keyof SimulatedAutoPlayPromptDraft,
    value: string
  ) => {
    setAutoPlayDraft((currentDraft) => {
      if (field === 'friendRecipientCount' || field === 'networkRecipientCount') {
        return {
          ...currentDraft,
          [field]: normalizeSimulatorRecipientCount(Number(value))
        }
      }

      return {
        ...currentDraft,
        [field]: value
      }
    })
  }

  const handleScenarioKindChange = (nextScenarioKind: SimulatedScenarioKind) => {
    if (nextScenarioKind === scenarioKind) {
      return
    }

    setScenarioKind(nextScenarioKind)
    setCommittedDraft(null)
    setState(null)
    setCommittedAutoPlayDraft(null)
    setAutoPlayState(null)
  }

  const applyScenarioChanges = () => {
    if (!state || !committedDraft) {
      return
    }

    const nextDraft = cloneSimulatorDraft(draft)

    setState((currentState) => {
      if (!currentState) {
        return currentState
      }

      return applySimulatorScenarioChanges(currentState, committedDraft, nextDraft)
    })

    setCommittedDraft(nextDraft)
  }

  const handleScheduledStartReached = () => {
    setState((currentState) => {
      if (!currentState || !committedDraft) {
        return currentState
      }

      return applyScheduledStartReached(currentState, committedDraft)
    })
  }

  const handleAutoPlayObservationEnded = () => {
    setAutoPlayState((currentState) => {
      if (!currentState || !committedAutoPlayDraft) {
        return currentState
      }

      return applyAutoPlayObservationEnded(currentState, committedAutoPlayDraft)
    })
  }

  const handlePreviewButtonClick = (customId: string) => {
    if (scenarioKind === 'call-to-play') {
      setState((currentState) => {
        if (!currentState || !committedDraft) {
          return currentState
        }

        return applySimulatorPreviewAction(currentState, customId, committedDraft)
      })

      return
    }

    setAutoPlayState((currentState) => {
      if (!currentState || !committedAutoPlayDraft) {
        return currentState
      }

      return applyAutoPlayPreviewAction(currentState, customId, committedAutoPlayDraft)
    })
  }

  const hasCtpScenario = state != null && committedDraft != null
  const hasAutoPlayScenario = autoPlayState != null && committedAutoPlayDraft != null
  const hasScenario = scenarioKind === 'call-to-play' ? hasCtpScenario : hasAutoPlayScenario
  const pendingUpdatedFields = committedDraft ? resolveSimulatorUpdatedFields(committedDraft, draft) : []
  const hasDraftChanges = committedDraft ? !areSimulatorDraftsEqual(draft, committedDraft) : false
  const hasAutoPlayDraftChanges = committedAutoPlayDraft ? !areAutoPlayDraftsEqual(autoPlayDraft, committedAutoPlayDraft) : false
  const activeHistory = scenarioKind === 'call-to-play' ? state?.history ?? [] : autoPlayState?.history ?? []
  const chronologicalActiveHistory = [...activeHistory].reverse()
  const ctpMessages = hasCtpScenario
    ? chronologicalActiveHistory.length > 0
      ? buildSimulatedCallToPlayMessagesForHistory(chronologicalActiveHistory as SimulatedLifecycleEntryWithAction[])
      : buildSimulatedDmMessages(committedDraft, state)
    : { creatorMessages: [], audienceMessages: [] }
  const autoPlayMessages = hasAutoPlayScenario
    ? buildSimulatedAutoPlayDmMessages(committedAutoPlayDraft, autoPlayState)
    : { promptMessages: [], createdCallMessages: [] }
  const threadMessageMetaById = activeHistory.length > 0 ? buildSimulatedThreadMessageMetaById(activeHistory) : {}
  const orderedCreatorMessages = orderSimulatedThreadMessages(ctpMessages.creatorMessages, threadMessageMetaById)
  const orderedAudienceMessages = orderSimulatedThreadMessages(ctpMessages.audienceMessages, threadMessageMetaById)
  const orderedPromptMessages = orderSimulatedThreadMessages(autoPlayMessages.promptMessages, threadMessageMetaById)
  const orderedCreatedCallMessages = orderSimulatedThreadMessages(autoPlayMessages.createdCallMessages, threadMessageMetaById)

  const primaryThread: SimulatorThreadViewModel = scenarioKind === 'call-to-play'
    ? {
        title: 'Creator thread',
        badgeColor: 'primary',
        badgeLabel: committedDraft?.creatorName ?? 'Creator',
        infoLines: [
          'The creator keeps one retained summary message that updates in place.',
          'Scheduled calls can also produce a separate go-time check-in prompt before the creator confirms the session is still on.',
          'Separate creator replies should only announce audience changes such as interest or pass.'
        ],
        emptyTitle: state?.creatorThreadArchived ? 'Creator thread archived' : 'No creator thread yet',
        emptyBody: state?.creatorThreadArchived
          ? 'The creator archived only their retained summary thread. The audience thread can remain until it is archived separately.'
          : 'Start a scenario to generate the retained creator summary, check-in prompt, and follow-up messages.',
        messages: orderedCreatorMessages
      }
    : {
        title: 'Prompt thread',
        badgeColor: 'primary',
        badgeLabel: committedAutoPlayDraft?.creatorName ?? 'Observed player',
        infoLines: [
          'The original auto-play prompt is the retained anchor for the prompt flow.',
          'Picking a duration edits that anchor into the audience step instead of sending a separate second prompt.',
          'Closed prompt outcomes keep the anchor in place and explain the stop reason in a reply underneath it.'
        ],
        emptyTitle: 'No prompt thread yet',
        emptyBody: 'Start an auto-play prompt to generate the retained prompt anchor and any closeout reply.',
        messages: orderedPromptMessages
      }

  const secondaryThread: SimulatorThreadViewModel = scenarioKind === 'call-to-play'
    ? {
        title: 'Audience thread',
        badgeColor: 'success',
        badgeLabel: committedDraft?.audienceName ?? 'Audience',
        infoLines: [
          'The invite stays as the anchor for the whole audience lifecycle.',
          'Meaningful call edits add fresh “Call Updated” replies under the invite while the acknowledgement reply remains separate.',
          'The acknowledgement and go-time reply should stay retained, while update replies stack as a trail beneath the anchor.'
        ],
        emptyTitle: state?.audienceThreadArchived ? 'Audience thread archived' : 'No audience thread yet',
        emptyBody: state?.audienceThreadArchived
          ? 'The audience archived only their invite thread. The creator summary can remain until it is archived separately.'
          : 'Start a scenario to generate the invite anchor and any audience follow-up replies.',
        messages: orderedAudienceMessages
      }
    : {
        title: 'Created call thread',
        badgeColor: 'success',
        badgeLabel: committedAutoPlayDraft?.creatorName ?? 'Creator',
        infoLines: [
          'Accepting the prompt hands off to the normal creator summary thread for the newly created call to play.',
          'From that handoff onward, the creator summary becomes the retained cleanup anchor instead of the original prompt DM.'
        ],
        emptyTitle: 'No created call yet',
        emptyBody: 'Choose a duration and audience from the prompt thread to hand off into a live creator summary.',
        messages: orderedCreatedCallMessages
      }

  const handleClose = () => {
    resetState()
    onClose()
  }

  return {
    activeHistory,
    applyScenarioChanges,
    autoPlayDraft,
    autoPlayState,
    draft,
    handleAutoPlayFieldChange,
    handleAutoPlayObservationEnded,
    handleClose,
    handlePreviewButtonClick,
    handleScenarioFieldChange,
    handleScenarioKindChange,
    handleScheduledStartReached,
    hasAutoPlayDraftChanges,
    hasAutoPlayScenario,
    hasCtpScenario,
    hasDraftChanges,
    hasScenario,
    pendingUpdatedFields,
    primaryThread,
    scenarioKind,
    secondaryThread,
    startAutoPlaySimulation,
    startSimulation,
    state,
    threadMessageMetaById
  }
}