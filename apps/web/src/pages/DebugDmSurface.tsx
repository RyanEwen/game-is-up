import { useEffect, useState } from 'react'
import {
  Box,
  Button,
  Card,
  Chip,
  DialogContent,
  DialogTitle,
  Link,
  Stack,
  Typography
} from '@mui/joy'
import type {
  DebugDmActionResponse,
  DebugDmInboxMessage,
  DebugDmInboxParticipant,
  DebugDmPreview,
  DebugPlayIntentSummary
} from '@game-is-up/shared'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import { DashboardModal } from '../components/dashboard/DashboardModal'
import { EmptyStateCard } from '../components/dashboard/EmptyStateCard'

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
          textDecorationColor: 'rgba(111, 217, 255, 0.38)'
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
          bgcolor: 'rgba(111, 217, 255, 0.12)'
        },
        '& pre': {
          overflowX: 'auto',
          p: 1.25,
          borderRadius: '10px',
          bgcolor: 'rgba(8, 14, 24, 0.72)',
          border: '1px solid rgba(111, 217, 255, 0.12)'
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
  return color != null ? `#${color.toString(16).padStart(6, '0')}` : 'rgba(255, 255, 255, 0.16)'
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
      <Stack spacing={2}>
        {preview.content ? (
          <Card variant="outlined" sx={{ p: 2, bgcolor: 'rgba(20, 24, 31, 0.72)' }}>
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
              bgcolor: 'rgba(16, 19, 25, 0.94)',
              borderColor: 'rgba(255, 255, 255, 0.08)',
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
                      border: '1px solid rgba(255, 255, 255, 0.08)'
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
                    border: '1px solid rgba(255, 255, 255, 0.08)'
                  }}
                />
              ) : null}
              {embed.footerText ? (
                <Box sx={{ pt: 0.5, borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
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
            <Typography level="title-sm">Buttons</Typography>
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
        ) : (
          <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
            This DM has no interactive buttons.
          </Typography>
        )}
      </Stack>
    </Card>
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