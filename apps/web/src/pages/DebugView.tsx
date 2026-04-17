import { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Card,
  Chip,
  DialogContent,
  DialogTitle,
  Input,
  Link,
  Option,
  Select,
  Stack,
  Table,
  Typography
} from '@mui/joy'
import type {
  DebugAdminResponse,
  DebugAutoPlayPrompt,
  DebugDmActionResponse,
  DebugDmInboxMessage,
  DebugDmInboxParticipant,
  DebugDmPreview,
  DebugErrorLog,
  DebugNotificationDelivery,
  DebugPlayIntentLifecycleEvent,
  DebugPlayIntentSummary
} from '@game-is-up/shared'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import { DashboardModal } from '../components/dashboard/DashboardModal'
import { EmptyStateCard } from '../components/dashboard/EmptyStateCard'
import { SectionNav, sectionScrollMarginTop } from '../components/dashboard/SectionNav'
import { useDashboardContext } from '../contexts/useDashboardContext'

type SortDirection = 'asc' | 'desc'
type CtpSortKey = 'createdAt' | 'windowStartsAt' | 'creator' | 'status' | 'notificationCount' | 'errorCount'
type ErrorSortKey = 'occurredAt' | 'source' | 'message'
type PromptSortKey = 'createdAt' | 'user' | 'game' | 'status' | 'deliveredAt' | 'respondedAt'
type NotificationSortKey = 'createdAt' | 'recipient' | 'game' | 'triggeredBy' | 'deliveredAt'

const tablePageSize = 10

function useLocalDateFormatter() {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Etc/UTC'

  const formatter = useMemo(() => new Intl.DateTimeFormat(undefined, {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  }), [timeZone])

  return {
    timeZone,
    formatDateTime: (value: string | null) => {
      if (!value) {
        return 'Not available'
      }

      return formatter.format(new Date(value))
    }
  }
}

function paginateRows<T>(rows: T[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize
  return rows.slice(start, start + pageSize)
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
        '& p + p, & p + ul, & p + ol, & ul + p, & ol + p, & ul + ul, & ol + ol, & blockquote + p, & pre + p': {
          mt: 1.25
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
        },
        '& blockquote': {
          pl: 1.5,
          borderLeft: '3px solid rgba(111, 217, 255, 0.3)',
          color: 'neutral.300'
        }
      }}
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
        {content}
      </ReactMarkdown>
    </Box>
  )
}

function getDmInboxParticipantKey(participant: DebugDmInboxParticipant) {
  return `${participant.role}:${participant.user.id}`
}

function formatDiscordEmbedColor(color: number | null) {
  return color != null ? `#${color.toString(16).padStart(6, '0')}` : 'rgba(255, 255, 255, 0.16)'
}

function DmPreviewCard({
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

function DmPreviewDialog({
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
            chips={['Admin only', 'DM preview']}
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
          Latest mailbox state for the creator and each audience member tied to this call to play. Each card represents the latest state of a real DM thread, not every intermediate edit.
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
                            {participant.messages.length} {participant.messages.length === 1 ? 'thread' : 'threads'}
                          </Chip>
                          {participant.messages.length === 0 ? (
                            <Chip size="sm" variant="outlined" color="warning">
                              No DM thread yet
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
                      title="No DM threads for this user"
                      body="This participant is part of the computed audience, but no call-to-play DM thread exists for them in the current snapshot yet."
                      chips={['CTP mailbox', 'Latest state']}
                    />
                  )}
                </>
              ) : (
                <EmptyStateCard
                  title="No user selected"
                  body="Choose a user from the left side to inspect their latest DM threads for this call to play."
                  chips={['CTP mailbox', 'User picker']}
                />
              )}
            </Stack>
          </Stack>
        ) : (
          <EmptyStateCard
            title="No mailbox data for this call to play"
            body="No creator or recipient DM threads were found for the current snapshot."
            chips={['CTP mailbox', 'Admin only']}
          />
        )}
      </DialogContent>
    </DashboardModal>
  )
}

