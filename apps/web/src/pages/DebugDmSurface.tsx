/** Hosts the local DM lifecycle simulator, including the same estimate form used on live calls. */
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
  Select,
  Option,
  Link,
  Stack,
  Textarea,
  Typography,
} from '@mui/joy'
import type {
  DebugDmPreview,
  SimulatedAutoPlayStateWithActions,
  SimulatedAutoPlayPromptDraft,
  SimulatedLifecycleEntryWithAction,
  SimulatedLifecycleStateWithActions,
  SimulatedScenarioKind,
  SimulatedScenarioDraft,
  SimulatedSimulatorStartMode,
  SimulatedDmMessage,
  SimulatedThreadMessageMeta,
} from '@game-is-up/shared'
import {
  applyAutoPlayObservationEnded,
  applyAutoPlayPreviewAction,
  applySimulatorLifecycleAction,
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
  formatSimulatorDurationLabel,
  formatSimulatorTimestamp,
  normalizeSimulatorRecipientCount,
  orderSimulatedThreadMessages,
  resolveSimulatorUpdatedFields,
  simulatedDmActionIds,
} from '@game-is-up/shared'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import { DashboardModal } from '../components/dashboard/DashboardModal'
import { RunningLateDialog } from '../components/dashboard/RunningLateDialog'
import { EmptyStateCard } from '../components/dashboard/EmptyStateCard'

const defaultSimulatorDraft: SimulatedScenarioDraft = {
  creatorName: 'Ryan',
  audienceName: 'Morgan',
  gameTitle: 'Helldivers 2',
  scheduledForLabel: 'Tonight at 8:30 PM',
  note: 'Hop in if you are free. I can start right away once someone is in.',
}

