import { useEffect, useState } from 'react'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import {
  Avatar,
  Box,
  Button,
  Card,
  Divider,
  Chip,
  DialogContent,
  DialogTitle,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  Link,
  Stack,
  Textarea,
  Typography
} from '@mui/joy'
import type {
  DebugDmActionResponse,
  DebugDmInboxMessage,
  DebugDmInboxParticipant,
  DebugDmPreview,
  DebugPlayIntentSummary,
  SimulatedLifecycleEntry,
  SimulatedLifecycleState,
  SimulatedScenarioDraft,
  SimulatedDmMessage
} from '@game-is-up/shared'
import {
  buildInitialSimulatorHistory,
  buildSimulatedDmMessages,
  formatSimulatorTimestamp,
  shouldInvalidatePlayIntentAudienceResponse,
  simulatedDmActionIds
} from '@game-is-up/shared'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import { DashboardModal } from '../components/dashboard/DashboardModal'
import { EmptyStateCard } from '../components/dashboard/EmptyStateCard'

type SimulatedLifecycleAction =
  | 'session-created'
  | 'scenario-updated'
  | 'scheduled-start-reached'
  | 'audience-interested'
  | 'audience-pass'
  | 'audience-mute'
  | 'creator-check-in-confirmed'
  | 'creator-start-now'
  | 'creator-end'

type SimulatedLifecycleSnapshot = Omit<SimulatedLifecycleState, 'history' | 'nextEntryId'>

type SimulatedLifecycleEntryWithAction = SimulatedLifecycleEntry & {
  action: SimulatedLifecycleAction;
  draftSnapshot: SimulatedScenarioDraft;
  stateSnapshot: SimulatedLifecycleSnapshot;
}

type SimulatedLifecycleStateWithActions = Omit<SimulatedLifecycleState, 'history'> & {
  history: SimulatedLifecycleEntryWithAction[];
}

type SimulatedSimulatorStartMode = 'scheduled' | 'live'

type SimulatedThreadMessageId = 'creator-summary' | 'creator-check-in' | 'creator-follow-up' | 'audience-anchor' | 'audience-follow-up'

type SimulatedThreadMessageMeta = {
  sentAt: string;
  editedAt: string | null;
}

type SimulatedThreadMessageMetaById = Partial<Record<SimulatedThreadMessageId, SimulatedThreadMessageMeta>>

