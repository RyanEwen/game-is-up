import { useMemo, useState } from 'react'
import {
  Box,
  Button,
  Card,
  Chip,
  DialogContent,
  DialogTitle,
  Input,
  Option,
  Select,
  Stack,
  Table,
  Typography,
} from '@mui/joy'
import { DashboardApiIssueCard } from '../components/dashboard/DashboardApiIssueCard'
import type {
  DebugAdminResponse,
  DebugAutoPlayPrompt,
  DebugDmPreview,
  DebugErrorLog,
  DebugNotificationDelivery,
  DebugPlayIntentLifecycleEvent,
  DebugPlayIntentSummary,
} from '@game-is-up/shared'
import { DashboardModal } from '../components/dashboard/DashboardModal'
import { EmptyStateCard } from '../components/dashboard/EmptyStateCard'
import { SectionNav } from '../components/dashboard/SectionNav'
import { sectionScrollMarginTop } from '../components/dashboard/SectionNav.constants'
import { useDashboardContext } from '../contexts/useDashboardContext'
import { formatMonthDayYearTimeZone } from '../lib/dateTime'
import { DmLifecycleSimulatorDialog, DmPreviewDialog } from './DebugDmSurface'

type SortDirection = 'asc' | 'desc'
type CtpSortKey =
  | 'createdAt'
  | 'windowStartsAt'
  | 'creator'
  | 'status'
  | 'notificationCount'
  | 'errorCount'
type ErrorSortKey = 'occurredAt' | 'source' | 'message'
type InviteAttributionSortKey =
  'acceptedAt' | 'acceptedUser' | 'inviter' | 'server' | 'kind'
type PromptSortKey =
  'createdAt' | 'user' | 'game' | 'status' | 'deliveredAt' | 'respondedAt'
type NotificationSortKey =
  'createdAt' | 'recipient' | 'game' | 'triggeredBy' | 'deliveredAt'

const tablePageSize = 10

function useLocalDateFormatter() {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Etc/UTC'
  const formatDateTime = useMemo(
    () => (value: string | null) => {
      if (!value) {
        return 'Not available'
      }

      return formatMonthDayYearTimeZone(value, timeZone)
    },
    [timeZone],
  )

  return {
    timeZone,
    formatDateTime,
  }
}

function paginateRows<T>(rows: T[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize
  return rows.slice(start, start + pageSize)
}

function formatAutoPlayPromptStatusLabel(
  status: DebugAutoPlayPrompt['status'],
) {
  switch (status) {
    case 'accepted':
      return 'Created call'
    case 'declined':
      return 'Passed'
    case 'expired':
      return 'Expired'
    case 'failed':
      return 'Failed'
    case 'sent':
      return 'Sent'
    case 'skipped':
      return 'Skipped'
    default:
      return status
  }
}

function CtpTableSection({
  debugAdmin,
  formatDateTime,
  onOpenLifecycle,
}: {
  debugAdmin: DebugAdminResponse
  formatDateTime: (value: string | null) => string
  onOpenLifecycle: (playIntentId: string) => void
}) {
  const [query, setQuery] = useState('')
  const [scopeFilter, setScopeFilter] = useState<
    | 'all'
    | 'network'
    | 'friends-only'
    | 'specific-friends'
    | 'specific-discord-server'
  >('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'ended'>(
    'all',
  )
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
        intent.id,
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery)
    })

    rows.sort((left, right) => {
      let result = 0

      switch (sortKey) {
        case 'creator':
          result = left.creator.displayName.localeCompare(
            right.creator.displayName,
          )
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
          result =
            new Date(left.windowStartsAt).getTime() -
            new Date(right.windowStartsAt).getTime()
          break
        default:
          result =
            new Date(left.createdAt).getTime() -
            new Date(right.createdAt).getTime()
      }

      return sortDirection === 'asc' ? result : -result
    })

    return rows
  }, [
    debugAdmin.recentPlayIntents,
    query,
    scopeFilter,
    statusFilter,
    sortKey,
    sortDirection,
  ])

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
            Sort, filter, and page through CTP rows. Click any row to inspect
            the full lifecycle timeline in chronological order.
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
            <Option value="specific-discord-server">
              Specific Discord servers
            </Option>
          </Select>
        </Stack>

        {filteredRows.length > 0 ? (
          <>
            <Box sx={{ overflowX: 'auto' }}>
              <Table hoverRow borderAxis="bothBetween" stickyHeader>
                <thead>
                  <tr>
                    <th>
                      <Button
                        size="sm"
                        variant="plain"
                        onClick={() => setSort('createdAt')}
                      >
                        Created
                      </Button>
                    </th>
                    <th>
                      <Button
                        size="sm"
                        variant="plain"
                        onClick={() => setSort('creator')}
                      >
                        Creator
                      </Button>
                    </th>
                    <th>Headline</th>
                    <th>
                      <Button
                        size="sm"
                        variant="plain"
                        onClick={() => setSort('status')}
                      >
                        Status
                      </Button>
                    </th>
                    <th>
                      <Button
                        size="sm"
                        variant="plain"
                        onClick={() => setSort('windowStartsAt')}
                      >
                        Starts
                      </Button>
                    </th>
                    <th>
                      <Button
                        size="sm"
                        variant="plain"
                        onClick={() => setSort('notificationCount')}
                      >
                        Notifications
                      </Button>
                    </th>
                    <th>
                      <Button
                        size="sm"
                        variant="plain"
                        onClick={() => setSort('errorCount')}
                      >
                        Errors
                      </Button>
                    </th>
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
                          <Typography level="body-sm">
                            {intent.headline}
                          </Typography>
                          <Typography
                            level="body-xs"
                            sx={{ color: 'neutral.400' }}
                          >
                            Scope: {intent.notifyScope} · {intent.selectionMode}
                          </Typography>
                        </Stack>
                      </td>
                      <td>
                        <Chip
                          size="sm"
                          color={
                            intent.status === 'active' ? 'success' : 'neutral'
                          }
                          variant={
                            intent.status === 'active' ? 'soft' : 'outlined'
                          }
                        >
                          {intent.status}
                        </Chip>
                      </td>
                      <td>{formatDateTime(intent.windowStartsAt)}</td>
                      <td>{intent.notificationCount}</td>
                      <td>
                        <Chip
                          size="sm"
                          color={intent.errorCount > 0 ? 'danger' : 'neutral'}
                          variant={intent.errorCount > 0 ? 'soft' : 'outlined'}
                        >
                          {intent.errorCount}
                        </Chip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Box>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              justifyContent="space-between"
              alignItems={{ xs: 'flex-start', sm: 'center' }}
              spacing={1}
            >
              <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                Showing {pagedRows.length} of {filteredRows.length} CTP rows
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <Button
                  size="sm"
                  variant="outlined"
                  color="neutral"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </Button>
                <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                  Page {currentPage} of {pageCount}
                </Typography>
                <Button
                  size="sm"
                  variant="outlined"
                  color="neutral"
                  disabled={currentPage >= pageCount}
                  onClick={() =>
                    setPage((current) => Math.min(pageCount, current + 1))
                  }
                >
                  Next
                </Button>
              </Stack>
            </Stack>
          </>
        ) : (
          <EmptyStateCard
            title="No CTP rows match these filters"
            body="Try clearing filters or create a new call to play to populate this table."
          />
        )}
      </Stack>
    </Card>
  )
}