function CtpLifecycleDialog({
  open,
  onClose,
  ctp,
  events,
  formatDateTime,
  onOpenDmInbox
}: {
  open: boolean;
  onClose: () => void;
  ctp: DebugPlayIntentSummary | null;
  events: DebugPlayIntentLifecycleEvent[];
  formatDateTime: (value: string | null) => string;
  onOpenDmInbox: (ctp: DebugPlayIntentSummary) => void;
}) {
  if (!ctp) {
    return null
  }

  return (
    <DashboardModal open={open} onClose={onClose} width="min(96vw, 980px)">
      <DialogTitle sx={{ pr: 6 }}>CTP lifecycle: {ctp.headline}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0, overflow: 'auto' }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ flexWrap: 'wrap' }}>
          <Chip variant="outlined">Creator: {ctp.creator.displayName}</Chip>
          <Chip variant="outlined">Status: {ctp.status}</Chip>
          <Chip variant="outlined">Scope: {ctp.notifyScope}</Chip>
          <Chip variant="outlined">Selection: {ctp.selectionMode}</Chip>
          <Chip variant="outlined">Notifications: {ctp.notificationCount}</Chip>
        </Stack>

        <Card variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={0.75}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }}>
              <Typography level="title-sm">Session window</Typography>
              <Button size="sm" variant="outlined" color="neutral" disabled={ctp.dmInboxParticipants.length === 0} onClick={() => onOpenDmInbox(ctp)}>
                Open DM emulator
              </Button>
            </Stack>
            <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
              Created {formatDateTime(ctp.createdAt)}
            </Typography>
            <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
              Starts {formatDateTime(ctp.windowStartsAt)}
            </Typography>
            <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
              Ends {formatDateTime(ctp.windowEndsAt)}
            </Typography>
          </Stack>
        </Card>

        {events.length > 0 ? (
          <Stack spacing={1}>
            {events.map((eventEntry) => (
              <Card key={eventEntry.id} variant="outlined" sx={{ p: 1.5 }}>
                <Stack spacing={0.5}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between">
                    <Typography level="title-sm">{eventEntry.summary}</Typography>
                    <Chip size="sm" color={eventEntry.isError ? 'danger' : 'neutral'} variant={eventEntry.isError ? 'soft' : 'outlined'}>
                      {eventEntry.source}
                    </Chip>
                  </Stack>
                  <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                    {formatDateTime(eventEntry.occurredAt)}
                  </Typography>
                  <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                    {eventEntry.details ?? `Event type: ${eventEntry.eventType}`}
                  </Typography>
                  <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                    Actor: {eventEntry.actorDisplayName ?? 'System'} · Recipient: {eventEntry.recipientDisplayName ?? 'N/A'}
                  </Typography>
                </Stack>
              </Card>
            ))}
          </Stack>
        ) : (
          <EmptyStateCard
            title="No lifecycle events found"
            body="No additional rows were recorded for this call-to-play timeline yet."
            chips={['CTP lifecycle', 'Chronological order']}
          />
        )}
      </DialogContent>
    </DashboardModal>
  )
}