function orderSimulatedThreadMessages(
  messages: SimulatedDmMessage[],
  messageMetaById: SimulatedThreadMessageMetaById
) {
  return messages
    .map((message, index) => ({
      message,
      index,
      sentAt: messageMetaById[message.id as SimulatedThreadMessageId]?.sentAt ?? null
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

const defaultSimulatorDraft: SimulatedScenarioDraft = {
  creatorName: 'Ryan',
  audienceName: 'Morgan',
  gameTitle: 'Helldivers 2',
  scheduledForLabel: 'Tonight at 8:30 PM',
  note: 'Hop in if you are free. I can start right away once someone is in.'
}

function cloneSimulatorDraft(draft: SimulatedScenarioDraft): SimulatedScenarioDraft {
  return {
    ...draft
  }
}

function cloneSimulatorLifecycleSnapshot(state: SimulatedLifecycleSnapshot): SimulatedLifecycleSnapshot {
  return {
    ...state,
    latestAudienceUpdateFields: state.latestAudienceUpdateFields ? [...state.latestAudienceUpdateFields] : null
  }
}

function snapshotSimulatorLifecycleState(state: SimulatedLifecycleState): SimulatedLifecycleSnapshot {
  return cloneSimulatorLifecycleSnapshot({
    stage: state.stage,
    audienceResponse: state.audienceResponse,
    creatorCheckInState: state.creatorCheckInState,
    hasGoTimeBroadcast: state.hasGoTimeBroadcast,
    latestAudienceUpdateFields: state.latestAudienceUpdateFields
  })
}

function materializeSimulatorLifecycleState(snapshot: SimulatedLifecycleSnapshot): SimulatedLifecycleState {
  return {
    ...cloneSimulatorLifecycleSnapshot(snapshot),
    history: [],
    nextEntryId: 0
  }
}

function normalizeSimulatorText(value: string) {
  return value.trim()
}

function areSimulatorDraftsEqual(left: SimulatedScenarioDraft, right: SimulatedScenarioDraft) {
  return normalizeSimulatorText(left.creatorName) === normalizeSimulatorText(right.creatorName)
    && normalizeSimulatorText(left.audienceName) === normalizeSimulatorText(right.audienceName)
    && normalizeSimulatorText(left.gameTitle) === normalizeSimulatorText(right.gameTitle)
    && normalizeSimulatorText(left.scheduledForLabel) === normalizeSimulatorText(right.scheduledForLabel)
    && normalizeSimulatorText(left.note) === normalizeSimulatorText(right.note)
}

function resolveSimulatorUpdatedFields(previousDraft: SimulatedScenarioDraft, nextDraft: SimulatedScenarioDraft) {
  const updatedFields: string[] = []

  if (normalizeSimulatorText(previousDraft.scheduledForLabel) !== normalizeSimulatorText(nextDraft.scheduledForLabel)) {
    updatedFields.push('time')
  }

  if (normalizeSimulatorText(previousDraft.gameTitle) !== normalizeSimulatorText(nextDraft.gameTitle)) {
    updatedFields.push('game selection')
  }

  if (normalizeSimulatorText(previousDraft.note) !== normalizeSimulatorText(nextDraft.note)) {
    updatedFields.push('note')
  }

  if (normalizeSimulatorText(previousDraft.audienceName) !== normalizeSimulatorText(nextDraft.audienceName)) {
    updatedFields.push('audience')
  }

  return updatedFields
}

function buildScenarioUpdateSummary(updatedFields: string[]) {
  return updatedFields.length > 0
    ? `Updated the call to play: ${updatedFields.join(', ')} changed.`
    : 'Updated the call to play details.'
}

function buildInitialSimulatorDialogState(options: {
  now?: Date;
  mode?: SimulatedSimulatorStartMode;
  draft?: SimulatedScenarioDraft;
} = {}): SimulatedLifecycleStateWithActions {
  const draft = cloneSimulatorDraft(options.draft ?? defaultSimulatorDraft)
  const initialState = buildInitialSimulatorHistory({
    now: options.now,
    stage: options.mode === 'live' ? 'confirmed' : 'scheduled'
  })

  return {
    ...initialState,
    history: initialState.history.map((entry) => ({
      ...entry,
      action: 'session-created' as const,
      draftSnapshot: draft,
      stateSnapshot: snapshotSimulatorLifecycleState(initialState)
    }))
  }
}

function mapSimulatorCustomIdToAction(customId: string): Exclude<SimulatedLifecycleAction, 'session-created'> | null {
  switch (customId) {
    case simulatedDmActionIds.creatorConfirmCheckIn:
      return 'creator-check-in-confirmed'
    case simulatedDmActionIds.audienceInterested:
      return 'audience-interested'
    case simulatedDmActionIds.audiencePass:
      return 'audience-pass'
    case simulatedDmActionIds.audienceMute:
      return 'audience-mute'
    case simulatedDmActionIds.creatorStartNow:
      return 'creator-start-now'
    case simulatedDmActionIds.creatorEnd:
      return 'creator-end'
    default:
      return null
  }
}

function resolveSimulatorLifecycleTransition(
  currentState: SimulatedLifecycleState,
  action: Exclude<SimulatedLifecycleAction, 'session-created'>,
  draft: SimulatedScenarioDraft
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
        latestAudienceUpdateFields: null
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
        latestAudienceUpdateFields: null
      }
      actor = 'audience'
      summary = currentState.stage === 'confirmed'
        ? `${draft.audienceName} passed after the creator confirmed the session.`
        : `${draft.audienceName} passed for now.`
      break
    case 'audience-mute':
      actor = 'audience'
      summary = `${draft.audienceName} muted ${draft.creatorName} in the simulator.`
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
          : null
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
          : null
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
        latestAudienceUpdateFields: null
      }
      actor = 'creator'
      summary = `${draft.creatorName} ended the session.`
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

function applySimulatorScenarioChanges(
  currentState: SimulatedLifecycleState,
  previousDraft: SimulatedScenarioDraft,
  nextDraft: SimulatedScenarioDraft
): {
  nextState: SimulatedLifecycleState;
  summary: string;
} | null {
  if (areSimulatorDraftsEqual(previousDraft, nextDraft)) {
    return null
  }

  const updatedFields = resolveSimulatorUpdatedFields(previousDraft, nextDraft)
  const shouldSendAudienceUpdateReply = updatedFields.length > 0 && currentState.stage !== 'ended'
  const shouldResetAudienceResponse = shouldSendAudienceUpdateReply
    && shouldInvalidatePlayIntentAudienceResponse(updatedFields)

  return {
    nextState: {
      ...currentState,
      audienceResponse: shouldResetAudienceResponse ? null : currentState.audienceResponse,
      latestAudienceUpdateFields: shouldSendAudienceUpdateReply
        ? updatedFields
        : currentState.latestAudienceUpdateFields
    },
    summary: buildScenarioUpdateSummary(updatedFields)
  }
}

function resolveScheduledStartReachedTransition(
  currentState: SimulatedLifecycleState,
  draft: SimulatedScenarioDraft
): {
  nextState: SimulatedLifecycleState;
  summary: string;
  actor: SimulatedLifecycleEntry['actor'];
} | null {
  if (currentState.stage !== 'scheduled') {
    return null
  }

  return {
    nextState: {
      ...currentState,
      stage: 'check-in',
      creatorCheckInState: 'pending'
    },
    summary: `${draft.creatorName}'s scheduled start time was reached.`,
    actor: 'system'
  }
}

function buildSimulatedMessagePreviewFingerprint(message: SimulatedDmMessage) {
  return JSON.stringify({
    preview: message.preview,
    isInteractive: message.isInteractive ?? false
  })
}

function shouldTreatSimulatorMessageChangeAsReplacement(options: {
  messageId: SimulatedThreadMessageId;
  action: SimulatedLifecycleAction;
  previousState: SimulatedLifecycleSnapshot;
  nextState: SimulatedLifecycleSnapshot;
}) {
  if (options.messageId !== 'creator-follow-up') {
    if (options.messageId === 'audience-follow-up') {
      if (options.action === 'scenario-updated' && Boolean(options.nextState.latestAudienceUpdateFields?.length)) {
        return true
      }

      if (
        (options.action === 'creator-start-now' || options.action === 'creator-check-in-confirmed')
        && options.nextState.stage === 'confirmed'
        && options.nextState.audienceResponse !== 'pass'
      ) {
        return true
      }
    }

    return false
  }

  if (options.action !== 'audience-interested' && options.action !== 'audience-pass') {
    return false
  }

  return options.previousState.audienceResponse != null
    && options.nextState.audienceResponse != null
    && options.previousState.audienceResponse !== options.nextState.audienceResponse
}

function buildSimulatedThreadMessageMetaById(
  history: SimulatedLifecycleEntryWithAction[]
): SimulatedThreadMessageMetaById {
  const chronologicalHistory = [...history].reverse()

  if (chronologicalHistory.length === 0) {
    return {}
  }

  let previousEntry = chronologicalHistory[0]!
  const initialMessages = buildSimulatedDmMessages(
    previousEntry.draftSnapshot,
    materializeSimulatorLifecycleState(previousEntry.stateSnapshot)
  )
  let previousMessageFingerprints = new Map<SimulatedThreadMessageId, string>([
    ...initialMessages.creatorMessages,
    ...initialMessages.audienceMessages
  ].map((message) => [message.id as SimulatedThreadMessageId, buildSimulatedMessagePreviewFingerprint(message)]))

  const messageMetaById: SimulatedThreadMessageMetaById = {}
  const initialOccurredAt = chronologicalHistory[0]!.occurredAt

  for (const messageId of previousMessageFingerprints.keys()) {
    messageMetaById[messageId] = {
      sentAt: initialOccurredAt,
      editedAt: null
    }
  }

  for (const entry of chronologicalHistory.slice(1)) {
    const nextMessages = buildSimulatedDmMessages(
      entry.draftSnapshot,
      materializeSimulatorLifecycleState(entry.stateSnapshot)
    )
    const nextMessageFingerprints = new Map<SimulatedThreadMessageId, string>([
      ...nextMessages.creatorMessages,
      ...nextMessages.audienceMessages
    ].map((message) => [message.id as SimulatedThreadMessageId, buildSimulatedMessagePreviewFingerprint(message)]))

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

function formatDeliveryStateLabel(deliveryState: 'emulated' | 'stored-only' | 'dm-delivered') {
  switch (deliveryState) {
    case 'dm-delivered':
      return 'DM delivered'
    case 'stored-only':
      return 'Stored only'
    default:
      return 'Emulated thread'
  }
}

function DmMarkdown({ content }: { content: string }) {
  const blocks = content
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)

  return (
    <Box
      sx={{
        color: 'neutral.100',
        lineHeight: 1.65,
        '& > :first-of-type': { mt: 0 },
        '& > :last-child': { mb: 0 },
        '& p, & ul, & ol, & pre, & blockquote': {
          m: 0
        },
        '& ul, & ol': {
          pl: 3
        },
        '& li + li': {
          mt: 0.5
        },
        '& a': {
          color: 'primary.300',
          textDecorationColor: '#6fd9ff'
        },
        '& strong': {
          color: '#fff',
          fontWeight: 700
        },
        '& code': {
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace',
          fontSize: '0.95em',
          px: 0.5,
          py: 0.125,
          borderRadius: '6px',
          bgcolor: '#103244'
        },
        '& pre': {
          overflowX: 'auto',
          p: 1.25,
          borderRadius: '10px',
          bgcolor: '#081018',
          border: '1px solid #103244'
        },
        '& pre code': {
          p: 0,
          bgcolor: 'transparent'
        }
      }}
    >
      <Stack spacing={1.25}>
        {blocks.map((block, index) => {
          const lines = block.split('\n').map((line) => line.trim()).filter((line) => line.length > 0)
          const isSubtextBlock = lines.length > 0 && lines.every((line) => line.startsWith('-# '))
          const markdownContent = isSubtextBlock
            ? lines.map((line) => line.replace(/^-#\s+/, '')).join('\n')
            : block

          return (
            <Box
              key={`dm-markdown-block-${index}`}
              sx={isSubtextBlock
                ? {
                    color: 'neutral.400',
                    fontSize: '0.82rem',
                    lineHeight: 1.45,
                    letterSpacing: '0.01em'
                  }
                : undefined}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkBreaks]}
                components={{
                  a: ({ children, href, node, title }) => {
                    void node
                    return (
                      <Link href={href} title={title} target="_blank" rel="noreferrer">
                        {children}
                      </Link>
                    )
                  }
                }}
              >
                {markdownContent}
              </ReactMarkdown>
            </Box>
          )
        })}
      </Stack>
    </Box>
  )
}

function formatDiscordEmbedColor(color: number | null) {
  return color != null ? `#${color.toString(16).padStart(6, '0')}` : '#526176'
}

function getDmInboxParticipantKey(participant: DebugDmInboxParticipant) {
  return `${participant.role}:${participant.user.id}`
}

export function DmPreviewCard({
  preview,
  onButtonClick,
  pendingButtonCustomId,
  isInteractive = true
}: {
  preview: DebugDmPreview;
  onButtonClick?: (customId: string) => void;
  pendingButtonCustomId?: string | null;
  isInteractive?: boolean;
}) {
  return (
    <Card variant="soft" sx={{ p: 2.5 }}>
      <DmPreviewBody
        preview={preview}
        onButtonClick={onButtonClick}
        pendingButtonCustomId={pendingButtonCustomId}
        isInteractive={isInteractive}
      />
    </Card>
  )
}

function DmPreviewBody({
  preview,
  onButtonClick,
  pendingButtonCustomId,
  isInteractive = true,
  showButtonHeading = true,
  showNoButtonsNotice = true
}: {
  preview: DebugDmPreview;
  onButtonClick?: (customId: string) => void;
  pendingButtonCustomId?: string | null;
  isInteractive?: boolean;
  showButtonHeading?: boolean;
  showNoButtonsNotice?: boolean;
}) {
  return (
    <Stack spacing={2}>
      {preview.content ? (
        <Card variant="outlined" sx={{ p: 2, bgcolor: '#14181f' }}>
          <DmMarkdown content={preview.content} />
        </Card>
      ) : null}

      {preview.embeds.map((embed, embedIndex) => (
        <Card
          key={`dm-preview-embed-${embedIndex}`}
          variant="outlined"
          sx={{
            p: 0,
            overflow: 'hidden',
            bgcolor: '#101319',
            borderColor: '#272f3c',
            boxShadow: `inset 4px 0 0 ${formatDiscordEmbedColor(embed.color)}`
          }}
        >
          <Stack spacing={1.5} sx={{ p: 2 }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
              <Stack spacing={1.5} sx={{ flex: 1, minWidth: 0 }}>
                {embed.title ? (
                  <Typography level="title-md" sx={{ color: '#fff', lineHeight: 1.3 }}>
                    {embed.title}
                  </Typography>
                ) : null}
                {embed.description ? <DmMarkdown content={embed.description} /> : null}
                {embed.fields.length > 0 ? (
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' },
                      gap: 1.25
                    }}
                  >
                    {embed.fields.map((field, fieldIndex) => (
                      <Box
                        key={`dm-preview-embed-field-${embedIndex}-${fieldIndex}`}
                        sx={{
                          minWidth: 0,
                          gridColumn: field.inline ? 'span 1' : '1 / -1'
                        }}
                      >
                        <Typography
                          level="body-xs"
                          sx={{
                            color: '#fff',
                            fontWeight: 700,
                            letterSpacing: '0.02em',
                            textTransform: 'uppercase',
                            mb: 0.5
                          }}
                        >
                          {field.name}
                        </Typography>
                        <DmMarkdown content={field.value} />
                      </Box>
                    ))}
                  </Box>
                ) : null}
              </Stack>
              {embed.thumbnailUrl ? (
                <Box
                  component="img"
                  src={embed.thumbnailUrl}
                  alt={embed.title ?? 'DM embed thumbnail'}
                  sx={{
                    width: 80,
                    height: 80,
                    flexShrink: 0,
                    objectFit: 'cover',
                    borderRadius: 'sm',
                    border: '1px solid #272f3c'
                  }}
                />
              ) : null}
            </Stack>
            {embed.imageUrl ? (
              <Box
                component="img"
                src={embed.imageUrl}
                alt={embed.title ?? 'DM embed image'}
                sx={{
                  width: '100%',
                  maxHeight: 220,
                  objectFit: 'cover',
                  borderRadius: 'md',
                  border: '1px solid #272f3c'
                }}
              />
            ) : null}
            {embed.footerText ? (
              <Box sx={{ pt: 0.5, borderTop: '1px solid #272f3c' }}>
                <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                  {embed.footerText}
                </Typography>
              </Box>
            ) : null}
          </Stack>
        </Card>
      ))}

      {preview.buttonRows.length > 0 ? (
        <Stack spacing={1}>
          {showButtonHeading ? <Typography level="title-sm">Buttons</Typography> : null}
          {preview.buttonRows.map((row, rowIndex) => (
            <Stack key={`dm-preview-row-${rowIndex}`} direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
              {row.map((button, buttonIndex) => {
                const color = button.style === 'danger'
                  ? 'danger'
                  : button.style === 'primary'
                    ? 'primary'
                    : 'neutral'
                const variant = button.style === 'primary'
                  ? 'solid'
                  : button.style === 'danger'
                    ? 'soft'
                    : button.style === 'link'
                      ? 'plain'
                      : 'outlined'
                const isPending = button.customId != null && pendingButtonCustomId === button.customId
                const canTriggerAction = button.customId != null && Boolean(onButtonClick)
                const canOpenUrl = Boolean(button.url)

                return (
                  <Button
                    key={`dm-preview-button-${rowIndex}-${buttonIndex}`}
                    size="sm"
                    color={color}
                    variant={variant}
                    disabled={!isInteractive || button.disabled || isPending || (!canTriggerAction && !canOpenUrl)}
                    loading={isPending}
                    onClick={() => {
                      if (!isInteractive) {
                        return
                      }

                      if (button.customId && onButtonClick) {
                        onButtonClick(button.customId)
                        return
                      }

                      if (button.url && typeof window !== 'undefined') {
                        window.open(button.url, '_blank', 'noopener,noreferrer')
                      }
                    }}
                  >
                    {button.label}
                  </Button>
                )
              })}
            </Stack>
          ))}
        </Stack>
      ) : showNoButtonsNotice ? (
        <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
          This DM has no interactive buttons.
        </Typography>
      ) : null}
    </Stack>
  )
}

function DmInboxMessageCard({
  message,
  formatDateTime,
  onButtonClick,
  pendingButtonCustomId
}: {
  message: DebugDmInboxMessage;
  formatDateTime: (value: string | null) => string;
  onButtonClick: (customId: string) => void;
  pendingButtonCustomId: string | null;
}) {
  const [selectedRevisionIndex, setSelectedRevisionIndex] = useState(Math.max(0, message.revisions.length - 1))

  useEffect(() => {
    setSelectedRevisionIndex(Math.max(0, message.revisions.length - 1))
  }, [message.id, message.revisions.length])

  const latestRevision = message.revisions[message.revisions.length - 1]
  const revision = message.revisions[selectedRevisionIndex] ?? latestRevision

  if (!revision) {
    return null
  }

  const isLatestRevision = selectedRevisionIndex === message.revisions.length - 1

  return (
    <Card variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.25}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between">
          <Stack spacing={0.35}>
            <Typography level="title-sm">{message.label}</Typography>
            <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
              Sent {formatDateTime(message.sentAt)}
            </Typography>
            <Typography level="body-xs" sx={{ color: 'neutral.500' }}>
              {revision.label} · {formatDateTime(revision.occurredAt)}
            </Typography>
          </Stack>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap', justifyContent: { xs: 'flex-start', sm: 'flex-end' } }}>
            {message.revisions.length > 1 ? (
              <>
                <Chip size="sm" variant="outlined" color="neutral">
                  Revision {selectedRevisionIndex + 1} of {message.revisions.length}
                </Chip>
                <Button
                  size="sm"
                  variant="outlined"
                  color="neutral"
                  disabled={selectedRevisionIndex === 0}
                  onClick={() => setSelectedRevisionIndex((currentIndex) => Math.max(0, currentIndex - 1))}
                >
                  Prev
                </Button>
                <Button
                  size="sm"
                  variant="outlined"
                  color="neutral"
                  disabled={selectedRevisionIndex === message.revisions.length - 1}
                  onClick={() => setSelectedRevisionIndex((currentIndex) => Math.min(message.revisions.length - 1, currentIndex + 1))}
                >
                  Next
                </Button>
              </>
            ) : null}
            <Chip
              size="sm"
              variant={message.deliveryState === 'dm-delivered' ? 'soft' : 'outlined'}
              color={message.deliveryState === 'dm-delivered' ? 'success' : message.deliveryState === 'emulated' ? 'primary' : 'neutral'}
            >
              {formatDeliveryStateLabel(message.deliveryState)}
            </Chip>
          </Stack>
        </Stack>
        <DmPreviewCard
          preview={revision.preview}
          onButtonClick={isLatestRevision ? onButtonClick : undefined}
          pendingButtonCustomId={isLatestRevision ? pendingButtonCustomId : null}
          isInteractive={isLatestRevision}
        />
        {!isLatestRevision ? (
          <Typography level="body-xs" sx={{ color: 'neutral.500' }}>
            Historical revisions are view-only. Switch back to the latest revision to emulate buttons.
          </Typography>
        ) : null}
      </Stack>
    </Card>
  )
}

function buildSimulatorInfoButtonAriaLabel(subject: string) {
  return `More information about ${subject}`
}

function SimulatedDmThreadMessage({
  message,
  onButtonClick,
  messageMeta
}: {
  message: SimulatedDmMessage;
  onButtonClick?: (customId: string) => void;
  messageMeta?: SimulatedThreadMessageMeta;
}) {
  const timestampLabel = formatSimulatorTimestamp(messageMeta?.sentAt ?? new Date().toISOString())

  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: 'flex-start' }}>
      <Avatar
        size="sm"
        sx={{
          bgcolor: '#2b5cff',
          color: '#fff',
          fontWeight: 800,
          boxShadow: '0 0 0 1px rgba(255,255,255,0.08)'
        }}
      >
        GU
      </Avatar>
      <Stack spacing={1.1} sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography level="title-sm" sx={{ color: '#fff' }}>Game's Up</Typography>
          <Typography level="body-xs" sx={{ color: 'neutral.500' }}>
            {timestampLabel}
          </Typography>
          {messageMeta?.editedAt ? (
            <Typography
              level="body-xs"
              title={`Edited ${formatSimulatorTimestamp(messageMeta.editedAt)}`}
              sx={{ color: 'neutral.500', fontStyle: 'italic' }}
            >
              edited
            </Typography>
          ) : null}
          {message.explanation && message.explanation.length > 0 ? (
            <InfoPopoverButton subject={message.label} lines={message.explanation} />
          ) : null}
        </Stack>
        <DmPreviewBody
          preview={message.preview}
          onButtonClick={message.isInteractive ? onButtonClick : undefined}
          isInteractive={message.isInteractive}
          showButtonHeading={false}
          showNoButtonsNotice={false}
        />
      </Stack>
    </Stack>
  )
}