function CtpLifecycleDialog({
  open,
  onClose,
  ctp,
  events,
  formatDateTime,
}: {
  open: boolean
  onClose: () => void
  ctp: DebugPlayIntentSummary | null
  events: DebugPlayIntentLifecycleEvent[]
  formatDateTime: (value: string | null) => string
}) {
  if (!ctp) {
    return null
  }

  return (
    <DashboardModal open={open} onClose={onClose} width="min(96vw, 980px)">
      <DialogTitle sx={{ pr: 6 }}>CTP lifecycle: {ctp.headline}</DialogTitle>
      <DialogContent
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          minHeight: 0,
          overflow: 'auto',
        }}
      >
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          sx={{ flexWrap: 'wrap' }}
        >
          <Chip variant="outlined">Creator: {ctp.creator.displayName}</Chip>
          <Chip variant="outlined">Status: {ctp.status}</Chip>
          <Chip variant="outlined">Scope: {ctp.notifyScope}</Chip>
          <Chip variant="outlined">Selection: {ctp.selectionMode}</Chip>
          <Chip variant="outlined">Notifications: {ctp.notificationCount}</Chip>
        </Stack>

        <Card variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={0.75}>
            <Typography level="title-sm">Session window</Typography>
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
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1}
                    justifyContent="space-between"
                  >
                    <Typography level="title-sm">
                      {eventEntry.summary}
                    </Typography>
                    <Chip
                      size="sm"
                      color={eventEntry.isError ? 'danger' : 'neutral'}
                      variant={eventEntry.isError ? 'soft' : 'outlined'}
                    >
                      {eventEntry.source}
                    </Chip>
                  </Stack>
                  <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                    {formatDateTime(eventEntry.occurredAt)}
                  </Typography>
                  <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                    {eventEntry.details ??
                      `Event type: ${eventEntry.eventType}`}
                  </Typography>
                  <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                    Actor: {eventEntry.actorDisplayName ?? 'System'} ·
                    Recipient: {eventEntry.recipientDisplayName ?? 'N/A'}
                  </Typography>
                </Stack>
              </Card>
            ))}
          </Stack>
        ) : (
          <EmptyStateCard
            title="No lifecycle events found"
            body="No additional rows were recorded for this call-to-play timeline yet."
          />
        )}
      </DialogContent>
    </DashboardModal>
  )
}