function CtpTableSection({
  debugAdmin,
  formatDateTime,
  onOpenLifecycle
}: {
  debugAdmin: DebugAdminResponse;
  formatDateTime: (value: string | null) => string;
  onOpenLifecycle: (playIntentId: string) => void;
}) {
  const [query, setQuery] = useState('')
  const [scopeFilter, setScopeFilter] = useState<'all' | 'network' | 'friends-only' | 'specific-friends' | 'specific-discord-server'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'ended'>('all')
  const [sortKey, setSortKey] = useState<CtpSortKey>('createdAt')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [page, setPage] = useState(1)

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    const rows = debugAdmin.recentPlayIntents.filter((intent) => {
      if (statusFilter !== 'all' && intent.status !== statusFilter) {
        return false
      }

      if (scopeFilter !== 'all' && intent.notifyScope !== scopeFilter) {
        return false
      }

      if (!normalizedQuery) {
        return true
      }

      return [
        intent.headline,
        intent.creator.displayName,
        intent.creator.handle,
        ...intent.gameTitles,
        ...intent.platformLabels,
        intent.id
      ].join(' ').toLowerCase().includes(normalizedQuery)
    })

    rows.sort((left, right) => {
      let result = 0

      switch (sortKey) {
        case 'creator':
          result = left.creator.displayName.localeCompare(right.creator.displayName)
          break
        case 'status':
          result = left.status.localeCompare(right.status)
          break
        case 'notificationCount':
          result = left.notificationCount - right.notificationCount
          break
        case 'errorCount':
          result = left.errorCount - right.errorCount
          break
        case 'windowStartsAt':
          result = new Date(left.windowStartsAt).getTime() - new Date(right.windowStartsAt).getTime()
          break
        default:
          result = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
      }

      return sortDirection === 'asc' ? result : -result
    })

    return rows
  }, [debugAdmin.recentPlayIntents, query, scopeFilter, statusFilter, sortKey, sortDirection])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / tablePageSize))
  const currentPage = Math.min(page, pageCount)
  const pagedRows = paginateRows(filteredRows, currentPage, tablePageSize)

  const setSort = (nextKey: CtpSortKey) => {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(nextKey)
    setSortDirection('desc')
  }

  return (
    <Card variant="soft" sx={{ p: 3 }}>
      <Stack spacing={1.5}>
        <Stack spacing={0.5}>
          <Typography level="title-lg">Calls to play</Typography>
          <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
            Sort, filter, and page through CTP rows. Click any row to inspect the full lifecycle timeline in chronological order.
          </Typography>
        </Stack>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
          <Input
            placeholder="Filter by creator, game, platform, headline, or ID"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(1)
            }}
            sx={{ flex: 1 }}
          />
          <Select
            value={statusFilter}
            onChange={(_event, value) => {
              if (!value) {
                return
              }

              setStatusFilter(value)
              setPage(1)
            }}
            sx={{ minWidth: 170 }}
          >
            <Option value="all">All statuses</Option>
            <Option value="active">Active</Option>
            <Option value="ended">Ended</Option>
          </Select>
          <Select
            value={scopeFilter}
            onChange={(_event, value) => {
              if (!value) {
                return
              }

              setScopeFilter(value)
              setPage(1)
            }}
            sx={{ minWidth: 210 }}
          >
            <Option value="all">All audiences</Option>
            <Option value="network">Network</Option>
            <Option value="friends-only">Friends only</Option>
            <Option value="specific-friends">Specific friends</Option>
            <Option value="specific-discord-server">Specific Discord servers</Option>
          </Select>
        </Stack>

        {filteredRows.length > 0 ? (
          <>
            <Box sx={{ overflowX: 'auto' }}>
              <Table hoverRow borderAxis="bothBetween" stickyHeader>
                <thead>
                  <tr>
                    <th><Button size="sm" variant="plain" onClick={() => setSort('createdAt')}>Created</Button></th>
                    <th><Button size="sm" variant="plain" onClick={() => setSort('creator')}>Creator</Button></th>
                    <th>Headline</th>
                    <th><Button size="sm" variant="plain" onClick={() => setSort('status')}>Status</Button></th>
                    <th><Button size="sm" variant="plain" onClick={() => setSort('windowStartsAt')}>Starts</Button></th>
                    <th><Button size="sm" variant="plain" onClick={() => setSort('notificationCount')}>Notifications</Button></th>
                    <th><Button size="sm" variant="plain" onClick={() => setSort('errorCount')}>Errors</Button></th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((intent) => (
                    <tr
                      key={intent.id}
                      onClick={() => onOpenLifecycle(intent.id)}
                      style={{ cursor: 'pointer' }}
                      aria-label={`Open lifecycle for ${intent.headline}`}
                    >
                      <td>{formatDateTime(intent.createdAt)}</td>
                      <td>{intent.creator.displayName}</td>
                      <td>
                        <Stack spacing={0.25}>
                          <Typography level="body-sm">{intent.headline}</Typography>
                          <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                            Scope: {intent.notifyScope} · {intent.selectionMode}
                          </Typography>
                        </Stack>
                      </td>
                      <td>
                        <Chip size="sm" color={intent.status === 'active' ? 'success' : 'neutral'} variant={intent.status === 'active' ? 'soft' : 'outlined'}>
                          {intent.status}
                        </Chip>
                      </td>
                      <td>{formatDateTime(intent.windowStartsAt)}</td>
                      <td>{intent.notificationCount}</td>
                      <td>
                        <Chip size="sm" color={intent.errorCount > 0 ? 'danger' : 'neutral'} variant={intent.errorCount > 0 ? 'soft' : 'outlined'}>
                          {intent.errorCount}
                        </Chip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={1}>
              <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                Showing {pagedRows.length} of {filteredRows.length} CTP rows
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <Button size="sm" variant="outlined" color="neutral" disabled={currentPage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                  Previous
                </Button>
                <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                  Page {currentPage} of {pageCount}
                </Typography>
                <Button size="sm" variant="outlined" color="neutral" disabled={currentPage >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>
                  Next
                </Button>
              </Stack>
            </Stack>
          </>
        ) : (
          <EmptyStateCard
            title="No CTP rows match these filters"
            body="Try clearing filters or create a new call to play to populate this table."
            chips={['CTP table', 'Filters', 'Pagination']}
          />
        )}
      </Stack>
    </Card>
  )
}

function ErrorTableSection({
  rows,
  formatDateTime
}: {
  rows: DebugErrorLog[];
  formatDateTime: (value: string | null) => string;
}) {
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<ErrorSortKey>('occurredAt')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [page, setPage] = useState(1)

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    const nextRows = rows.filter((row) => {
      if (!normalizedQuery) {
        return true
      }

      return [row.source, row.message, row.detail ?? '', row.playIntentId ?? '', row.notificationId ?? '']
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery)
    })

    nextRows.sort((left, right) => {
      let result = 0

      switch (sortKey) {
        case 'source':
          result = left.source.localeCompare(right.source)
          break
        case 'message':
          result = left.message.localeCompare(right.message)
          break
        default:
          result = new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime()
      }

      return sortDirection === 'asc' ? result : -result
    })

    return nextRows
  }, [rows, query, sortKey, sortDirection])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / tablePageSize))
  const currentPage = Math.min(page, pageCount)
  const pagedRows = paginateRows(filteredRows, currentPage, tablePageSize)

  const setSort = (nextKey: ErrorSortKey) => {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(nextKey)
    setSortDirection('desc')
  }

  return (
    <Card variant="soft" sx={{ p: 3 }}>
      <Stack spacing={1.5}>
        <Stack spacing={0.5}>
          <Typography level="title-lg">Error log</Typography>
          <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
            Aggregated runtime and DM-path errors observed in recent debug data.
          </Typography>
        </Stack>

        <Input
          placeholder="Filter by source, message, detail, or IDs"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setPage(1)
          }}
        />

        {filteredRows.length > 0 ? (
          <>
            <Box sx={{ overflowX: 'auto' }}>
              <Table hoverRow borderAxis="bothBetween" stickyHeader>
                <thead>
                  <tr>
                    <th><Button size="sm" variant="plain" onClick={() => setSort('occurredAt')}>Occurred</Button></th>
                    <th><Button size="sm" variant="plain" onClick={() => setSort('source')}>Source</Button></th>
                    <th><Button size="sm" variant="plain" onClick={() => setSort('message')}>Message</Button></th>
                    <th>Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDateTime(row.occurredAt)}</td>
                      <td>
                        <Chip size="sm" color="danger" variant="soft">{row.source}</Chip>
                      </td>
                      <td>
                        <Stack spacing={0.25}>
                          <Typography level="body-sm">{row.message}</Typography>
                          {row.detail ? <Typography level="body-xs" sx={{ color: 'neutral.400' }}>{row.detail}</Typography> : null}
                        </Stack>
                      </td>
                      <td>
                        <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                          CTP {row.playIntentId ?? 'N/A'}
                        </Typography>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={1}>
              <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                Showing {pagedRows.length} of {filteredRows.length} errors
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <Button size="sm" variant="outlined" color="neutral" disabled={currentPage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                  Previous
                </Button>
                <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                  Page {currentPage} of {pageCount}
                </Typography>
                <Button size="sm" variant="outlined" color="neutral" disabled={currentPage >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>
                  Next
                </Button>
              </Stack>
            </Stack>
          </>
        ) : (
          <EmptyStateCard
            title="No error logs in this snapshot"
            body="When prompt, bot, or notification-path errors are captured, they will appear here."
            chips={['Error table', 'Filters', 'Pagination']}
          />
        )}
      </Stack>
    </Card>
  )
}

