import { useState } from 'react'
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
  DebugDmPreview,
  SimulatedAutoPlayPromptDraft,
  SimulatedScenarioDraft,
  SimulatedDmMessage,
  SimulatedThreadMessageMeta
} from '@game-is-up/shared'
import {
  formatSimulatorDurationLabel,
  formatSimulatorTimestamp
} from '@game-is-up/shared'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import { DashboardModal } from '../components/dashboard/DashboardModal'
import { EmptyStateCard } from '../components/dashboard/EmptyStateCard'
import { useDmLifecycleSimulator } from '../hooks/useDmLifecycleSimulator'

const defaultSimulatorDraft: SimulatedScenarioDraft = {
  creatorName: 'Ryan',
  audienceName: 'Morgan',
  gameTitle: 'Helldivers 2',
  scheduledForLabel: 'Tonight at 8:30 PM',
  note: 'Hop in if you are free. I can start right away once someone is in.'
}

const defaultAutoPlayDraft: SimulatedAutoPlayPromptDraft = {
  creatorName: 'Ryan',
  gameTitle: 'Helldivers 2',
  friendRecipientCount: 3,
  networkRecipientCount: 7
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
  const {
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
  } = useDmLifecycleSimulator({
    open,
    onClose,
    defaultSimulatorDraft,
    defaultAutoPlayDraft
  })

  return (
    <DashboardModal open={open} onClose={handleClose} width="min(98vw, 1380px)">
      <DialogTitle sx={{ pr: 6 }}>DM lifecycle simulator</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0, overflow: { xs: 'auto', lg: 'hidden' } }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
            In-memory DM simulation for call-to-play and auto-play prompt flows.
          </Typography>
          <InfoPopoverButton
            subject="the DM lifecycle simulator"
            lines={[
              'This simulator runs entirely in-memory in the browser and does not touch live notifications or DM rows.',
              'Use the DM buttons inside the rendered threads to drive the local lifecycle and inspect how retained anchors, replies, and handoff messages evolve.',
              'Call-to-play scenarios support in-place draft edits, while auto-play prompt scenarios focus on the prompt-to-summary handoff and closed-prompt cleanup path.'
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
                <Stack spacing={0.75}>
                  <Typography level="title-md">Scenario</Typography>
                  <Typography level="body-xs" sx={{ color: 'neutral.500' }}>
                    Choose the DM flow you want to rehearse.
                  </Typography>
                  <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap' }}>
                    <Button
                      size="sm"
                      variant={scenarioKind === 'call-to-play' ? 'solid' : 'soft'}
                      color="primary"
                      onClick={() => handleScenarioKindChange('call-to-play')}
                    >
                      Call to play
                    </Button>
                    <Button
                      size="sm"
                      variant={scenarioKind === 'auto-play-prompt' ? 'solid' : 'soft'}
                      color="primary"
                      onClick={() => handleScenarioKindChange('auto-play-prompt')}
                    >
                      Auto-play prompt
                    </Button>
                  </Stack>
                </Stack>

                <Divider />

                {scenarioKind === 'call-to-play' ? (
                  <>
                    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1}>
                      <Typography level="title-md">Call to play</Typography>
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
                      <Button size="sm" variant="solid" color="primary" disabled={!hasCtpScenario || !hasDraftChanges} onClick={applyScenarioChanges}>
                        Apply changes
                      </Button>
                      <Chip
                        size="sm"
                        variant="soft"
                        color={!hasCtpScenario ? 'neutral' : hasDraftChanges ? 'warning' : 'success'}
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
                      <Typography level="title-sm">Lifecycle shortcuts</Typography>
                      <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap' }}>
                        <Button
                          size="sm"
                          variant="soft"
                          color="warning"
                          disabled={!hasCtpScenario || state?.stage !== 'scheduled'}
                          onClick={handleScheduledStartReached}
                        >
                          Scheduled start reached
                        </Button>
                      </Stack>
                    </Stack>
                    <Divider />
                    <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap' }}>
                      <Chip size="sm" variant="soft" color={!hasCtpScenario ? 'neutral' : state?.stage === 'scheduled' ? 'primary' : 'neutral'}>
                        {!hasCtpScenario ? 'No scenario' : state?.stage === 'scheduled' ? 'Scheduled' : 'Not waiting for start'}
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
                      <Chip size="sm" variant="soft" color={state?.creatorThreadArchived ? 'warning' : 'neutral'}>
                        {state?.creatorThreadArchived ? 'Creator archived' : 'Creator retained'}
                      </Chip>
                      <Chip size="sm" variant="soft" color={state?.audienceThreadArchived ? 'warning' : 'neutral'}>
                        {state?.audienceThreadArchived ? 'Audience archived' : 'Audience retained'}
                      </Chip>
                      <Chip size="sm" variant="soft" color={state?.audienceResponse === 'interested' ? 'primary' : state?.audienceResponse === 'pass' ? 'warning' : 'neutral'}>
                        {state?.audienceResponse == null ? 'No audience reply yet' : `Audience: ${state.audienceResponse}`}
                      </Chip>
                    </Stack>
                  </>
                ) : (
                  <>
                    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1}>
                      <Typography level="title-md">Auto-play prompt</Typography>
                      <Button size="sm" variant="soft" color="primary" onClick={startAutoPlaySimulation}>
                        New auto-play prompt
                      </Button>
                    </Stack>
                    <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
                      Start the same DM prompt that Discord sends when it sees someone launch a game, then drive the duration, audience, closeout, and handoff steps from the thread buttons.
                    </Typography>
                    <FormControl>
                      <FormLabel>Game title</FormLabel>
                      <Input value={autoPlayDraft.gameTitle} onChange={(event) => handleAutoPlayFieldChange('gameTitle', event.target.value)} />
                    </FormControl>
                    <FormControl>
                      <FormLabel>Friends-only reach</FormLabel>
                      <Input type="number" value={String(autoPlayDraft.friendRecipientCount)} onChange={(event) => handleAutoPlayFieldChange('friendRecipientCount', event.target.value)} />
                    </FormControl>
                    <FormControl>
                      <FormLabel>Network + friends reach</FormLabel>
                      <Input type="number" value={String(autoPlayDraft.networkRecipientCount)} onChange={(event) => handleAutoPlayFieldChange('networkRecipientCount', event.target.value)} />
                    </FormControl>
                    <Chip
                      size="sm"
                      variant="soft"
                      color={!hasAutoPlayScenario ? 'neutral' : hasAutoPlayDraftChanges ? 'warning' : 'success'}
                      sx={{ width: 'fit-content' }}
                    >
                      {!hasAutoPlayScenario
                        ? 'No prompt started yet'
                        : hasAutoPlayDraftChanges
                        ? 'Draft changes apply when you start a fresh prompt'
                        : autoPlayState?.status === 'created' || autoPlayState?.status === 'created-ended'
                          ? 'Prompt handed off to call summary'
                          : 'Draft matches prompt context'}
                    </Chip>
                    <Divider />
                    <Stack spacing={0.75}>
                      <Typography level="title-sm">Lifecycle shortcuts</Typography>
                      <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap' }}>
                        <Button
                          size="sm"
                          variant="soft"
                          color="warning"
                          disabled={!hasAutoPlayScenario || (autoPlayState?.status !== 'initial' && autoPlayState?.status !== 'audience')}
                          onClick={handleAutoPlayObservationEnded}
                        >
                          Observation ended
                        </Button>
                      </Stack>
                    </Stack>
                    <Divider />
                    <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap' }}>
                      <Chip
                        size="sm"
                        variant="soft"
                        color={!hasAutoPlayScenario ? 'neutral' : autoPlayState?.status === 'created' ? 'success' : autoPlayState?.status === 'created-ended' ? 'danger' : autoPlayState?.status === 'expired' || autoPlayState?.status === 'declined' ? 'warning' : 'primary'}
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
                          {formatSimulatorDurationLabel(autoPlayState.durationMinutes)}
                        </Chip>
                      ) : null}
                      {autoPlayState?.notifyScope ? (
                        <Chip size="sm" variant="soft" color="neutral">
                          {autoPlayState.notifyScope === 'friends-only' ? 'Friends only' : 'Network + friends'}
                        </Chip>
                      ) : null}
                    </Stack>
                  </>
                )}
              </Stack>
            </Card>

            <Card variant="soft" sx={{ p: 2, minHeight: 0, overflow: 'hidden', flex: { xs: '0 0 auto', lg: '1 1 0%' } }}>
              <Stack spacing={1.25} sx={{ height: '100%', minHeight: 0 }}>
                <Typography level="title-md">Action log</Typography>
                <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
                  Local session timeline.
                </Typography>
                {activeHistory.length > 0 ? (
                  <Stack spacing={1} sx={{ flex: 1, minHeight: 0, overflow: 'auto', pr: 0.5 }}>
                    {activeHistory.map((entry) => (
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
                    <Typography level="title-lg">{primaryThread.title}</Typography>
                  </Box>
                  <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                    <Chip size="sm" variant="soft" color={primaryThread.badgeColor}>{primaryThread.badgeLabel}</Chip>
                    <InfoPopoverButton
                      subject={primaryThread.title.toLowerCase()}
                      lines={primaryThread.infoLines}
                    />
                  </Stack>
                </Stack>

                <Stack spacing={0} sx={{ flex: 1, minHeight: 0, overflow: 'auto', pr: 0.5 }}>
                  {hasScenario && primaryThread.messages.length > 0 ? primaryThread.messages.map((message) => (
                    <Box key={message.id}>
                      <SimulatedDmThreadMessage
                        message={message}
                        onButtonClick={handlePreviewButtonClick}
                        messageMeta={threadMessageMetaById[message.id]}
                      />
                      {message.id !== primaryThread.messages[primaryThread.messages.length - 1]?.id ? (
                        <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.08)' }} />
                      ) : null}
                    </Box>
                  )) : (
                    <EmptyStateCard
                      title={primaryThread.emptyTitle}
                      body={primaryThread.emptyBody}
                    />
                  )}
                </Stack>
              </Stack>
            </Card>

            <Card variant="soft" sx={{ flex: 1, p: 2.5, minHeight: 0, overflow: 'hidden' }}>
              <Stack spacing={1.5} sx={{ height: '100%', minHeight: 0 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                  <Box>
                    <Typography level="title-lg">{secondaryThread.title}</Typography>
                  </Box>
                  <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                    <Chip size="sm" variant="soft" color={secondaryThread.badgeColor}>{secondaryThread.badgeLabel}</Chip>
                    <InfoPopoverButton
                      subject={secondaryThread.title.toLowerCase()}
                      lines={secondaryThread.infoLines}
                    />
                  </Stack>
                </Stack>

                <Stack spacing={0} sx={{ flex: 1, minHeight: 0, overflow: 'auto', pr: 0.5 }}>
                  {hasScenario && secondaryThread.messages.length > 0 ? secondaryThread.messages.map((message) => (
                    <Box key={message.id}>
                      <SimulatedDmThreadMessage
                        message={message}
                        onButtonClick={handlePreviewButtonClick}
                        messageMeta={threadMessageMetaById[message.id]}
                      />
                      {message.id !== secondaryThread.messages[secondaryThread.messages.length - 1]?.id ? (
                        <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.08)' }} />
                      ) : null}
                    </Box>
                  )) : (
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
    </DashboardModal>
  )
}