function DmLifecycleSimulatorSection({ onOpen }: { onOpen: () => void }) {
  return (
    <Card variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        <Box>
          <Typography level="title-lg">DM lifecycle simulator</Typography>
          <Typography level="body-sm" sx={{ color: 'neutral.400', mt: 0.5 }}>
            Spin up fresh in-memory call-to-play and auto-play prompt DM
            threads. The buttons inside the simulated messages drive each flow
            locally so you can rehearse anchor retention, prompt handoff, and
            follow-up behavior without touching live rows.
          </Typography>
        </Box>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          justifyContent="space-between"
          alignItems={{ xs: 'stretch', sm: 'center' }}
        >
          <Typography level="body-xs" sx={{ color: 'neutral.500' }}>
            Useful for checking invite-anchor retention, go-time follow-ups,
            audience response flips, auto-play prompt closeouts, and
            prompt-to-summary handoff.
          </Typography>
          <Button variant="soft" color="primary" onClick={onOpen}>
            Open simulator
          </Button>
        </Stack>
      </Stack>
    </Card>
  )
}

function ErrorTableSection({
  rows,
  formatDateTime,
}: {
  rows: DebugErrorLog[]
  formatDateTime: (value: string | null) => string
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

      return [
        row.source,
        row.message,
        row.detail ?? '',
        row.playIntentId ?? '',
        row.notificationId ?? '',
      ]
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
          result =
            new Date(left.occurredAt).getTime() -
            new Date(right.occurredAt).getTime()
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
                    <th>
                      <Button
                        size="sm"
                        variant="plain"
                        onClick={() => setSort('occurredAt')}
                      >
                        Occurred
                      </Button>
                    </th>
                    <th>
                      <Button
                        size="sm"
                        variant="plain"
                        onClick={() => setSort('source')}
                      >
                        Source
                      </Button>
                    </th>
                    <th>
                      <Button
                        size="sm"
                        variant="plain"
                        onClick={() => setSort('message')}
                      >
                        Message
                      </Button>
                    </th>
                    <th>Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDateTime(row.occurredAt)}</td>
                      <td>
                        <Chip size="sm" color="danger" variant="soft">
                          {row.source}
                        </Chip>
                      </td>
                      <td>
                        <Stack spacing={0.25}>
                          <Typography level="body-sm">{row.message}</Typography>
                          {row.detail ? (
                            <Typography
                              level="body-xs"
                              sx={{ color: 'neutral.400' }}
                            >
                              {row.detail}
                            </Typography>
                          ) : null}
                        </Stack>
                      </td>
                      <td>
                        <Typography
                          level="body-xs"
                          sx={{ color: 'neutral.400' }}
                        >
                          CTP {row.playIntentId ?? 'N/A'}
                        </Typography>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Box>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              justifyContent="space-between"
              alignItems={{ xs: 'flex-start', sm: 'center' }}
              spacing={1}
            >
              <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                Showing {pagedRows.length} of {filteredRows.length} errors
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <Button
                  size="sm"
                  variant="outlined"
                  color="neutral"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </Button>
                <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                  Page {currentPage} of {pageCount}
                </Typography>
                <Button
                  size="sm"
                  variant="outlined"
                  color="neutral"
                  disabled={currentPage >= pageCount}
                  onClick={() =>
                    setPage((current) => Math.min(pageCount, current + 1))
                  }
                >
                  Next
                </Button>
              </Stack>
            </Stack>
          </>
        ) : (
          <EmptyStateCard
            title="No error logs in this snapshot"
            body="When prompt, bot, or notification-path errors are captured, they will appear here."
          />
        )}
      </Stack>
    </Card>
  )
}

function BotStateCard({
  debugAdmin,
  formatDateTime,
}: {
  debugAdmin: DebugAdminResponse
  formatDateTime: (value: string | null) => string
}) {
  return (
    <Card variant="soft" sx={{ p: 3 }}>
      <Stack spacing={1.5}>
        <Box>
          <Typography level="title-lg">Bot status</Typography>
          <Typography level="body-sm" sx={{ color: 'neutral.400', mt: 0.5 }}>
            Current connection state for the Discord bot process and the latest
            readiness/error timestamps.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
          <Chip
            color={debugAdmin.bot.configured ? 'success' : 'neutral'}
            variant={debugAdmin.bot.configured ? 'soft' : 'outlined'}
          >
            {debugAdmin.bot.configured ? 'Configured' : 'Missing bot token'}
          </Chip>
          <Chip variant="outlined">Mode: {debugAdmin.bot.mode}</Chip>
          <Chip
            color={
              debugAdmin.bot.connected
                ? 'success'
                : debugAdmin.bot.mode === 'gateway'
                  ? 'warning'
                  : 'neutral'
            }
            variant={debugAdmin.bot.connected ? 'soft' : 'outlined'}
          >
            {debugAdmin.bot.connected
              ? 'Gateway connected'
              : debugAdmin.bot.mode === 'gateway'
                ? 'Gateway disconnected'
                : 'Gateway disabled'}
          </Chip>
          <Chip variant="outlined">{debugAdmin.bot.guildCount} guilds</Chip>
        </Stack>
        <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
          Bot user: {debugAdmin.bot.userTag ?? 'Not signed in'}
        </Typography>
        <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
          Last ready: {formatDateTime(debugAdmin.bot.lastReadyAt)}
        </Typography>
        <Typography
          level="body-sm"
          sx={{
            color: debugAdmin.bot.lastError ? 'warning.300' : 'neutral.300',
          }}
        >
          Last error: {debugAdmin.bot.lastError ?? 'None'}
        </Typography>
      </Stack>
    </Card>
  )
}