function BotStateCard({ debugAdmin, formatDateTime }: { debugAdmin: DebugAdminResponse; formatDateTime: (value: string | null) => string }) {
  return (
    <Card variant="soft" sx={{ p: 3 }}>
      <Stack spacing={1.5}>
        <Box>
          <Typography level="title-lg">Bot status</Typography>
          <Typography level="body-sm" sx={{ color: 'neutral.400', mt: 0.5 }}>
            Current connection state for the Discord bot process and the latest readiness/error timestamps.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
          <Chip color={debugAdmin.bot.configured ? 'success' : 'neutral'} variant={debugAdmin.bot.configured ? 'soft' : 'outlined'}>
            {debugAdmin.bot.configured ? 'Configured' : 'Missing bot token'}
          </Chip>
          <Chip variant="outlined">Mode: {debugAdmin.bot.mode}</Chip>
          <Chip color={debugAdmin.bot.connected ? 'success' : debugAdmin.bot.mode === 'gateway' ? 'warning' : 'neutral'} variant={debugAdmin.bot.connected ? 'soft' : 'outlined'}>
            {debugAdmin.bot.connected ? 'Gateway connected' : debugAdmin.bot.mode === 'gateway' ? 'Gateway disconnected' : 'Gateway disabled'}
          </Chip>
          <Chip variant="outlined">{debugAdmin.bot.guildCount} guilds</Chip>
        </Stack>
        <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
          Bot user: {debugAdmin.bot.userTag ?? 'Not signed in'}
        </Typography>
        <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
          Last ready: {formatDateTime(debugAdmin.bot.lastReadyAt)}
        </Typography>
        <Typography level="body-sm" sx={{ color: debugAdmin.bot.lastError ? 'warning.300' : 'neutral.300' }}>
          Last error: {debugAdmin.bot.lastError ?? 'None'}
        </Typography>
      </Stack>
    </Card>
  )
}