function InfoPopoverButton({
  subject,
  lines
}: {
  subject: string;
  lines: string[];
}) {
  const [isHovered, setIsHovered] = useState(false)
  const [isPinnedOpen, setIsPinnedOpen] = useState(false)
  const open = isHovered || isPinnedOpen

  return (
    <Box
      sx={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false)
        setIsPinnedOpen(false)
      }}
    >
      <IconButton
        aria-label={buildSimulatorInfoButtonAriaLabel(subject)}
        title="Show details"
        variant="soft"
        color="neutral"
        size="sm"
        onClick={() => setIsPinnedOpen((currentOpen) => !currentOpen)}
        sx={{ minHeight: 0, p: 0.5, borderRadius: '999px' }}
      >
        <InfoOutlinedIcon fontSize="small" />
      </IconButton>
      {open ? (
        <Card
          variant="soft"
          sx={{
            p: 1.5,
            width: 'clamp(260px, 28vw, 360px)',
            maxWidth: 'min(360px, calc(100vw - 48px))',
            maxHeight: 'min(320px, calc(100vh - 120px))',
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            zIndex: 20,
            boxShadow: 'var(--joy-shadow-lg)',
            border: '1px solid',
            borderColor: 'neutral.700',
            overflow: 'auto',
            backgroundColor: '#121a28'
          }}
        >
          <Stack spacing={0.75}>
            {lines.map((line) => (
              <Typography
                key={line}
                level="body-sm"
                sx={{
                  color: 'neutral.300',
                  whiteSpace: 'normal',
                  overflowWrap: 'anywhere',
                  lineHeight: 1.55
                }}
              >
                {line}
              </Typography>
            ))}
          </Stack>
        </Card>
      ) : null}
    </Box>
  )
}