function InviteAttributionLogCard({
  debugAdmin,
  formatDateTime,
}: {
  debugAdmin: DebugAdminResponse
  formatDateTime: (value: string | null) => string
}) {
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState<'all' | 'direct' | 'server'>(
    'all',
  )
  const [sortKey, setSortKey] = useState<InviteAttributionSortKey>('acceptedAt')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [page, setPage] = useState(1)

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    const rows = debugAdmin.recentInviteAttributions.filter((attribution) => {
      if (kindFilter !== 'all' && attribution.kind !== kindFilter) {
        return false
      }

      if (!normalizedQuery) {
        return true
      }

      return [
        attribution.acceptedUser.displayName,
        attribution.acceptedUser.handle,
        attribution.inviterUser?.displayName ?? '',
        attribution.inviterUser?.handle ?? '',
        attribution.inviterLabel ?? '',
        attribution.inviterDiscordUserId ?? '',
        attribution.serverName ?? '',
        attribution.serverId ?? '',
        attribution.kind,
        attribution.id,
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery)
    })

    rows.sort((left, right) => {
      let result = 0

      switch (sortKey) {
        case 'acceptedUser':
          result = left.acceptedUser.displayName.localeCompare(
            right.acceptedUser.displayName,
          )
          break
        case 'inviter':
          result = (
            left.inviterUser?.displayName ??
            left.inviterLabel ??
            left.inviterDiscordUserId ??
            ''
          ).localeCompare(
            right.inviterUser?.displayName ??
              right.inviterLabel ??
              right.inviterDiscordUserId ??
              '',
          )
          break
        case 'server':
          result = (left.serverName ?? left.serverId ?? '').localeCompare(
            right.serverName ?? right.serverId ?? '',
          )
          break
        case 'kind':
          result = left.kind.localeCompare(right.kind)
          break
        default:
          result =
            new Date(left.acceptedAt).getTime() -
            new Date(right.acceptedAt).getTime()
      }

      return sortDirection === 'asc' ? result : -result
    })

    return rows
  }, [
    debugAdmin.recentInviteAttributions,
    kindFilter,
    query,
    sortDirection,
    sortKey,
  ])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / tablePageSize))
  const currentPage = Math.min(page, pageCount)
  const pagedRows = paginateRows(filteredRows, currentPage, tablePageSize)

  const setSort = (nextKey: InviteAttributionSortKey) => {
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
          <Typography level="title-lg">Recent invite attributions</Typography>
          <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
            Verify which accepted sign-ins were attributed to a Discord invite,
            including the accepted user, inviter identity, invite type, and
            originating server.
          </Typography>
        </Stack>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
          <Input
            placeholder="Filter by accepted user, inviter, server, Discord ID, or row ID"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(1)
            }}
            sx={{ flex: 1 }}
          />
          <Select
            value={kindFilter}
            onChange={(_event, value) => {
              if (!value) {
                return
              }

              setKindFilter(value)
              setPage(1)
            }}
            sx={{ minWidth: 170 }}
          >
            <Option value="all">All invite types</Option>
            <Option value="direct">Direct invites</Option>
            <Option value="server">Server links</Option>
          </Select>
        </Stack>

        {filteredRows.length > 0 ? (
          <>
            <Box sx={{ overflowX: 'auto' }}>
              <Table hoverRow borderAxis="bothBetween" stickyHeader>
                <thead>
                  <tr>
                    <th>
                      <Button
                        size="sm"
                        variant="plain"
                        onClick={() => setSort('acceptedAt')}
                      >
                        Accepted
                      </Button>
                    </th>
                    <th>
                      <Button
                        size="sm"
                        variant="plain"
                        onClick={() => setSort('acceptedUser')}
                      >
                        Accepted user
                      </Button>
                    </th>
                    <th>
                      <Button
                        size="sm"
                        variant="plain"
                        onClick={() => setSort('inviter')}
                      >
                        Inviter
                      </Button>
                    </th>
                    <th>
                      <Button
                        size="sm"
                        variant="plain"
                        onClick={() => setSort('server')}
                      >
                        Server
                      </Button>
                    </th>
                    <th>
                      <Button
                        size="sm"
                        variant="plain"
                        onClick={() => setSort('kind')}
                      >
                        Kind
                      </Button>
                    </th>
                    <th>Member hint</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((attribution) => (
                    <tr key={attribution.id}>
                      <td>{formatDateTime(attribution.acceptedAt)}</td>
                      <td>
                        <Stack spacing={0.25}>
                          <Typography level="body-sm">
                            {attribution.acceptedUser.displayName}
                          </Typography>
                          <Typography
                            level="body-xs"
                            sx={{ color: 'neutral.400' }}
                          >
                            @{attribution.acceptedUser.handle}
                          </Typography>
                        </Stack>
                      </td>
                      <td>
                        <Stack spacing={0.25}>
                          <Typography level="body-sm">
                            {attribution.inviterUser?.displayName ??
                              attribution.inviterLabel ??
                              'Unknown inviter'}
                          </Typography>
                          <Typography
                            level="body-xs"
                            sx={{ color: 'neutral.400' }}
                          >
                            {attribution.inviterUser
                              ? `@${attribution.inviterUser.handle}`
                              : attribution.inviterDiscordUserId
                                ? `Discord ID ${attribution.inviterDiscordUserId}`
                                : 'No linked inviter user'}
                          </Typography>
                        </Stack>
                      </td>
                      <td>
                        <Stack spacing={0.25}>
                          <Typography level="body-sm">
                            {attribution.serverName ?? 'No server snapshot'}
                          </Typography>
                          <Typography
                            level="body-xs"
                            sx={{ color: 'neutral.400' }}
                          >
                            {attribution.serverId ?? 'No server ID stored'}
                          </Typography>
                        </Stack>
                      </td>
                      <td>
                        <Chip
                          size="sm"
                          color={
                            attribution.kind === 'direct'
                              ? 'warning'
                              : 'primary'
                          }
                          variant="soft"
                        >
                          {attribution.kind === 'direct' ? 'Direct' : 'Server'}
                        </Chip>
                      </td>
                      <td>
                        <Typography
                          level="body-xs"
                          sx={{ color: 'neutral.400' }}
                        >
                          {attribution.memberCount == null
                            ? 'Not captured'
                            : `${attribution.memberCount} ${attribution.memberCount === 1 ? 'member' : 'members'}`}
                        </Typography>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Box>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              justifyContent="space-between"
              alignItems={{ xs: 'flex-start', sm: 'center' }}
              spacing={1}
            >
              <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                Showing {pagedRows.length} of {filteredRows.length} invite
                attribution rows
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <Button
                  size="sm"
                  variant="outlined"
                  color="neutral"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </Button>
                <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                  Page {currentPage} of {pageCount}
                </Typography>
                <Button
                  size="sm"
                  variant="outlined"
                  color="neutral"
                  disabled={currentPage >= pageCount}
                  onClick={() =>
                    setPage((current) => Math.min(pageCount, current + 1))
                  }
                >
                  Next
                </Button>
              </Stack>
            </Stack>
          </>
        ) : (
          <EmptyStateCard
            title="No invite attributions match these filters"
            body="Try clearing filters or accept a Discord invite flow on a fresh account to create an attribution row."
          />
        )}
      </Stack>
    </Card>
  )
}