const defaultAutoPlayDraft: SimulatedAutoPlayPromptDraft = {
  creatorName: 'Ryan',
  gameTitle: 'Helldivers 2',
  friendRecipientCount: 3,
  networkRecipientCount: 7,
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
          m: 0,
        },
        '& ul, & ol': {
          pl: 3,
        },
        '& li + li': {
          mt: 0.5,
        },
        '& a': {
          color: 'primary.300',
          textDecorationColor: '#6fd9ff',
        },
        '& strong': {
          color: '#fff',
          fontWeight: 700,
        },
        '& code': {
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace',
          fontSize: '0.95em',
          px: 0.5,
          py: 0.125,
          borderRadius: '6px',
          bgcolor: '#103244',
        },
        '& pre': {
          overflowX: 'auto',
          p: 1.25,
          borderRadius: '10px',
          bgcolor: '#081018',
          border: '1px solid #103244',
        },
        '& pre code': {
          p: 0,
          bgcolor: 'transparent',
        },
      }}
    >
      <Stack spacing={1.25}>
        {blocks.map((block, index) => {
          const lines = block
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
          const isSubtextBlock =
            lines.length > 0 && lines.every((line) => line.startsWith('-# '))
          const markdownContent = isSubtextBlock
            ? lines.map((line) => line.replace(/^-#\s+/, '')).join('\n')
            : block

          return (
            <Box
              key={`dm-markdown-block-${index}`}
              sx={
                isSubtextBlock
                  ? {
                      color: 'neutral.400',
                      fontSize: '0.82rem',
                      lineHeight: 1.45,
                      letterSpacing: '0.01em',
                    }
                  : undefined
              }
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkBreaks]}
                components={{
                  a: ({ children, href, node, title }) => {
                    void node
                    return (
                      <Link
                        href={href}
                        title={title}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {children}
                      </Link>
                    )
                  },
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

export function DmPreviewCard({
  preview,
  onButtonClick,
  pendingButtonCustomId,
  isInteractive = true,
}: {
  preview: DebugDmPreview
  onButtonClick?: (customId: string) => void
  pendingButtonCustomId?: string | null
  isInteractive?: boolean
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
  showNoButtonsNotice = true,
}: {
  preview: DebugDmPreview
  onButtonClick?: (customId: string) => void
  pendingButtonCustomId?: string | null
  isInteractive?: boolean
  showButtonHeading?: boolean
  showNoButtonsNotice?: boolean
}) {
  return (
    <Stack spacing={2} aria-busy={Boolean(preview.pending)}>
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
            boxShadow: `inset 4px 0 0 ${formatDiscordEmbedColor(embed.color)}`,
          }}
        >
          <Stack spacing={1.5} sx={{ p: 2 }}>
            <Stack
              direction="row"
              spacing={1.5}
              sx={{ alignItems: 'flex-start' }}
            >
              <Stack spacing={1.5} sx={{ flex: 1, minWidth: 0 }}>
                {embed.title ? (
                  <Typography
                    level="title-md"
                    sx={{ color: '#fff', lineHeight: 1.3 }}
                  >
                    {embed.title}
                  </Typography>
                ) : null}
                {embed.description ? (
                  <DmMarkdown content={embed.description} />
                ) : null}
                {embed.fields.length > 0 ? (
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: {
                        xs: 'minmax(0, 1fr)',
                        sm: 'repeat(2, minmax(0, 1fr))',
                      },
                      gap: 1.25,
                    }}
                  >
                    {embed.fields.map((field, fieldIndex) => (
                      <Box
                        key={`dm-preview-embed-field-${embedIndex}-${fieldIndex}`}
                        sx={{
                          minWidth: 0,
                          gridColumn: field.inline ? 'span 1' : '1 / -1',
                        }}
                      >
                        <Typography
                          level="body-xs"
                          sx={{
                            color: '#fff',
                            fontWeight: 700,
                            letterSpacing: '0.02em',
                            textTransform: 'uppercase',
                            mb: 0.5,
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
                    border: '1px solid #272f3c',
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
                  border: '1px solid #272f3c',
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

      {(preview.selectMenus ?? []).map((menu) => (
        <FormControl key={menu.customId}>
          <FormLabel>{menu.placeholder}</FormLabel>
          <Select
            multiple
            value={menu.options
              .filter((option) => option.selected)
              .map((option) => option.value)}
            disabled
            placeholder={menu.placeholder}
          >
            {menu.options.map((option) => (
              <Option key={option.value} value={option.value}>
                {option.label}
              </Option>
            ))}
          </Select>
          <Typography level="body-xs">
            Options: {menu.options.map((option) => option.label).join(', ')}
          </Typography>
        </FormControl>
      ))}

      {preview.buttonRows.length > 0 ? (
        <Stack spacing={1}>
          {showButtonHeading ? (
            <Typography level="title-sm">Buttons</Typography>
          ) : null}
          {preview.buttonRows.map((row, rowIndex) => (
            <Stack
              key={`dm-preview-row-${rowIndex}`}
              direction="row"
              spacing={1}
              sx={{ flexWrap: 'wrap' }}
            >
              {row.map((button, buttonIndex) => {
                const color =
                  button.style === 'danger'
                    ? 'danger'
                    : button.style === 'primary'
                      ? 'primary'
                      : 'neutral'
                const variant =
                  button.style === 'primary'
                    ? 'solid'
                    : button.style === 'danger'
                      ? 'soft'
                      : button.style === 'link'
                        ? 'plain'
                        : 'outlined'
                const isPending =
                  button.customId != null &&
                  pendingButtonCustomId === button.customId
                const canTriggerAction =
                  button.customId != null && Boolean(onButtonClick)
                const canOpenUrl = Boolean(button.url)

                return (
                  <Button
                    key={`dm-preview-button-${rowIndex}-${buttonIndex}`}
                    size="sm"
                    color={color}
                    variant={variant}
                    disabled={
                      !isInteractive ||
                      button.disabled ||
                      isPending ||
                      (!canTriggerAction && !canOpenUrl)
                    }
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

function buildSimulatorInfoButtonAriaLabel(subject: string) {
  return `More information about ${subject}`
}

function SimulatedDmThreadMessage({
  message,
  onButtonClick,
  messageMeta,
}: {
  message: SimulatedDmMessage
  onButtonClick?: (customId: string) => void
  messageMeta?: SimulatedThreadMessageMeta
}) {
  const timestampLabel = formatSimulatorTimestamp(
    messageMeta?.sentAt ?? new Date().toISOString(),
  )

  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: 'flex-start' }}>
      <Avatar
        size="sm"
        sx={{
          bgcolor: '#2b5cff',
          color: '#fff',
          fontWeight: 800,
          boxShadow: '0 0 0 1px rgba(255,255,255,0.08)',
        }}
      >
        GU
      </Avatar>
      <Stack spacing={1.1} sx={{ flex: 1, minWidth: 0 }}>
        <Stack
          direction="row"
          spacing={0.75}
          sx={{ alignItems: 'center', flexWrap: 'wrap' }}
        >
          <Typography level="title-sm" sx={{ color: '#fff' }}>
            Game's Up
          </Typography>
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
            <InfoPopoverButton
              subject={message.label}
              lines={message.explanation}
            />
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
  lines,
}: {
  subject: string
  lines: string[]
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
            backgroundColor: 'var(--joy-palette-background-popup)',
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
                  lineHeight: 1.55,
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
  preview,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle: string
  preview: DebugDmPreview | null
}) {
  return (
    <DashboardModal open={open} onClose={onClose} width="min(92vw, 760px)">
      <DialogTitle sx={{ pr: 6 }}>{title}</DialogTitle>
      <DialogContent
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          minHeight: 0,
          overflow: 'auto',
        }}
      >
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
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [scenarioKind, setScenarioKind] =
    useState<SimulatedScenarioKind>('call-to-play')
  const [runningLateDialogOpen, setRunningLateDialogOpen] = useState(false)
  const [draft, setDraft] = useState<SimulatedScenarioDraft>(() =>
    cloneSimulatorDraft(defaultSimulatorDraft),
  )
  const [committedDraft, setCommittedDraft] =
    useState<SimulatedScenarioDraft | null>(null)
  const [state, setState] = useState<SimulatedLifecycleStateWithActions | null>(
    null,
  )
  const [autoPlayDraft, setAutoPlayDraft] =
    useState<SimulatedAutoPlayPromptDraft>(() =>
      cloneSimulatorDraft(defaultAutoPlayDraft),
    )
  const [committedAutoPlayDraft, setCommittedAutoPlayDraft] =
    useState<SimulatedAutoPlayPromptDraft | null>(null)
  const [autoPlayState, setAutoPlayState] =
    useState<SimulatedAutoPlayStateWithActions | null>(null)

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
  }, [open])

  const startSimulation = (mode: SimulatedSimulatorStartMode) => {
    setScenarioKind('call-to-play')
    const nextDraft = cloneSimulatorDraft(draft)
    setCommittedDraft(nextDraft)
    setState(
      buildInitialSimulatorDialogState({
        mode,
        draft: nextDraft,
      }),
    )
    setCommittedAutoPlayDraft(null)
    setAutoPlayState(null)
  }

  const startAutoPlaySimulation = () => {
    setScenarioKind('auto-play-prompt')
    const nextDraft = cloneSimulatorDraft(autoPlayDraft)
    setCommittedAutoPlayDraft(nextDraft)
    setAutoPlayState(
      buildInitialAutoPlayDialogState({
        draft: nextDraft,
      }),
    )
    setCommittedDraft(null)
    setState(null)
  }

  const handleScenarioFieldChange = (
    field: keyof SimulatedScenarioDraft,
    value: string,
  ) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      [field]: value,
    }))
  }

  const handleAutoPlayFieldChange = (
    field: keyof SimulatedAutoPlayPromptDraft,
    value: string,
  ) => {
    setAutoPlayDraft((currentDraft) => {
      if (
        field === 'friendRecipientCount' ||
        field === 'networkRecipientCount'
      ) {
        return {
          ...currentDraft,
          [field]: normalizeSimulatorRecipientCount(Number(value)),
        }
      }

      return {
        ...currentDraft,
        [field]: value,
      }
    })
  }

  const handleScenarioKindChange = (
    nextScenarioKind: SimulatedScenarioKind,
  ) => {
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

      return applySimulatorScenarioChanges(
        currentState,
        committedDraft,
        nextDraft,
      )
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

  const handleLifecycleShortcutAction = (
    action:
      | 'creator-joined-voice'
      | 'audience-joined-voice'
      | 'creator-launched-game'
      | 'audience-launched-game',
  ) => {
    setState((currentState) => {
      if (!currentState || !committedDraft) {
        return currentState
      }

      return applySimulatorLifecycleAction(currentState, action, committedDraft)
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
      if (customId === simulatedDmActionIds.audienceRunningLate) {
        setRunningLateDialogOpen(true)
        return
      }

      setState((currentState) => {
        if (!currentState || !committedDraft) {
          return currentState
        }

        return applySimulatorPreviewAction(
          currentState,
          customId,
          committedDraft,
        )
      })

      return
    }

    setAutoPlayState((currentState) => {
      if (!currentState || !committedAutoPlayDraft) {
        return currentState
      }

      return applyAutoPlayPreviewAction(
        currentState,
        customId,
        committedAutoPlayDraft,
      )
    })
  }

  const hasCtpScenario = state != null && committedDraft != null
  const hasAutoPlayScenario =
    autoPlayState != null && committedAutoPlayDraft != null
  const hasScenario =
    scenarioKind === 'call-to-play' ? hasCtpScenario : hasAutoPlayScenario
  const pendingUpdatedFields = committedDraft
    ? resolveSimulatorUpdatedFields(committedDraft, draft)
    : []
  const hasDraftChanges = committedDraft
    ? !areSimulatorDraftsEqual(draft, committedDraft)
    : false
  const hasAutoPlayDraftChanges = committedAutoPlayDraft
    ? !areAutoPlayDraftsEqual(autoPlayDraft, committedAutoPlayDraft)
    : false
  const activeHistory =
    scenarioKind === 'call-to-play'
      ? (state?.history ?? [])
      : (autoPlayState?.history ?? [])
  const chronologicalActiveHistory = [...activeHistory].reverse()
  const ctpMessages = hasCtpScenario
    ? chronologicalActiveHistory.length > 0
      ? buildSimulatedCallToPlayMessagesForHistory(
          chronologicalActiveHistory as SimulatedLifecycleEntryWithAction[],
        )
      : buildSimulatedDmMessages(committedDraft, state)
    : { creatorMessages: [], audienceMessages: [] }
  const autoPlayMessages = hasAutoPlayScenario
    ? buildSimulatedAutoPlayDmMessages(committedAutoPlayDraft, autoPlayState)
    : { promptMessages: [], createdCallMessages: [] }
  const threadMessageMetaById =
    activeHistory.length > 0
      ? buildSimulatedThreadMessageMetaById(activeHistory)
      : {}
  const orderedCreatorMessages = orderSimulatedThreadMessages(
    ctpMessages.creatorMessages,
    threadMessageMetaById,
  )
  const orderedAudienceMessages = orderSimulatedThreadMessages(
    ctpMessages.audienceMessages,
    threadMessageMetaById,
  )
  const orderedPromptMessages = orderSimulatedThreadMessages(
    autoPlayMessages.promptMessages,
    threadMessageMetaById,
  )
  const orderedCreatedCallMessages = orderSimulatedThreadMessages(
    autoPlayMessages.createdCallMessages,
    threadMessageMetaById,
  )

  const primaryThread =
    scenarioKind === 'call-to-play'
      ? {
          title: 'Creator thread',
          badgeColor: 'primary' as const,
          badgeLabel: committedDraft?.creatorName ?? 'Creator',
          infoLines: [
            'The creator keeps one retained summary message that updates in place.',
            'Scheduled calls can also produce a separate go-time check-in prompt before the creator confirms the session is still on.',
            'Separate creator replies should only announce audience changes or other live-session activity such as launches and voice joins.',
          ],
          emptyTitle: state?.creatorThreadArchived
            ? 'Creator thread archived'
            : 'No creator thread yet',
          emptyBody: state?.creatorThreadArchived
            ? 'The creator archived only their retained summary thread. The audience thread can remain until it is archived separately.'
            : 'Start a scenario to generate the retained creator summary, check-in prompt, and follow-up messages.',
          messages: orderedCreatorMessages,
        }
      : {
          title: 'Prompt thread',
          badgeColor: 'primary' as const,
          badgeLabel: committedAutoPlayDraft?.creatorName ?? 'Observed player',
          infoLines: [
            'The original auto-play prompt is the retained anchor for the prompt flow.',
            'Picking a duration edits that anchor into the audience step instead of sending a separate second prompt.',
            'Closed prompt outcomes keep the anchor in place and explain the stop reason in a reply underneath it.',
          ],
          emptyTitle: 'No prompt thread yet',
          emptyBody:
            'Start an auto-play prompt to generate the retained prompt anchor and any closeout reply.',
          messages: orderedPromptMessages,
        }

  const secondaryThread =
    scenarioKind === 'call-to-play'
      ? {
          title: 'Audience thread',
          badgeColor: 'success' as const,
          badgeLabel: committedDraft?.audienceName ?? 'Audience',
          infoLines: [
            'The invite stays as the anchor for the whole audience lifecycle.',
            'Responses update the invite in place with a momentary button confirmation instead of a separate acknowledgement reply; meaningful call edits and live-session nudges still add fresh replies under the invite.',
            'The go-time reply should stay retained, while update replies stack as a trail beneath the anchor.',
          ],
          emptyTitle: state?.audienceThreadArchived
            ? 'Audience thread archived'
            : 'No audience thread yet',
          emptyBody: state?.audienceThreadArchived
            ? 'The audience archived only their invite thread. The creator summary can remain until it is archived separately.'
            : 'Start a scenario to generate the invite anchor and any audience follow-up replies.',
          messages: orderedAudienceMessages,
        }
      : {
          title: 'Created call thread',
          badgeColor: 'success' as const,
          badgeLabel: committedAutoPlayDraft?.creatorName ?? 'Creator',
          infoLines: [
            'Accepting the prompt hands off to the normal creator summary thread for the newly created call to play.',
            'From that handoff onward, the creator summary becomes the retained cleanup anchor instead of the original prompt DM.',
          ],
          emptyTitle: 'No created call yet',
          emptyBody:
            'Choose a duration and audience from the prompt thread to hand off into a live creator summary.',
          messages: orderedCreatedCallMessages,
        }

  const handleClose = () => {
    setRunningLateDialogOpen(false)
    setScenarioKind('call-to-play')
    setDraft(cloneSimulatorDraft(defaultSimulatorDraft))
    setCommittedDraft(null)
    setState(null)
    setAutoPlayDraft(cloneSimulatorDraft(defaultAutoPlayDraft))
    setCommittedAutoPlayDraft(null)
    setAutoPlayState(null)
    onClose()
  }

  return (
    <DashboardModal open={open} onClose={handleClose} width="min(98vw, 1380px)">
      <DialogTitle sx={{ pr: 6 }}>DM lifecycle simulator</DialogTitle>
      <DialogContent
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          minHeight: 0,
          overflow: { xs: 'auto', lg: 'hidden' },
        }}
      >
        <Stack
          direction="row"
          spacing={0.75}
          sx={{ alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
            In-memory DM simulation for call-to-play and auto-play prompt flows.
          </Typography>
          <InfoPopoverButton
            subject="the DM lifecycle simulator"
            lines={[
              'This simulator runs entirely in-memory in the browser and does not touch live notifications or DM rows.',
              'Use the DM buttons inside the rendered threads to drive the local lifecycle and inspect how retained anchors, replies, and handoff messages evolve.',
              'Call-to-play scenarios support in-place draft edits, while auto-play prompt scenarios focus on the prompt-to-summary handoff and closed-prompt cleanup path.',
            ]}
          />
        </Stack>

        <Stack
          direction={{ xs: 'column', lg: 'row' }}
          spacing={2}
          sx={{ minHeight: 0, flex: 1, alignItems: 'stretch' }}
        >
          <Stack
            spacing={2}
            sx={{
              width: { xs: '100%', lg: 360 },
              flex: { xs: '0 0 auto', lg: '0 0 360px' },
              minHeight: 0,
              alignItems: 'stretch',
            }}
          >
            <Card
              variant="soft"
              sx={{
                p: 2,
                minHeight: 0,
                overflow: 'auto',
                flex: { xs: '0 0 auto', lg: '0 1 auto' },
              }}
            >
              <Stack spacing={1.5} sx={{ minHeight: 0 }}>
                <Stack spacing={0.75}>
                  <Typography level="title-md">Scenario</Typography>
                  <Typography level="body-xs" sx={{ color: 'neutral.500' }}>
                    Choose the DM flow you want to rehearse.
                  </Typography>
                  <Stack
                    direction="row"
                    spacing={0.75}
                    sx={{ flexWrap: 'wrap' }}
                  >
                    <Button
                      size="sm"
                      variant={
                        scenarioKind === 'call-to-play' ? 'solid' : 'soft'
                      }
                      color="primary"
                      onClick={() => handleScenarioKindChange('call-to-play')}
                    >
                      Call to play
                    </Button>
                    <Button
                      size="sm"
                      variant={
                        scenarioKind === 'auto-play-prompt' ? 'solid' : 'soft'
                      }
                      color="primary"
                      onClick={() =>
                        handleScenarioKindChange('auto-play-prompt')
                      }
                    >
                      Auto-play prompt
                    </Button>
                  </Stack>
                </Stack>

                <Divider />

                {scenarioKind === 'call-to-play' ? (
                  <>
                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      justifyContent="space-between"
                      alignItems={{ xs: 'stretch', sm: 'center' }}
                      spacing={1}
                    >
                      <Typography level="title-md">Call to play</Typography>
                      <Stack
                        direction="row"
                        spacing={0.75}
                        sx={{ flexWrap: 'wrap' }}
                      >
                        <Button
                          size="sm"
                          variant="soft"
                          color="primary"
                          onClick={() => startSimulation('scheduled')}
                        >
                          New scheduled call
                        </Button>
                        <Button
                          size="sm"
                          variant="soft"
                          color="success"
                          onClick={() => startSimulation('live')}
                        >
                          New live call
                        </Button>
                      </Stack>
                    </Stack>
                    <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
                      Edit the draft, start a scenario, then apply later changes
                      to see the resulting messages.
                    </Typography>
                    <FormControl>
                      <FormLabel>Game title</FormLabel>
                      <Input
                        value={draft.gameTitle}
                        onChange={(event) =>
                          handleScenarioFieldChange(
                            'gameTitle',
                            event.target.value,
                          )
                        }
                      />
                    </FormControl>
                    <FormControl>
                      <FormLabel>Scheduled time label</FormLabel>
                      <Input
                        value={draft.scheduledForLabel}
                        onChange={(event) =>
                          handleScenarioFieldChange(
                            'scheduledForLabel',
                            event.target.value,
                          )
                        }
                      />
                    </FormControl>
                    <FormControl>
                      <FormLabel>Invite note</FormLabel>
                      <Textarea
                        minRows={3}
                        value={draft.note}
                        onChange={(event) =>
                          handleScenarioFieldChange('note', event.target.value)
                        }
                      />
                    </FormControl>
                    <Stack spacing={0.75}>
                      <Button
                        size="sm"
                        variant="solid"
                        color="primary"
                        disabled={!hasCtpScenario || !hasDraftChanges}
                        onClick={applyScenarioChanges}
                      >
                        Apply changes
                      </Button>
                      <Chip
                        size="sm"
                        variant="soft"
                        color={
                          !hasCtpScenario
                            ? 'neutral'
                            : hasDraftChanges
                              ? 'warning'
                              : 'success'
                        }
                        sx={{ width: 'fit-content' }}
                      >
                        {!hasCtpScenario
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
                      <Typography level="title-sm">
                        Lifecycle shortcuts
                      </Typography>
                      <Stack
                        direction="row"
                        spacing={0.75}
                        sx={{ flexWrap: 'wrap' }}
                      >
                        <Button
                          size="sm"
                          variant="soft"
                          color="warning"
                          disabled={
                            !hasCtpScenario || state?.stage !== 'scheduled'
                          }
                          onClick={handleScheduledStartReached}
                        >
                          Scheduled start reached
                        </Button>
                        <Button
                          size="sm"
                          variant="soft"
                          color="primary"
                          disabled={
                            !hasCtpScenario ||
                            state?.stage !== 'confirmed' ||
                            state?.audienceResponse !== 'interested' ||
                            state?.hasVoiceChannelActivity === true
                          }
                          onClick={() =>
                            handleLifecycleShortcutAction(
                              'creator-joined-voice',
                            )
                          }
                        >
                          Creator joined voice
                        </Button>
                        <Button
                          size="sm"
                          variant="soft"
                          color="primary"
                          disabled={
                            !hasCtpScenario ||
                            state?.stage !== 'confirmed' ||
                            state?.audienceResponse !== 'interested' ||
                            state?.hasVoiceChannelActivity === true
                          }
                          onClick={() =>
                            handleLifecycleShortcutAction(
                              'audience-joined-voice',
                            )
                          }
                        >
                          Audience joined voice
                        </Button>
                        <Button
                          size="sm"
                          variant="soft"
                          color="success"
                          disabled={
                            !hasCtpScenario ||
                            state?.stage !== 'confirmed' ||
                            state?.audienceResponse !== 'interested' ||
                            state?.hasGameLaunchActivity === true
                          }
                          onClick={() =>
                            handleLifecycleShortcutAction(
                              'creator-launched-game',
                            )
                          }
                        >
                          Creator launched game
                        </Button>
                        <Button
                          size="sm"
                          variant="soft"
                          color="success"
                          disabled={
                            !hasCtpScenario ||
                            state?.stage !== 'confirmed' ||
                            state?.audienceResponse !== 'interested' ||
                            state?.hasGameLaunchActivity === true
                          }
                          onClick={() =>
                            handleLifecycleShortcutAction(
                              'audience-launched-game',
                            )
                          }
                        >
                          Audience launched game
                        </Button>
                      </Stack>
                      <Typography level="body-xs" sx={{ color: 'neutral.500' }}>
                        Use these debug-only shortcuts to simulate live-session
                        replies that are triggered by Discord presence or voice
                        activity rather than DM buttons.
                      </Typography>
                    </Stack>
                    <Divider />
                    <Stack
                      direction="row"
                      spacing={0.75}
                      sx={{ flexWrap: 'wrap' }}
                    >
                      <Chip
                        size="sm"
                        variant="soft"
                        color={
                          !hasCtpScenario
                            ? 'neutral'
                            : state?.stage === 'scheduled'
                              ? 'primary'
                              : 'neutral'
                        }
                      >
                        {!hasCtpScenario
                          ? 'No scenario'
                          : state?.stage === 'scheduled'
                            ? 'Scheduled'
                            : 'Not waiting for start'}
                      </Chip>
                      <Chip
                        size="sm"
                        variant="soft"
                        color={
                          state?.stage === 'check-in' ? 'warning' : 'neutral'
                        }
                      >
                        {state?.stage === 'check-in'
                          ? 'Check-in pending'
                          : 'No check-in pending'}
                      </Chip>
                      <Chip
                        size="sm"
                        variant="soft"
                        color={
                          state?.stage === 'confirmed' ? 'success' : 'neutral'
                        }
                      >
                        {state?.stage === 'confirmed'
                          ? 'Call on'
                          : 'Not confirmed'}
                      </Chip>
                      <Chip
                        size="sm"
                        variant="soft"
                        color={state?.stage === 'ended' ? 'danger' : 'neutral'}
                      >
                        {state?.stage === 'ended' ? 'Ended' : 'Open'}
                      </Chip>
                      <Chip
                        size="sm"
                        variant="soft"
                        color={
                          state?.creatorThreadArchived ? 'warning' : 'neutral'
                        }
                      >
                        {state?.creatorThreadArchived
                          ? 'Creator archived'
                          : 'Creator retained'}
                      </Chip>
                      <Chip
                        size="sm"
                        variant="soft"
                        color={
                          state?.audienceThreadArchived ? 'warning' : 'neutral'
                        }
                      >
                        {state?.audienceThreadArchived
                          ? 'Audience archived'
                          : 'Audience retained'}
                      </Chip>
                      <Chip
                        size="sm"
                        variant="soft"
                        color={
                          state?.audienceResponse === 'interested'
                            ? 'primary'
                            : state?.audienceResponse === 'pass'
                              ? 'warning'
                              : 'neutral'
                        }
                      >
                        {state?.audienceResponse == null
                          ? 'No audience reply yet'
                          : `Audience: ${state.audienceResponse}`}
                      </Chip>
                      {state?.audienceRunningLate ? (
                        <Chip size="sm" variant="soft" color="warning">
                          Audience running late
                        </Chip>
                      ) : null}
                      <Chip
                        size="sm"
                        variant="soft"
                        color={
                          state?.hasVoiceChannelActivity ? 'primary' : 'neutral'
                        }
                      >
                        {state?.hasVoiceChannelActivity
                          ? 'Voice activity sent'
                          : 'No voice activity yet'}
                      </Chip>
                      <Chip
                        size="sm"
                        variant="soft"
                        color={
                          state?.hasGameLaunchActivity ? 'success' : 'neutral'
                        }
                      >
                        {state?.hasGameLaunchActivity
                          ? 'Launch activity sent'
                          : 'No launch activity yet'}
                      </Chip>
                    </Stack>
                  </>
                ) : (
                  <>
                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      justifyContent="space-between"
                      alignItems={{ xs: 'stretch', sm: 'center' }}
                      spacing={1}
                    >
                      <Typography level="title-md">Auto-play prompt</Typography>
                      <Button
                        size="sm"
                        variant="soft"
                        color="primary"
                        onClick={startAutoPlaySimulation}
                      >
                        New auto-play prompt
                      </Button>
                    </Stack>
                    <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
                      Start the same DM prompt that Discord sends when it sees
                      someone launch a game, then drive the duration, audience,
                      closeout, and handoff steps from the thread buttons.
                    </Typography>
                    <FormControl>
                      <FormLabel>Game title</FormLabel>
                      <Input
                        value={autoPlayDraft.gameTitle}
                        onChange={(event) =>
                          handleAutoPlayFieldChange(
                            'gameTitle',
                            event.target.value,
                          )
                        }
                      />
                    </FormControl>
                    <FormControl>
                      <FormLabel>Friends-only reach</FormLabel>
                      <Input
                        type="number"
                        value={String(autoPlayDraft.friendRecipientCount)}
                        onChange={(event) =>
                          handleAutoPlayFieldChange(
                            'friendRecipientCount',
                            event.target.value,
                          )
                        }
                      />
                    </FormControl>
                    <FormControl>
                      <FormLabel>Network + friends reach</FormLabel>
                      <Input
                        type="number"
                        value={String(autoPlayDraft.networkRecipientCount)}
                        onChange={(event) =>
                          handleAutoPlayFieldChange(
                            'networkRecipientCount',
                            event.target.value,
                          )
                        }
                      />
                    </FormControl>
                    <Chip
                      size="sm"
                      variant="soft"
                      color={
                        !hasAutoPlayScenario
                          ? 'neutral'
                          : hasAutoPlayDraftChanges
                            ? 'warning'
                            : 'success'
                      }
                      sx={{ width: 'fit-content' }}
                    >
                      {!hasAutoPlayScenario
                        ? 'No prompt started yet'
                        : hasAutoPlayDraftChanges
                          ? 'Draft changes apply when you start a fresh prompt'
                          : autoPlayState?.status === 'created' ||
                              autoPlayState?.status === 'created-ended'
                            ? 'Prompt handed off to call summary'
                            : 'Draft matches prompt context'}
                    </Chip>
                    <Divider />
                    <Stack spacing={0.75}>
                      <Typography level="title-sm">
                        Lifecycle shortcuts
                      </Typography>
                      <Stack
                        direction="row"
                        spacing={0.75}
                        sx={{ flexWrap: 'wrap' }}
                      >
                        <Button
                          size="sm"
                          variant="soft"
                          color="warning"
                          disabled={
                            !hasAutoPlayScenario ||
                            (autoPlayState?.status !== 'initial' &&
                              autoPlayState?.status !== 'audience')
                          }
                          onClick={handleAutoPlayObservationEnded}
                        >
                          Observation ended
                        </Button>
                      </Stack>
                    </Stack>
                    <Divider />
                    <Stack
                      direction="row"
                      spacing={0.75}
                      sx={{ flexWrap: 'wrap' }}
                    >
                      <Chip
                        size="sm"
                        variant="soft"
                        color={
                          !hasAutoPlayScenario
                            ? 'neutral'
                            : autoPlayState?.status === 'created'
                              ? 'success'
                              : autoPlayState?.status === 'created-ended'
                                ? 'danger'
                                : autoPlayState?.status === 'expired' ||
                                    autoPlayState?.status === 'declined'
                                  ? 'warning'
                                  : 'primary'
                        }
                      >
                        {!hasAutoPlayScenario
                          ? 'No prompt'
                          : autoPlayState?.status === 'initial'
                            ? 'Choose duration'
                            : autoPlayState?.status === 'audience'
                              ? 'Choose audience'
                              : autoPlayState?.status === 'created'
                                ? 'Call created'
                                : autoPlayState?.status === 'created-ended'
                                  ? 'Call ended'
                                  : autoPlayState?.status === 'archived'
                                    ? 'Archived'
                                    : 'Prompt closed'}
                      </Chip>
                      {autoPlayState?.durationMinutes != null ? (
                        <Chip size="sm" variant="soft" color="neutral">
                          {formatSimulatorDurationLabel(
                            autoPlayState.durationMinutes,
                          )}
                        </Chip>
                      ) : null}
                      {autoPlayState?.notifyScope ? (
                        <Chip size="sm" variant="soft" color="neutral">
                          {autoPlayState.notifyScope === 'friends-only'
                            ? 'Friends only'
                            : 'Network + friends'}
                        </Chip>
                      ) : null}
                    </Stack>
                  </>
                )}
              </Stack>
            </Card>

            <Card
              variant="soft"
              sx={{
                p: 2,
                minHeight: 0,
                overflow: 'hidden',
                flex: { xs: '0 0 auto', lg: '1 1 0%' },
              }}
            >
              <Stack spacing={1.25} sx={{ height: '100%', minHeight: 0 }}>
                <Typography level="title-md">Action log</Typography>
                <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
                  Local session timeline.
                </Typography>
                {activeHistory.length > 0 ? (
                  <Stack
                    spacing={1}
                    sx={{ flex: 1, minHeight: 0, overflow: 'auto', pr: 0.5 }}
                  >
                    {activeHistory.map((entry) => (
                      <Card key={entry.id} variant="outlined" sx={{ p: 1.25 }}>
                        <Stack
                          direction={{ xs: 'column', sm: 'row' }}
                          spacing={0.75}
                          justifyContent="space-between"
                        >
                          <Typography level="body-sm">
                            {entry.summary}
                          </Typography>
                          <Chip
                            size="sm"
                            variant="soft"
                            color={
                              entry.actor === 'creator'
                                ? 'primary'
                                : entry.actor === 'audience'
                                  ? 'success'
                                  : 'neutral'
                            }
                          >
                            {entry.actor} ·{' '}
                            {formatSimulatorTimestamp(entry.occurredAt)}
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

          <Stack
            direction={{ xs: 'column', xl: 'row' }}
            spacing={2}
            sx={{ flex: 1, minHeight: 0, alignItems: 'stretch' }}
          >
            <Card
              variant="soft"
              sx={{ flex: 1, p: 2.5, minHeight: 0, overflow: 'hidden' }}
            >
              <Stack spacing={1.5} sx={{ height: '100%', minHeight: 0 }}>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  spacing={1}
                >
                  <Box>
                    <Typography level="title-lg">
                      {primaryThread.title}
                    </Typography>
                  </Box>
                  <Stack
                    direction="row"
                    spacing={0.5}
                    sx={{ alignItems: 'center' }}
                  >
                    <Chip
                      size="sm"
                      variant="soft"
                      color={primaryThread.badgeColor}
                    >
                      {primaryThread.badgeLabel}
                    </Chip>
                    <InfoPopoverButton
                      subject={primaryThread.title.toLowerCase()}
                      lines={primaryThread.infoLines}
                    />
                  </Stack>
                </Stack>

                <Stack
                  spacing={0}
                  sx={{ flex: 1, minHeight: 0, overflow: 'auto', pr: 0.5 }}
                >
                  {hasScenario && primaryThread.messages.length > 0 ? (
                    primaryThread.messages.map((message) => (
                      <Box key={message.id}>
                        <SimulatedDmThreadMessage
                          message={message}
                          onButtonClick={handlePreviewButtonClick}
                          messageMeta={threadMessageMetaById[message.id]}
                        />
                        {message.id !==
                        primaryThread.messages[
                          primaryThread.messages.length - 1
                        ]?.id ? (
                          <Divider
                            sx={{
                              my: 2,
                              borderColor: 'rgba(255,255,255,0.08)',
                            }}
                          />
                        ) : null}
                      </Box>
                    ))
                  ) : (
                    <EmptyStateCard
                      title={primaryThread.emptyTitle}
                      body={primaryThread.emptyBody}
                    />
                  )}
                </Stack>
              </Stack>
            </Card>

            <Card
              variant="soft"
              sx={{ flex: 1, p: 2.5, minHeight: 0, overflow: 'hidden' }}
            >
              <Stack spacing={1.5} sx={{ height: '100%', minHeight: 0 }}>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  spacing={1}
                >
                  <Box>
                    <Typography level="title-lg">
                      {secondaryThread.title}
                    </Typography>
                  </Box>
                  <Stack
                    direction="row"
                    spacing={0.5}
                    sx={{ alignItems: 'center' }}
                  >
                    <Chip
                      size="sm"
                      variant="soft"
                      color={secondaryThread.badgeColor}
                    >
                      {secondaryThread.badgeLabel}
                    </Chip>
                    <InfoPopoverButton
                      subject={secondaryThread.title.toLowerCase()}
                      lines={secondaryThread.infoLines}
                    />
                  </Stack>
                </Stack>

                <Stack
                  spacing={0}
                  sx={{ flex: 1, minHeight: 0, overflow: 'auto', pr: 0.5 }}
                >
                  {hasScenario && secondaryThread.messages.length > 0 ? (
                    secondaryThread.messages.map((message) => (
                      <Box key={message.id}>
                        <SimulatedDmThreadMessage
                          message={message}
                          onButtonClick={handlePreviewButtonClick}
                          messageMeta={threadMessageMetaById[message.id]}
                        />
                        {message.id !==
                        secondaryThread.messages[
                          secondaryThread.messages.length - 1
                        ]?.id ? (
                          <Divider
                            sx={{
                              my: 2,
                              borderColor: 'rgba(255,255,255,0.08)',
                            }}
                          />
                        ) : null}
                      </Box>
                    ))
                  ) : (
                    <EmptyStateCard
                      title={secondaryThread.emptyTitle}
                      body={secondaryThread.emptyBody}
                    />
                  )}
                </Stack>
              </Stack>
            </Card>
          </Stack>
        </Stack>
      </DialogContent>
      <RunningLateDialog
        open={runningLateDialogOpen}
        minutes={state?.audienceRunningLateMinutes}
        pending={false}
        onClose={() => setRunningLateDialogOpen(false)}
        onSave={async (minutes) => {
          if (
            !state ||
            !committedDraft ||
            state.audienceResponse !== 'interested' ||
            state.stage === 'ended'
          ) {
            return false
          }

          setState((currentState) =>
            currentState
              ? applySimulatorLifecycleAction(
                  currentState,
                  'audience-running-late',
                  committedDraft,
                  new Date(),
                  minutes,
                )
              : currentState,
          )
          return true
        }}
      />
    </DashboardModal>
  )
}