export function DmPreviewDialog({
  open,
  onClose,
  title,
  subtitle,
  preview
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  preview: DebugDmPreview | null;
}) {
  return (
    <DashboardModal open={open} onClose={onClose} width="min(92vw, 760px)">
      <DialogTitle sx={{ pr: 6 }}>{title}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0, overflow: 'auto' }}>
        <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
          {subtitle}
        </Typography>

        {preview ? (
          <DmPreviewCard preview={preview} />
        ) : (
          <EmptyStateCard
            title="No DM preview available"
            body="This row did not produce a Discord DM message body that can be previewed from the current snapshot."
          />
        )}
      </DialogContent>
    </DashboardModal>
  )
}

export function DmLifecycleSimulatorDialog({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<SimulatedScenarioDraft>(() => cloneSimulatorDraft(defaultSimulatorDraft))
  const [committedDraft, setCommittedDraft] = useState<SimulatedScenarioDraft | null>(null)
  const [state, setState] = useState<SimulatedLifecycleStateWithActions | null>(null)

  useEffect(() => {
    if (open) {
      return
    }

    setDraft(cloneSimulatorDraft(defaultSimulatorDraft))
    setCommittedDraft(null)
    setState(null)
  }, [open])

  const appendSimulatorHistoryEntry = (
    currentState: SimulatedLifecycleStateWithActions,
    options: {
      action: SimulatedLifecycleAction;
      actor: SimulatedLifecycleEntry['actor'];
      summary: string;
      nextState: SimulatedLifecycleState;
      draftSnapshot: SimulatedScenarioDraft;
    }
  ): SimulatedLifecycleStateWithActions => {
    const occurredAt = new Date().toISOString()

    return {
      ...options.nextState,
      history: [
        {
          id: currentState.nextEntryId,
          actor: options.actor,
          action: options.action,
          summary: options.summary,
          occurredAt,
          draftSnapshot: cloneSimulatorDraft(options.draftSnapshot),
          stateSnapshot: snapshotSimulatorLifecycleState(options.nextState)
        },
        ...currentState.history
      ],
      nextEntryId: currentState.nextEntryId + 1
    }
  }

  const startSimulation = (mode: SimulatedSimulatorStartMode) => {
    const nextDraft = cloneSimulatorDraft(draft)
    setCommittedDraft(nextDraft)
    setState(buildInitialSimulatorDialogState({
      mode,
      draft: nextDraft
    }))
  }

  const handleScenarioFieldChange = (field: keyof SimulatedScenarioDraft, value: string) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      [field]: value
    }))
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

      const appliedChange = applySimulatorScenarioChanges(currentState, committedDraft, nextDraft)

      if (!appliedChange) {
        return currentState
      }

      return appendSimulatorHistoryEntry(currentState, {
        action: 'scenario-updated',
        actor: 'creator',
        summary: appliedChange.summary,
        nextState: appliedChange.nextState,
        draftSnapshot: nextDraft
      })
    })

    setCommittedDraft(nextDraft)
  }

  const handleScheduledStartReached = () => {
    setState((currentState) => {
      if (!currentState || !committedDraft) {
        return currentState
      }

      const transition = resolveScheduledStartReachedTransition(currentState, committedDraft)

      if (!transition) {
        return currentState
      }

      return appendSimulatorHistoryEntry(currentState, {
        action: 'scheduled-start-reached',
        actor: transition.actor,
        summary: transition.summary,
        nextState: transition.nextState,
        draftSnapshot: committedDraft
      })
    })
  }

  const handlePreviewButtonClick = (customId: string) => {
    setState((currentState) => {
      if (!currentState || !committedDraft) {
        return currentState
      }

      if (currentState.stage === 'ended') {
        return currentState
      }

      const action = mapSimulatorCustomIdToAction(customId)

      if (!action) {
        return currentState
      }

      const transition = resolveSimulatorLifecycleTransition(currentState, action, committedDraft)

      if (!transition) {
        return currentState
      }

      return appendSimulatorHistoryEntry(currentState, {
        action,
        actor: transition.actor,
        summary: transition.summary,
        nextState: transition.nextState,
        draftSnapshot: committedDraft
      })
    })
  }

  const hasScenario = state != null && committedDraft != null
  const pendingUpdatedFields = committedDraft ? resolveSimulatorUpdatedFields(committedDraft, draft) : []
  const hasDraftChanges = committedDraft ? !areSimulatorDraftsEqual(draft, committedDraft) : false
  const { creatorMessages, audienceMessages } = hasScenario
    ? buildSimulatedDmMessages(committedDraft, state)
    : { creatorMessages: [], audienceMessages: [] }
  const threadMessageMetaById = state ? buildSimulatedThreadMessageMetaById(state.history) : {}
  const orderedCreatorMessages = orderSimulatedThreadMessages(creatorMessages, threadMessageMetaById)
  const orderedAudienceMessages = orderSimulatedThreadMessages(audienceMessages, threadMessageMetaById)

  const handleClose = () => {
    setDraft(cloneSimulatorDraft(defaultSimulatorDraft))
    setCommittedDraft(null)
    setState(null)
    onClose()
  }

  return (
    <DashboardModal open={open} onClose={handleClose} width="min(98vw, 1380px)">
      <DialogTitle sx={{ pr: 6 }}>DM lifecycle simulator</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0, overflow: { xs: 'auto', lg: 'hidden' } }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
            In-memory side-by-side DM simulation.
          </Typography>
          <InfoPopoverButton
            subject="the DM lifecycle simulator"
            lines={[
              'This simulator runs entirely in-memory in the browser and does not touch live notifications or DM rows.',
              'Use the DM buttons in the creator and audience panes to drive the local lifecycle and inspect how the anchor and reply messages evolve.',
              'Scenario edits only affect the threads after you apply them, so you can tell which changes caused an in-place edit versus a fresh follow-up message.'
            ]}
          />
        </Stack>

        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} sx={{ minHeight: 0, flex: 1, alignItems: 'stretch' }}>
          <Stack
            spacing={2}
            sx={{
              width: { xs: '100%', lg: 360 },
              flex: { xs: '0 0 auto', lg: '0 0 360px' },
              minHeight: 0,
              alignItems: 'stretch'
            }}
          >
            <Card variant="soft" sx={{ p: 2, minHeight: 0, overflow: 'auto', flex: { xs: '0 0 auto', lg: '0 1 auto' } }}>
              <Stack spacing={1.5} sx={{ minHeight: 0 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1}>
                  <Typography level="title-md">Scenario</Typography>
                  <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap' }}>
                    <Button size="sm" variant="soft" color="primary" onClick={() => startSimulation('scheduled')}>
                      New scheduled call
                    </Button>
                    <Button size="sm" variant="soft" color="success" onClick={() => startSimulation('live')}>
                      New live call
                    </Button>
                  </Stack>
                </Stack>
                <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
                  Edit the draft, start a scenario, then apply later changes to see the resulting messages.
                </Typography>
                <FormControl>
                  <FormLabel>Game title</FormLabel>
                  <Input value={draft.gameTitle} onChange={(event) => handleScenarioFieldChange('gameTitle', event.target.value)} />
                </FormControl>
                <FormControl>
                  <FormLabel>Scheduled time label</FormLabel>
                  <Input value={draft.scheduledForLabel} onChange={(event) => handleScenarioFieldChange('scheduledForLabel', event.target.value)} />
                </FormControl>
                <FormControl>
                  <FormLabel>Invite note</FormLabel>
                  <Textarea minRows={3} value={draft.note} onChange={(event) => handleScenarioFieldChange('note', event.target.value)} />
                </FormControl>
                <Stack spacing={0.75}>
                  <Button size="sm" variant="solid" color="primary" disabled={!hasScenario || !hasDraftChanges} onClick={applyScenarioChanges}>
                    Apply changes
                  </Button>
                  <Chip
                    size="sm"
                    variant="soft"
                    color={!hasScenario ? 'neutral' : hasDraftChanges ? 'warning' : 'success'}
                    sx={{ width: 'fit-content' }}
                  >
                    {!hasScenario
                      ? 'No scenario started yet'
                      : hasDraftChanges
                      ? pendingUpdatedFields.length > 0
                        ? `Pending recipient update: ${pendingUpdatedFields.join(', ')}`
                        : 'Pending visual-only edit'
                      : 'Draft is applied'}
                  </Chip>
                </Stack>
                <Divider />
                <Stack spacing={0.75}>
                  <Typography level="title-sm">Lifecycle shortcuts</Typography>
                  <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap' }}>
                    <Button
                      size="sm"
                      variant="soft"
                      color="warning"
                      disabled={!hasScenario || state.stage !== 'scheduled'}
                      onClick={handleScheduledStartReached}
                    >
                      Scheduled start reached
                    </Button>
                  </Stack>
                </Stack>
                <Divider />
                <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap' }}>
                  <Chip size="sm" variant="soft" color={!hasScenario ? 'neutral' : state.stage === 'scheduled' ? 'primary' : 'neutral'}>
                    {!hasScenario ? 'No scenario' : state.stage === 'scheduled' ? 'Scheduled' : 'Not waiting for start'}
                  </Chip>
                  <Chip size="sm" variant="soft" color={state?.stage === 'check-in' ? 'warning' : 'neutral'}>
                    {state?.stage === 'check-in' ? 'Check-in pending' : 'No check-in pending'}
                  </Chip>
                  <Chip size="sm" variant="soft" color={state?.stage === 'confirmed' ? 'success' : 'neutral'}>
                    {state?.stage === 'confirmed' ? 'Call on' : 'Not confirmed'}
                  </Chip>
                  <Chip size="sm" variant="soft" color={state?.stage === 'ended' ? 'danger' : 'neutral'}>
                    {state?.stage === 'ended' ? 'Ended' : 'Open'}
                  </Chip>
                  <Chip size="sm" variant="soft" color={state?.audienceResponse === 'interested' ? 'primary' : state?.audienceResponse === 'pass' ? 'warning' : 'neutral'}>
                    {state?.audienceResponse == null ? 'No audience reply yet' : `Audience: ${state.audienceResponse}`}
                  </Chip>
                </Stack>
              </Stack>
            </Card>

            <Card variant="soft" sx={{ p: 2, minHeight: 0, overflow: 'hidden', flex: { xs: '0 0 auto', lg: '1 1 0%' } }}>
              <Stack spacing={1.25} sx={{ height: '100%', minHeight: 0 }}>
                <Typography level="title-md">Action log</Typography>
                <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
                  Local session timeline.
                </Typography>
                {state ? (
                  <Stack spacing={1} sx={{ flex: 1, minHeight: 0, overflow: 'auto', pr: 0.5 }}>
                    {state.history.map((entry) => (
                      <Card key={entry.id} variant="outlined" sx={{ p: 1.25 }}>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={0.75} justifyContent="space-between">
                          <Typography level="body-sm">{entry.summary}</Typography>
                          <Chip size="sm" variant="soft" color={entry.actor === 'creator' ? 'primary' : entry.actor === 'audience' ? 'success' : 'neutral'}>
                            {entry.actor} · {formatSimulatorTimestamp(entry.occurredAt)}
                          </Chip>
                        </Stack>
                      </Card>
                    ))}
                  </Stack>
                ) : (
                  <EmptyStateCard
                    title="No scenario running"
                    body="Start a scheduled or live call from the scenario card to populate the local action log."
                  />
                )}
              </Stack>
            </Card>
          </Stack>

          <Stack direction={{ xs: 'column', xl: 'row' }} spacing={2} sx={{ flex: 1, minHeight: 0, alignItems: 'stretch' }}>
            <Card variant="soft" sx={{ flex: 1, p: 2.5, minHeight: 0, overflow: 'hidden' }}>
              <Stack spacing={1.5} sx={{ height: '100%', minHeight: 0 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                  <Box>
                    <Typography level="title-lg">Creator thread</Typography>
                  </Box>
                  <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                    <Chip size="sm" variant="soft" color="primary">{committedDraft?.creatorName ?? 'Creator'}</Chip>
                    <InfoPopoverButton
                      subject="the creator thread"
                      lines={[
                        'The creator keeps one retained summary message that updates in place.',
                        'Scheduled calls can also produce a separate go-time check-in prompt before the creator confirms the session is still on.',
                        'Separate creator replies should only announce audience changes such as interest or pass.'
                      ]}
                    />
                  </Stack>
                </Stack>

                <Stack spacing={0} sx={{ flex: 1, minHeight: 0, overflow: 'auto', pr: 0.5 }}>
                  {hasScenario ? orderedCreatorMessages.map((message) => (
                    <Box key={message.id}>
                      <SimulatedDmThreadMessage
                        message={message}
                        onButtonClick={handlePreviewButtonClick}
                        messageMeta={threadMessageMetaById[message.id as SimulatedThreadMessageId]}
                      />
                      {message.id !== orderedCreatorMessages[orderedCreatorMessages.length - 1]?.id ? (
                        <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.08)' }} />
                      ) : null}
                    </Box>
                  )) : (
                    <EmptyStateCard
                      title="No creator thread yet"
                      body="Start a scenario to generate the retained creator summary, check-in prompt, and follow-up messages."
                    />
                  )}
                </Stack>
              </Stack>
            </Card>

            <Card variant="soft" sx={{ flex: 1, p: 2.5, minHeight: 0, overflow: 'hidden' }}>
              <Stack spacing={1.5} sx={{ height: '100%', minHeight: 0 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                  <Box>
                    <Typography level="title-lg">Audience thread</Typography>
                  </Box>
                  <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                    <Chip size="sm" variant="soft" color="success">{committedDraft?.audienceName ?? 'Audience'}</Chip>
                    <InfoPopoverButton
                      subject="the audience thread"
                      lines={[
                        'The invite stays as the anchor for the whole audience lifecycle.',
                        'Meaningful call edits can add a fresh “Call Updated” reply under the invite while also editing the invite itself in place.',
                        'Follow-up replies should look close to the live acknowledgement and go-time messages while pointing back to that anchor.'
                      ]}
                    />
                  </Stack>
                </Stack>

                <Stack spacing={0} sx={{ flex: 1, minHeight: 0, overflow: 'auto', pr: 0.5 }}>
                  {hasScenario ? orderedAudienceMessages.map((message) => (
                    <Box key={message.id}>
                      <SimulatedDmThreadMessage
                        message={message}
                        onButtonClick={handlePreviewButtonClick}
                        messageMeta={threadMessageMetaById[message.id as SimulatedThreadMessageId]}
                      />
                      {message.id !== orderedAudienceMessages[orderedAudienceMessages.length - 1]?.id ? (
                        <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.08)' }} />
                      ) : null}
                    </Box>
                  )) : (
                    <EmptyStateCard
                      title="No audience thread yet"
                      body="Start a scenario to generate the invite anchor and any audience follow-up replies."
                    />
                  )}
                </Stack>
              </Stack>
            </Card>
          </Stack>
        </Stack>
      </DialogContent>
    </DashboardModal>
  )
}

export function CtpDmInboxDialog({
  open,
  onClose,
  ctp,
  formatDateTime,
  buildApiUrl,
  onRefreshDebug,
  parseDebugDmActionResponse
}: {
  open: boolean;
  onClose: () => void;
  ctp: DebugPlayIntentSummary | null;
  formatDateTime: (value: string | null) => string;
  buildApiUrl: (path: string) => string;
  onRefreshDebug: () => Promise<void>;
  parseDebugDmActionResponse: (value: unknown) => DebugDmActionResponse;
}) {
  const [selectedParticipantKey, setSelectedParticipantKey] = useState<string | null>(null)
  const [pendingButtonCustomId, setPendingButtonCustomId] = useState<string | null>(null)
  const [actionNotice, setActionNotice] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null)

  useEffect(() => {
    setSelectedParticipantKey(ctp?.dmInboxParticipants[0] ? getDmInboxParticipantKey(ctp.dmInboxParticipants[0]) : null)
  }, [ctp])

  if (!ctp) {
    return null
  }

  const selectedParticipant = ctp.dmInboxParticipants.find((participant) => getDmInboxParticipantKey(participant) === selectedParticipantKey) ?? ctp.dmInboxParticipants[0] ?? null

  const handlePreviewButtonClick = async (customId: string) => {
    if (!selectedParticipant) {
      return
    }

    setPendingButtonCustomId(customId)
    setActionNotice(null)

    try {
      const response = await fetch(buildApiUrl('/api/debug/admin/dm-action'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          actingUserId: selectedParticipant.user.id,
          customId
        })
      })

      const responseBody = await response.json()

      if (!response.ok) {
        setActionNotice({
          tone: 'danger',
          message: typeof responseBody === 'object' && responseBody && 'error' in responseBody && typeof responseBody.error === 'string'
            ? responseBody.error
            : 'Unable to emulate that DM action right now.'
        })
        return
      }

      const parsed = parseDebugDmActionResponse(responseBody)
      setActionNotice({
        tone: 'success',
        message: parsed.message
      })
      await onRefreshDebug()
    } catch (error) {
      setActionNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Unable to emulate that DM action right now.'
      })
    } finally {
      setPendingButtonCustomId(null)
    }
  }

  return (
    <DashboardModal open={open} onClose={onClose} width="min(96vw, 1200px)">
      <DialogTitle sx={{ pr: 6 }}>DM emulator: {ctp.headline}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0, overflow: 'auto' }}>
        <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
          Latest mailbox state for the creator and each audience member tied to this call to play. Each card represents the latest state of one tracked DM message, not every intermediate edit.
        </Typography>

        {actionNotice ? (
          <Card variant="soft" color={actionNotice.tone === 'success' ? 'success' : 'danger'} sx={{ p: 1.5 }}>
            <Typography level="body-sm">{actionNotice.message}</Typography>
          </Card>
        ) : null}

        {ctp.dmInboxParticipants.length > 0 ? (
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ minHeight: 0 }}>
            <Card variant="soft" sx={{ width: { xs: '100%', md: 280 }, p: 1.5, flexShrink: 0 }}>
              <Stack spacing={1}>
                <Typography level="title-sm">Users</Typography>
                {ctp.dmInboxParticipants.map((participant) => {
                  const participantKey = getDmInboxParticipantKey(participant)
                  const isSelected = participantKey === (selectedParticipant ? getDmInboxParticipantKey(selectedParticipant) : null)

                  return (
                    <Button
                      key={participantKey}
                      variant={isSelected ? 'solid' : 'outlined'}
                      color={isSelected ? 'primary' : 'neutral'}
                      onClick={() => setSelectedParticipantKey(participantKey)}
                      sx={{ justifyContent: 'flex-start', textAlign: 'left', p: 1.25, minHeight: 'unset' }}
                    >
                      <Stack spacing={0.35} sx={{ alignItems: 'flex-start' }}>
                        <Typography level="title-sm">{participant.user.displayName}</Typography>
                        <Typography level="body-xs" sx={{ color: isSelected ? 'primary.100' : 'neutral.400' }}>
                          @{participant.user.handle}
                        </Typography>
                        <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap' }}>
                          <Chip size="sm" variant="soft" color={participant.role === 'creator' ? 'primary' : 'neutral'}>
                            {participant.role}
                          </Chip>
                          <Chip size="sm" variant="outlined" color="neutral">
                            {participant.messages.length} {participant.messages.length === 1 ? 'message' : 'messages'}
                          </Chip>
                          {participant.messages.length === 0 ? (
                            <Chip size="sm" variant="outlined" color="warning">
                              No DM message yet
                            </Chip>
                          ) : null}
                        </Stack>
                      </Stack>
                    </Button>
                  )
                })}
              </Stack>
            </Card>

            <Stack spacing={1.5} sx={{ flex: 1, minWidth: 0 }}>
              {selectedParticipant ? (
                <>
                  <Card variant="outlined" sx={{ p: 2 }}>
                    <Stack spacing={0.5}>
                      <Typography level="title-md">{selectedParticipant.user.displayName}</Typography>
                      <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
                        @{selectedParticipant.user.handle} · latest activity {formatDateTime(selectedParticipant.lastActivityAt)}
                      </Typography>
                    </Stack>
                  </Card>

                  {selectedParticipant.messages.length > 0 ? selectedParticipant.messages.map((message) => (
                    <DmInboxMessageCard
                      key={message.id}
                      message={message}
                      formatDateTime={formatDateTime}
                      onButtonClick={handlePreviewButtonClick}
                      pendingButtonCustomId={pendingButtonCustomId}
                    />
                  )) : (
                    <EmptyStateCard
                      title="No DM messages for this user"
                      body="This participant is part of the computed audience, but no call-to-play DM messages exist for them in the current snapshot yet."
                    />
                  )}
                </>
              ) : (
                <EmptyStateCard
                  title="No user selected"
                  body="Choose a user from the left side to inspect their latest DM messages for this call to play."
                />
              )}
            </Stack>
          </Stack>
        ) : (
          <EmptyStateCard
            title="No mailbox data for this call to play"
            body="No creator or recipient DM messages were found for the current snapshot."
          />
        )}
      </DialogContent>
    </DashboardModal>
  )
}