function PromptLogCard({
  debugAdmin,
  formatDateTime,
  onOpenPreview,
}: {
  debugAdmin: DebugAdminResponse
  formatDateTime: (value: string | null) => string
  onOpenPreview: (prompt: DebugAutoPlayPrompt) => void
}) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<
    | 'all'
    | 'sent'
    | 'skipped'
    | 'failed'
    | 'accepted'
    | 'declined'
    | 'expired'
    | 'settle_sent'
    | 'settle_confirmed'
    | 'settle_declined'
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
        prompt.id,
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery)
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
          result = (left.deliveredAt ?? '').localeCompare(
            right.deliveredAt ?? '',
          )
          break
        case 'respondedAt':
          result = (left.respondedAt ?? '').localeCompare(
            right.respondedAt ?? '',
          )
          break
        default:
          result =
            new Date(left.createdAt).getTime() -
            new Date(right.createdAt).getTime()
      }

      return sortDirection === 'asc' ? result : -result
    })

    return rows
  }, [
    debugAdmin.recentAutoPlayPrompts,
    query,
    statusFilter,
    sortKey,
    sortDirection,
  ])

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
            Sort, filter, and page through prompt decisions from Discord
            activity starts, including skipped reasons, delivery failures, and
            Discord-created CTP attempts.
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
            <Option value="accepted">Created call</Option>
            <Option value="declined">Passed</Option>
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
                    <th>
                      <Button
                        size="sm"
                        variant="plain"
                        onClick={() => setSort('createdAt')}
                      >
                        Created
                      </Button>
                    </th>
                    <th>
                      <Button
                        size="sm"
                        variant="plain"
                        onClick={() => setSort('user')}
                      >
                        User
                      </Button>
                    </th>
                    <th>
                      <Button
                        size="sm"
                        variant="plain"
                        onClick={() => setSort('game')}
                      >
                        Game
                      </Button>
                    </th>
                    <th>
                      <Button
                        size="sm"
                        variant="plain"
                        onClick={() => setSort('status')}
                      >
                        Status
                      </Button>
                    </th>
                    <th>Detail</th>
                    <th>
                      <Button
                        size="sm"
                        variant="plain"
                        onClick={() => setSort('deliveredAt')}
                      >
                        Delivered
                      </Button>
                    </th>
                    <th>
                      <Button
                        size="sm"
                        variant="plain"
                        onClick={() => setSort('respondedAt')}
                      >
                        Responded
                      </Button>
                    </th>
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
                          <Typography level="body-sm">
                            {prompt.user.displayName}
                          </Typography>
                          <Typography
                            level="body-xs"
                            sx={{ color: 'neutral.400' }}
                          >
                            @{prompt.user.handle}
                          </Typography>
                        </Stack>
                      </td>
                      <td>{prompt.game.title}</td>
                      <td>
                        <Chip
                          size="sm"
                          variant="soft"
                          color={
                            prompt.status === 'accepted'
                              ? 'success'
                              : prompt.status === 'declined' ||
                                  prompt.status === 'failed'
                                ? 'danger'
                                : prompt.status === 'expired'
                                  ? 'warning'
                                  : 'neutral'
                          }
                        >
                          {formatAutoPlayPromptStatusLabel(prompt.status)}
                        </Chip>
                      </td>
                      <td>
                        <Stack spacing={0.25}>
                          <Typography
                            level="body-sm"
                            sx={{ color: 'neutral.300' }}
                          >
                            {prompt.statusDetail ?? 'No detail recorded.'}
                          </Typography>
                          {prompt.dmError ? (
                            <Typography
                              level="body-xs"
                              sx={{ color: 'warning.300' }}
                            >
                              DM error: {prompt.dmError}
                            </Typography>
                          ) : null}
                        </Stack>
                      </td>
                      <td>
                        <Typography
                          level="body-xs"
                          sx={{ color: 'neutral.400' }}
                        >
                          {formatDateTime(prompt.deliveredAt)}
                        </Typography>
                      </td>
                      <td>
                        <Typography
                          level="body-xs"
                          sx={{ color: 'neutral.400' }}
                        >
                          {formatDateTime(prompt.respondedAt)}
                        </Typography>
                      </td>
                      <td>
                        <Typography
                          level="body-xs"
                          sx={{ color: 'neutral.400' }}
                        >
                          {prompt.createdPlayIntentId ?? 'Not created'}
                        </Typography>
                      </td>
                      <td>
                        <Button
                          size="sm"
                          variant="outlined"
                          color="neutral"
                          disabled={!prompt.dmPreview}
                          onClick={() => onOpenPreview(prompt)}
                        >
                          Preview DM
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Box>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              justifyContent="space-between"
              alignItems={{ xs: 'flex-start', sm: 'center' }}
              spacing={1}
            >
              <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                Showing {pagedRows.length} of {filteredRows.length} prompt rows
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <Button
                  size="sm"
                  variant="outlined"
                  color="neutral"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </Button>
                <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                  Page {currentPage} of {pageCount}
                </Typography>
                <Button
                  size="sm"
                  variant="outlined"
                  color="neutral"
                  disabled={currentPage >= pageCount}
                  onClick={() =>
                    setPage((current) => Math.min(pageCount, current + 1))
                  }
                >
                  Next
                </Button>
              </Stack>
            </Stack>
          </>
        ) : (
          <EmptyStateCard
            title="No prompt rows match these filters"
            body="Try clearing filters or wait for the bot to observe Discord activity."
          />
        )}
      </Stack>
    </Card>
  )
}