function PromptLogCard({
  debugAdmin,
  formatDateTime,
  onOpenPreview
}: {
  debugAdmin: DebugAdminResponse;
  formatDateTime: (value: string | null) => string;
  onOpenPreview: (prompt: DebugAutoPlayPrompt) => void;
}) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'sent' | 'skipped' | 'failed' | 'accepted' | 'declined' | 'expired' | 'settle_sent' | 'settle_confirmed' | 'settle_declined'
  >('all')
  const [sortKey, setSortKey] = useState<PromptSortKey>('createdAt')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [page, setPage] = useState(1)

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    const rows = debugAdmin.recentAutoPlayPrompts.filter((prompt) => {
      if (statusFilter !== 'all' && prompt.status !== statusFilter) {
        return false
      }

      if (!normalizedQuery) {
        return true
      }

      return [
        prompt.user.displayName,
        prompt.user.handle,
        prompt.game.title,
        prompt.statusDetail ?? '',
        prompt.dmError ?? '',
        prompt.id
      ].join(' ').toLowerCase().includes(normalizedQuery)
    })

    rows.sort((left, right) => {
      let result = 0

      switch (sortKey) {
        case 'user':
          result = left.user.displayName.localeCompare(right.user.displayName)
          break
        case 'game':
          result = left.game.title.localeCompare(right.game.title)
          break
        case 'status':
          result = left.status.localeCompare(right.status)
          break
        case 'deliveredAt':
          result = (left.deliveredAt ?? '').localeCompare(right.deliveredAt ?? '')
          break
        case 'respondedAt':
          result = (left.respondedAt ?? '').localeCompare(right.respondedAt ?? '')
          break
        default:
          result = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
      }

      return sortDirection === 'asc' ? result : -result
    })

    return rows
  }, [debugAdmin.recentAutoPlayPrompts, query, statusFilter, sortKey, sortDirection])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / tablePageSize))
  const currentPage = Math.min(page, pageCount)
  const pagedRows = paginateRows(filteredRows, currentPage, tablePageSize)

  const setSort = (nextKey: PromptSortKey) => {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(nextKey)
    setSortDirection('desc')
  }

  return (
    <Card variant="soft" sx={{ p: 3 }}>
      <Stack spacing={1.5}>
        <Stack spacing={0.5}>
          <Typography level="title-lg">Recent auto-play prompts</Typography>
          <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
            Sort, filter, and page through prompt decisions from Discord activity starts, including skipped reasons, delivery failures, and Discord-created CTP attempts.
          </Typography>
        </Stack>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
          <Input
            placeholder="Filter by user, game, detail, or ID"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(1)
            }}
            sx={{ flex: 1 }}
          />
          <Select
            value={statusFilter}
            onChange={(_event, value) => {
              if (!value) {
                return
              }

              setStatusFilter(value)
              setPage(1)
            }}
            sx={{ minWidth: 170 }}
          >
            <Option value="all">All statuses</Option>
            <Option value="sent">Sent</Option>
            <Option value="skipped">Skipped</Option>
            <Option value="accepted">Accepted</Option>
            <Option value="declined">Declined</Option>
            <Option value="expired">Expired</Option>
            <Option value="settle_sent">Settle prompt</Option>
            <Option value="settle_confirmed">Settled</Option>
            <Option value="settle_declined">Still deciding</Option>
            <Option value="failed">Failed</Option>
          </Select>
        </Stack>

        {filteredRows.length > 0 ? (
          <>
            <Box sx={{ overflowX: 'auto' }}>
              <Table hoverRow borderAxis="bothBetween" stickyHeader>
                <thead>
                  <tr>
                    <th><Button size="sm" variant="plain" onClick={() => setSort('createdAt')}>Created</Button></th>
                    <th><Button size="sm" variant="plain" onClick={() => setSort('user')}>User</Button></th>
                    <th><Button size="sm" variant="plain" onClick={() => setSort('game')}>Game</Button></th>
                    <th><Button size="sm" variant="plain" onClick={() => setSort('status')}>Status</Button></th>
                    <th>Detail</th>
                    <th><Button size="sm" variant="plain" onClick={() => setSort('deliveredAt')}>Delivered</Button></th>
                    <th><Button size="sm" variant="plain" onClick={() => setSort('respondedAt')}>Responded</Button></th>
                    <th>CTP</th>
                    <th>Preview</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((prompt) => (
                    <tr key={prompt.id}>
                      <td>{formatDateTime(prompt.createdAt)}</td>
                      <td>
                        <Stack spacing={0.25}>
                          <Typography level="body-sm">{prompt.user.displayName}</Typography>
                          <Typography level="body-xs" sx={{ color: 'neutral.400' }}>@{prompt.user.handle}</Typography>
                        </Stack>
                      </td>
                      <td>{prompt.game.title}</td>
                      <td>
                        <Chip
                          size="sm"
                          variant="soft"
                          color={prompt.status === 'accepted' ? 'success' : prompt.status === 'declined' || prompt.status === 'failed' ? 'danger' : prompt.status === 'expired' ? 'warning' : 'neutral'}
                        >
                          {prompt.status}
                        </Chip>
                      </td>
                      <td>
                        <Stack spacing={0.25}>
                          <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                            {prompt.statusDetail ?? 'No detail recorded.'}
                          </Typography>
                          {prompt.dmError ? (
                            <Typography level="body-xs" sx={{ color: 'warning.300' }}>
                              DM error: {prompt.dmError}
                            </Typography>
                          ) : null}
                        </Stack>
                      </td>
                      <td>
                        <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                          {formatDateTime(prompt.deliveredAt)}
                        </Typography>
                      </td>
                      <td>
                        <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                          {formatDateTime(prompt.respondedAt)}
                        </Typography>
                      </td>
                      <td>
                        <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                          {prompt.createdPlayIntentId ?? 'Not created'}
                        </Typography>
                      </td>
                      <td>
                        <Button size="sm" variant="outlined" color="neutral" disabled={!prompt.dmPreview} onClick={() => onOpenPreview(prompt)}>
                          Preview DM
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={1}>
              <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                Showing {pagedRows.length} of {filteredRows.length} prompt rows
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <Button size="sm" variant="outlined" color="neutral" disabled={currentPage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                  Previous
                </Button>
                <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                  Page {currentPage} of {pageCount}
                </Typography>
                <Button size="sm" variant="outlined" color="neutral" disabled={currentPage >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>
                  Next
                </Button>
              </Stack>
            </Stack>
          </>
        ) : (
          <EmptyStateCard
            title="No prompt rows match these filters"
            body="Try clearing filters or wait for the bot to observe Discord activity."
            chips={['Discord presence', 'Prompt log']}
          />
        )}
      </Stack>
    </Card>
  )
}

function NotificationLogCard({
  debugAdmin,
  formatDateTime,
  onOpenPreview
}: {
  debugAdmin: DebugAdminResponse;
  formatDateTime: (value: string | null) => string;
  onOpenPreview: (notification: DebugNotificationDelivery) => void;
}) {
  const [query, setQuery] = useState('')
  const [deliveryFilter, setDeliveryFilter] = useState<'all' | 'delivered' | 'stored'>('all')
  const [sortKey, setSortKey] = useState<NotificationSortKey>('createdAt')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [page, setPage] = useState(1)

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    const rows = debugAdmin.recentNotifications.filter((notification) => {
      if (deliveryFilter === 'delivered' && !notification.deliveredAt) {
        return false
      }

      if (deliveryFilter === 'stored' && notification.deliveredAt) {
        return false
      }

      if (!normalizedQuery) {
        return true
      }

      return [
        notification.recipient.displayName,
        notification.recipient.handle,
        notification.title,
        notification.body,
        notification.gameTitle ?? '',
        notification.triggeredBy?.displayName ?? '',
        notification.triggeredBy?.handle ?? '',
        notification.id
      ].join(' ').toLowerCase().includes(normalizedQuery)
    })

    rows.sort((left, right) => {
      let result = 0

      switch (sortKey) {
        case 'recipient':
          result = left.recipient.displayName.localeCompare(right.recipient.displayName)
          break
        case 'game':
          result = (left.gameTitle ?? '').localeCompare(right.gameTitle ?? '')
          break
        case 'triggeredBy':
          result = (left.triggeredBy?.displayName ?? '').localeCompare(right.triggeredBy?.displayName ?? '')
          break
        case 'deliveredAt':
          result = (left.deliveredAt ?? '').localeCompare(right.deliveredAt ?? '')
          break
        default:
          result = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
      }

      return sortDirection === 'asc' ? result : -result
    })

    return rows
  }, [debugAdmin.recentNotifications, query, deliveryFilter, sortKey, sortDirection])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / tablePageSize))
  const currentPage = Math.min(page, pageCount)
  const pagedRows = paginateRows(filteredRows, currentPage, tablePageSize)

  const setSort = (nextKey: NotificationSortKey) => {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(nextKey)
    setSortDirection('desc')
  }

  return (
    <Card variant="soft" sx={{ p: 3 }}>
      <Stack spacing={1.5}>
        <Stack spacing={0.5}>
          <Typography level="title-lg">Recent notification deliveries</Typography>
          <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
            Sort, filter, and page through call-to-play notification rows, with delivery timestamps for the Discord DM path.
          </Typography>
        </Stack>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
          <Input
            placeholder="Filter by recipient, game, title, triggered by, or ID"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(1)
            }}
            sx={{ flex: 1 }}
          />
          <Select
            value={deliveryFilter}
            onChange={(_event, value) => {
              if (!value) {
                return
              }

              setDeliveryFilter(value)
              setPage(1)
            }}
            sx={{ minWidth: 170 }}
          >
            <Option value="all">All deliveries</Option>
            <Option value="delivered">DM delivered</Option>
            <Option value="stored">Stored only</Option>
          </Select>
        </Stack>

        {filteredRows.length > 0 ? (
          <>
            <Box sx={{ overflowX: 'auto' }}>
              <Table hoverRow borderAxis="bothBetween" stickyHeader>
                <thead>
                  <tr>
                    <th><Button size="sm" variant="plain" onClick={() => setSort('createdAt')}>Created</Button></th>
                    <th><Button size="sm" variant="plain" onClick={() => setSort('recipient')}>Recipient</Button></th>
                    <th>Title</th>
                    <th><Button size="sm" variant="plain" onClick={() => setSort('game')}>Game</Button></th>
                    <th><Button size="sm" variant="plain" onClick={() => setSort('triggeredBy')}>Triggered by</Button></th>
                    <th><Button size="sm" variant="plain" onClick={() => setSort('deliveredAt')}>Delivery</Button></th>
                    <th>Preview</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((notification) => (
                    <tr key={notification.id}>
                      <td>{formatDateTime(notification.createdAt)}</td>
                      <td>
                        <Typography level="body-sm">{notification.recipient.displayName}</Typography>
                        <Typography level="body-xs" sx={{ color: 'neutral.400' }}>@{notification.recipient.handle}</Typography>
                      </td>
                      <td>
                        <Stack spacing={0.25}>
                          <Typography level="body-sm">{notification.title}</Typography>
                          <Typography level="body-xs" sx={{ color: 'neutral.400' }}>{notification.body}</Typography>
                        </Stack>
                      </td>
                      <td>{notification.gameTitle ?? 'None'}</td>
                      <td>
                        <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                          {notification.triggeredBy ? `${notification.triggeredBy.displayName} @${notification.triggeredBy.handle}` : 'System'}
                        </Typography>
                      </td>
                      <td>
                        <Chip size="sm" color={notification.deliveredAt ? 'success' : 'neutral'} variant={notification.deliveredAt ? 'soft' : 'outlined'}>
                          {notification.deliveredAt ? 'DM delivered' : 'Stored only'}
                        </Chip>
                        <Typography level="body-xs" sx={{ color: 'neutral.400', mt: 0.5 }}>
                          {formatDateTime(notification.deliveredAt)}
                        </Typography>
                      </td>
                      <td>
                        <Button size="sm" variant="outlined" color="neutral" disabled={!notification.dmPreview} onClick={() => onOpenPreview(notification)}>
                          Preview DM
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={1}>
              <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                Showing {pagedRows.length} of {filteredRows.length} notification rows
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <Button size="sm" variant="outlined" color="neutral" disabled={currentPage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                  Previous
                </Button>
                <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                  Page {currentPage} of {pageCount}
                </Typography>
                <Button size="sm" variant="outlined" color="neutral" disabled={currentPage >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>
                  Next
                </Button>
              </Stack>
            </Stack>
          </>
        ) : (
          <EmptyStateCard
            title="No notification rows match these filters"
            body="Try clearing filters or wait for a call to play to match someone and create a notification row."
            chips={['Notification rows', 'Delivery timestamp', 'Discord DM path']}
          />
        )}
      </Stack>
    </Card>
  )
}

function DebugViewContent({
  isSignedIn,
  debugAdmin,
  debugLoading,
  onRefreshDebug,
  buildApiUrl,
  parseDebugDmActionResponse
}: {
  isSignedIn: boolean;
  debugAdmin: DebugAdminResponse | null;
  debugLoading: boolean;
  onRefreshDebug: () => Promise<void>;
  buildApiUrl: (path: string) => string;
  parseDebugDmActionResponse: (value: unknown) => DebugDmActionResponse;
}) {
  const { timeZone, formatDateTime } = useLocalDateFormatter()
  const [selectedPlayIntentId, setSelectedPlayIntentId] = useState<string | null>(null)
  const [selectedMailboxPlayIntentId, setSelectedMailboxPlayIntentId] = useState<string | null>(null)
  const [selectedDmPreview, setSelectedDmPreview] = useState<{
    title: string;
    subtitle: string;
    preview: DebugDmPreview | null;
  } | null>(null)

  if (!isSignedIn) {
    return (
      <EmptyStateCard
        title="Sign in to inspect debug data"
        body="The debug view is only populated for authenticated sessions so it can reuse the same backend access checks as the rest of the dashboard."
        chips={['Admin only', 'Signed-in route', 'Bot and prompt logs']}
      />
    )
  }

  const selectedPlayIntent = debugAdmin?.recentPlayIntents.find((intent) => intent.id === selectedPlayIntentId) ?? null
  const selectedMailboxPlayIntent = debugAdmin?.recentPlayIntents.find((intent) => intent.id === selectedMailboxPlayIntentId) ?? null
  const selectedLifecycleEvents = debugAdmin?.playIntentLifecycleEvents
    .filter((eventEntry) => eventEntry.playIntentId === selectedPlayIntentId)
    .sort((left, right) => new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime()) ?? []

  return (
    <>
      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
          <Box>
            <Typography level="h2">Admin and debug</Typography>
            <Typography level="body-md" sx={{ color: 'neutral.300', mt: 0.5 }}>
              Inspect bot state, CTP lifecycle timelines, prompt decisions, and delivery/error logs.
            </Typography>
            <Typography level="body-xs" sx={{ color: 'neutral.500', mt: 0.5 }}>
              Times shown in your local timezone: {timeZone}
            </Typography>
          </Box>
          <Button variant="outlined" color="neutral" onClick={() => void onRefreshDebug()}>
            {debugLoading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </Stack>

        {debugAdmin ? (
          <>
            <SectionNav
              aria-label="Debug sections"
              mb={0}
              sections={[
                { id: 'bot-status', label: 'Bot' },
                { id: 'ctps', label: 'CTPs', count: debugAdmin.recentPlayIntents.length },
                { id: 'prompts', label: 'Prompts', count: debugAdmin.recentAutoPlayPrompts.length },
                { id: 'notifications', label: 'Notifications', count: debugAdmin.recentNotifications.length },
                { id: 'errors', label: 'Errors', count: debugAdmin.recentErrors.length }
              ]}
            />

            <Box id="bot-status" sx={{ scrollMarginTop: sectionScrollMarginTop }}>
              <BotStateCard debugAdmin={debugAdmin} formatDateTime={formatDateTime} />
            </Box>

            <Box id="ctps" sx={{ scrollMarginTop: sectionScrollMarginTop }}>
              <CtpTableSection debugAdmin={debugAdmin} formatDateTime={formatDateTime} onOpenLifecycle={setSelectedPlayIntentId} />
            </Box>

            <Box id="prompts" sx={{ scrollMarginTop: sectionScrollMarginTop }}>
              <PromptLogCard
                debugAdmin={debugAdmin}
                formatDateTime={formatDateTime}
                onOpenPreview={(prompt) => setSelectedDmPreview({
                  title: `Auto-play DM: ${prompt.game.title}`,
                  subtitle: `${prompt.user.displayName} @${prompt.user.handle} · status ${prompt.status}`,
                  preview: prompt.dmPreview
                })}
              />
            </Box>

            <Box id="notifications" sx={{ scrollMarginTop: sectionScrollMarginTop }}>
              <NotificationLogCard
                debugAdmin={debugAdmin}
                formatDateTime={formatDateTime}
                onOpenPreview={(notification) => setSelectedDmPreview({
                  title: `Notification DM: ${notification.title}`,
                  subtitle: `${notification.recipient.displayName} @${notification.recipient.handle}`,
                  preview: notification.dmPreview
                })}
              />
            </Box>

            <Box id="errors" sx={{ scrollMarginTop: sectionScrollMarginTop }}>
              <ErrorTableSection rows={debugAdmin.recentErrors} formatDateTime={formatDateTime} />
            </Box>
          </>
        ) : (
          <EmptyStateCard
            title={debugLoading ? 'Loading debug data' : 'Debug data unavailable'}
            body={debugLoading ? 'Fetching the latest bot, prompt, notification, and lifecycle state from the API.' : 'No debug snapshot has been loaded yet.'}
            chips={['Bot state', 'CTP table', 'Lifecycle events', 'Error logs']}
          />
        )}
      </Stack>

      <CtpLifecycleDialog
        open={selectedPlayIntent != null}
        onClose={() => setSelectedPlayIntentId(null)}
        ctp={selectedPlayIntent}
        events={selectedLifecycleEvents}
        formatDateTime={formatDateTime}
        onOpenDmInbox={(ctp) => setSelectedMailboxPlayIntentId(ctp.id)}
      />

      <CtpDmInboxDialog
        open={selectedMailboxPlayIntent != null}
        onClose={() => setSelectedMailboxPlayIntentId(null)}
        ctp={selectedMailboxPlayIntent}
        formatDateTime={formatDateTime}
        buildApiUrl={buildApiUrl}
        onRefreshDebug={onRefreshDebug}
        parseDebugDmActionResponse={parseDebugDmActionResponse}
      />

      <DmPreviewDialog
        open={selectedDmPreview != null}
        onClose={() => setSelectedDmPreview(null)}
        title={selectedDmPreview?.title ?? 'DM preview'}
        subtitle={selectedDmPreview?.subtitle ?? ''}
        preview={selectedDmPreview?.preview ?? null}
      />
    </>
  )
}

export function DebugView() {
  const { debugViewProps } = useDashboardContext()

  return <DebugViewContent {...debugViewProps} />
}