function NotificationLogCard({
  debugAdmin,
  formatDateTime,
  onOpenPreview,
}: {
  debugAdmin: DebugAdminResponse
  formatDateTime: (value: string | null) => string
  onOpenPreview: (
    notification: DebugNotificationDelivery,
    friendPicker?: boolean,
  ) => void
}) {
  const [query, setQuery] = useState('')
  const [deliveryFilter, setDeliveryFilter] = useState<
    'all' | 'delivered' | 'stored'
  >('all')
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
        notification.id,
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery)
    })

    rows.sort((left, right) => {
      let result = 0

      switch (sortKey) {
        case 'recipient':
          result = left.recipient.displayName.localeCompare(
            right.recipient.displayName,
          )
          break
        case 'game':
          result = (left.gameTitle ?? '').localeCompare(right.gameTitle ?? '')
          break
        case 'triggeredBy':
          result = (left.triggeredBy?.displayName ?? '').localeCompare(
            right.triggeredBy?.displayName ?? '',
          )
          break
        case 'deliveredAt':
          result = (left.deliveredAt ?? '').localeCompare(
            right.deliveredAt ?? '',
          )
          break
        default:
          result =
            new Date(left.createdAt).getTime() -
            new Date(right.createdAt).getTime()
      }

      return sortDirection === 'asc' ? result : -result
    })

    return rows
  }, [
    debugAdmin.recentNotifications,
    query,
    deliveryFilter,
    sortKey,
    sortDirection,
  ])

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
          <Typography level="title-lg">
            Recent notification deliveries
          </Typography>
          <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
            Sort, filter, and page through call-to-play notification rows, with
            delivery timestamps for the Discord DM path.
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
                    <th>
                      <Button
                        size="sm"
                        variant="plain"
                        onClick={() => setSort('createdAt')}
                      >
                        Created
                      </Button>
                    </th>
                    <th>
                      <Button
                        size="sm"
                        variant="plain"
                        onClick={() => setSort('recipient')}
                      >
                        Recipient
                      </Button>
                    </th>
                    <th>Title</th>
                    <th>
                      <Button
                        size="sm"
                        variant="plain"
                        onClick={() => setSort('game')}
                      >
                        Game
                      </Button>
                    </th>
                    <th>
                      <Button
                        size="sm"
                        variant="plain"
                        onClick={() => setSort('triggeredBy')}
                      >
                        Triggered by
                      </Button>
                    </th>
                    <th>
                      <Button
                        size="sm"
                        variant="plain"
                        onClick={() => setSort('deliveredAt')}
                      >
                        Delivery
                      </Button>
                    </th>
                    <th>Preview</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((notification) => (
                    <tr key={notification.id}>
                      <td>{formatDateTime(notification.createdAt)}</td>
                      <td>
                        <Typography level="body-sm">
                          {notification.recipient.displayName}
                        </Typography>
                        <Typography
                          level="body-xs"
                          sx={{ color: 'neutral.400' }}
                        >
                          @{notification.recipient.handle}
                        </Typography>
                      </td>
                      <td>
                        <Stack spacing={0.25}>
                          <Typography level="body-sm">
                            {notification.title}
                          </Typography>
                          <Typography
                            level="body-xs"
                            sx={{ color: 'neutral.400' }}
                          >
                            {notification.body}
                          </Typography>
                        </Stack>
                      </td>
                      <td>{notification.gameTitle ?? 'None'}</td>
                      <td>
                        <Typography
                          level="body-xs"
                          sx={{ color: 'neutral.400' }}
                        >
                          {notification.triggeredBy
                            ? `${notification.triggeredBy.displayName} @${notification.triggeredBy.handle}`
                            : 'System'}
                        </Typography>
                      </td>
                      <td>
                        <Chip
                          size="sm"
                          color={
                            notification.deliveredAt ? 'success' : 'neutral'
                          }
                          variant={
                            notification.deliveredAt ? 'soft' : 'outlined'
                          }
                        >
                          {notification.deliveredAt
                            ? 'DM delivered'
                            : 'Stored only'}
                        </Chip>
                        <Typography
                          level="body-xs"
                          sx={{ color: 'neutral.400', mt: 0.5 }}
                        >
                          {formatDateTime(notification.deliveredAt)}
                        </Typography>
                      </td>
                      <td>
                        <Button
                          size="sm"
                          variant="outlined"
                          color="neutral"
                          disabled={!notification.dmPreview}
                          onClick={() => onOpenPreview(notification)}
                        >
                          Preview DM
                        </Button>
                        {notification.friendInvitePreview ? (
                          <Button
                            size="sm"
                            variant="outlined"
                            color="neutral"
                            onClick={() => onOpenPreview(notification, true)}
                          >
                            Preview friend picker
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Box>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              justifyContent="space-between"
              alignItems={{ xs: 'flex-start', sm: 'center' }}
              spacing={1}
            >
              <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                Showing {pagedRows.length} of {filteredRows.length} notification
                rows
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <Button
                  size="sm"
                  variant="outlined"
                  color="neutral"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </Button>
                <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                  Page {currentPage} of {pageCount}
                </Typography>
                <Button
                  size="sm"
                  variant="outlined"
                  color="neutral"
                  disabled={currentPage >= pageCount}
                  onClick={() =>
                    setPage((current) => Math.min(pageCount, current + 1))
                  }
                >
                  Next
                </Button>
              </Stack>
            </Stack>
          </>
        ) : (
          <EmptyStateCard
            title="No notification rows match these filters"
            body="Try clearing filters or wait for a call to play to match someone and create a notification row."
          />
        )}
      </Stack>
    </Card>
  )
}

function DebugViewContent({
  error,
  isSignedIn,
  debugAdmin,
  debugLoading,
  onRefreshDebug,
}: {
  error: string | null
  isSignedIn: boolean
  debugAdmin: DebugAdminResponse | null
  debugLoading: boolean
  onRefreshDebug: () => Promise<void>
}) {
  const { timeZone, formatDateTime } = useLocalDateFormatter()
  const [selectedPlayIntentId, setSelectedPlayIntentId] = useState<
    string | null
  >(null)
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false)
  const [selectedDmPreview, setSelectedDmPreview] = useState<{
    title: string
    subtitle: string
    preview: DebugDmPreview | null
  } | null>(null)

  if (error) {
    return <DashboardApiIssueCard error={error} />
  }

  if (!isSignedIn) {
    return (
      <EmptyStateCard
        title="Sign in to inspect debug data"
        body="The debug view is only populated for authenticated sessions so it can reuse the same backend access checks as the rest of the dashboard."
        showSignInCard
      />
    )
  }

  const selectedPlayIntent =
    debugAdmin?.recentPlayIntents.find(
      (intent) => intent.id === selectedPlayIntentId,
    ) ?? null
  const selectedLifecycleEvents =
    debugAdmin?.playIntentLifecycleEvents
      .filter((eventEntry) => eventEntry.playIntentId === selectedPlayIntentId)
      .sort(
        (left, right) =>
          new Date(left.occurredAt).getTime() -
          new Date(right.occurredAt).getTime(),
      ) ?? []

  return (
    <>
      <Stack spacing={2}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          justifyContent="space-between"
          alignItems={{ xs: 'stretch', sm: 'center' }}
        >
          <Box>
            <Typography level="h2">Admin and debug</Typography>
            <Typography level="body-md" sx={{ color: 'neutral.300', mt: 0.5 }}>
              Inspect bot state, CTP lifecycle timelines, prompt decisions, and
              delivery/error logs.
            </Typography>
            <Typography level="body-xs" sx={{ color: 'neutral.500', mt: 0.5 }}>
              Times shown in your local timezone: {timeZone}
            </Typography>
          </Box>
          <Button
            variant="outlined"
            color="neutral"
            onClick={() => void onRefreshDebug()}
          >
            {debugLoading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </Stack>

        {debugAdmin ? (
          <>
            <SectionNav
              aria-label="Debug sections"
              mb={0}
              sections={[
                { id: 'bot-status', label: 'Bot', desktopLabel: 'Bot Status' },
                {
                  id: 'simulator',
                  label: 'Simulator',
                  desktopLabel: 'DM Simulator',
                },
                {
                  id: 'ctps',
                  label: 'CTPs',
                  desktopLabel: 'Calls to Play',
                  count: debugAdmin.recentPlayIntents.length,
                },
                {
                  id: 'prompts',
                  label: 'Prompts',
                  desktopLabel: 'Auto Prompts',
                  count: debugAdmin.recentAutoPlayPrompts.length,
                },
                {
                  id: 'invite-attributions',
                  label: 'Invites',
                  desktopLabel: 'Invite Attributions',
                  count: debugAdmin.recentInviteAttributions.length,
                },
                {
                  id: 'notifications',
                  label: 'Notifications',
                  desktopLabel: 'Notification Log',
                  count: debugAdmin.recentNotifications.length,
                },
                {
                  id: 'errors',
                  label: 'Errors',
                  desktopLabel: 'Error Log',
                  count: debugAdmin.recentErrors.length,
                },
              ]}
            />

            <Box
              id="bot-status"
              sx={{ scrollMarginTop: sectionScrollMarginTop }}
            >
              <BotStateCard
                debugAdmin={debugAdmin}
                formatDateTime={formatDateTime}
              />
            </Box>

            <Box
              id="simulator"
              sx={{ scrollMarginTop: sectionScrollMarginTop }}
            >
              <DmLifecycleSimulatorSection
                onOpen={() => setIsSimulatorOpen(true)}
              />
            </Box>

            <Box id="ctps" sx={{ scrollMarginTop: sectionScrollMarginTop }}>
              <CtpTableSection
                debugAdmin={debugAdmin}
                formatDateTime={formatDateTime}
                onOpenLifecycle={setSelectedPlayIntentId}
              />
            </Box>

            <Box id="prompts" sx={{ scrollMarginTop: sectionScrollMarginTop }}>
              <PromptLogCard
                debugAdmin={debugAdmin}
                formatDateTime={formatDateTime}
                onOpenPreview={(prompt) =>
                  setSelectedDmPreview({
                    title: `Auto-play DM: ${prompt.game.title}`,
                    subtitle: `${prompt.user.displayName} @${prompt.user.handle} · status ${prompt.status}`,
                    preview: prompt.dmPreview,
                  })
                }
              />
            </Box>

            <Box
              id="invite-attributions"
              sx={{ scrollMarginTop: sectionScrollMarginTop }}
            >
              <InviteAttributionLogCard
                debugAdmin={debugAdmin}
                formatDateTime={formatDateTime}
              />
            </Box>

            <Box
              id="notifications"
              sx={{ scrollMarginTop: sectionScrollMarginTop }}
            >
              <NotificationLogCard
                debugAdmin={debugAdmin}
                formatDateTime={formatDateTime}
                onOpenPreview={(notification, friendPicker) =>
                  setSelectedDmPreview({
                    title: `Notification DM: ${notification.title}`,
                    subtitle: `${notification.recipient.displayName} @${notification.recipient.handle}`,
                    preview: friendPicker
                      ? notification.friendInvitePreview
                      : notification.dmPreview,
                  })
                }
              />
            </Box>

            <Box id="errors" sx={{ scrollMarginTop: sectionScrollMarginTop }}>
              <ErrorTableSection
                rows={debugAdmin.recentErrors}
                formatDateTime={formatDateTime}
              />
            </Box>
          </>
        ) : (
          <EmptyStateCard
            title={
              debugLoading ? 'Loading debug data' : 'Debug data unavailable'
            }
            body={
              debugLoading
                ? 'Fetching the latest bot, prompt, notification, and lifecycle state from the API.'
                : 'No debug snapshot has been loaded yet.'
            }
          />
        )}
      </Stack>

      <CtpLifecycleDialog
        open={selectedPlayIntent != null}
        onClose={() => setSelectedPlayIntentId(null)}
        ctp={selectedPlayIntent}
        events={selectedLifecycleEvents}
        formatDateTime={formatDateTime}
      />

      <DmLifecycleSimulatorDialog
        open={isSimulatorOpen}
        onClose={() => setIsSimulatorOpen(false)}
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
