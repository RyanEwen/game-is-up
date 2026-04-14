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
  Typography
} from '@mui/joy'
import type { DebugAdminResponse, DebugErrorLog, DebugPlayIntentLifecycleEvent, DebugPlayIntentSummary } from '@game-is-up/shared'
import { DashboardModal } from '../components/dashboard/DashboardModal'
import { EmptyStateCard } from '../components/dashboard/EmptyStateCard'
import { SectionNav, sectionScrollMarginTop } from '../components/dashboard/SectionNav'
import { useDashboardContext } from '../contexts/useDashboardContext'

type SortDirection = 'asc' | 'desc'
type CtpSortKey = 'createdAt' | 'windowStartsAt' | 'creator' | 'status' | 'notificationCount' | 'errorCount'
type ErrorSortKey = 'occurredAt' | 'source' | 'message'

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

function CtpLifecycleDialog({
  open,
  onClose,
  ctp,
  events,
  formatDateTime
}: {
  open: boolean;
  onClose: () => void;
  ctp: DebugPlayIntentSummary | null;
  events: DebugPlayIntentLifecycleEvent[];
  formatDateTime: (value: string | null) => string;
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
  const [scopeFilter, setScopeFilter] = useState<'all' | 'network' | 'friends-only' | 'specific-friends'>('all')
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

function PromptLogCard({ debugAdmin, formatDateTime }: { debugAdmin: DebugAdminResponse; formatDateTime: (value: string | null) => string }) {
  const [page, setPage] = useState(1)
  const pageCount = Math.max(1, Math.ceil(debugAdmin.recentAutoPlayPrompts.length / tablePageSize))
  const currentPage = Math.min(page, pageCount)
  const pagedRows = paginateRows(debugAdmin.recentAutoPlayPrompts, currentPage, tablePageSize)

  return (
    <Card variant="soft" sx={{ p: 3 }}>
      <Stack spacing={1.5}>
        <Box>
          <Typography level="title-lg">Recent auto-play prompts</Typography>
          <Typography level="body-sm" sx={{ color: 'neutral.400', mt: 0.5 }}>
            Prompt decisions from Discord activity starts, including skipped reasons, delivery failures, and Discord-created CTP attempts.
          </Typography>
        </Box>
        {debugAdmin.recentAutoPlayPrompts.length > 0 ? (
          <>
            <Box sx={{ overflowX: 'auto' }}>
              <Table hoverRow borderAxis="bothBetween" stickyHeader>
                <thead>
                  <tr>
                    <th>Created</th>
                    <th>User</th>
                    <th>Game</th>
                    <th>Status</th>
                    <th>Detail</th>
                    <th>Delivery timeline</th>
                    <th>CTP</th>
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
                          Delivered {formatDateTime(prompt.deliveredAt)}
                        </Typography>
                        <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                          Responded {formatDateTime(prompt.respondedAt)}
                        </Typography>
                      </td>
                      <td>
                        <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                          {prompt.createdPlayIntentId ?? 'Not created'}
                        </Typography>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={1}>
              <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                Showing {pagedRows.length} of {debugAdmin.recentAutoPlayPrompts.length} prompt rows
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
            title="No auto-play prompt history yet"
            body="Once the bot sees activity and evaluates prompt rules, entries will appear here."
          />
        )}
      </Stack>
    </Card>
  )
}

function NotificationLogCard({ debugAdmin, formatDateTime }: { debugAdmin: DebugAdminResponse; formatDateTime: (value: string | null) => string }) {
  const [page, setPage] = useState(1)
  const pageCount = Math.max(1, Math.ceil(debugAdmin.recentNotifications.length / tablePageSize))
  const currentPage = Math.min(page, pageCount)
  const pagedRows = paginateRows(debugAdmin.recentNotifications, currentPage, tablePageSize)

  return (
    <Card variant="soft" sx={{ p: 3 }}>
      <Stack spacing={1.5}>
        <Box>
          <Typography level="title-lg">Recent notification deliveries</Typography>
          <Typography level="body-sm" sx={{ color: 'neutral.400', mt: 0.5 }}>
            Latest call-to-play notification rows, with delivery timestamps for the Discord DM path.
          </Typography>
        </Box>
        {debugAdmin.recentNotifications.length > 0 ? (
          <>
            <Box sx={{ overflowX: 'auto' }}>
              <Table hoverRow borderAxis="bothBetween" stickyHeader>
                <thead>
                  <tr>
                    <th>Created</th>
                    <th>Recipient</th>
                    <th>Title</th>
                    <th>Game</th>
                    <th>Triggered by</th>
                    <th>Delivery</th>
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
                          Delivered {formatDateTime(notification.deliveredAt)}
                        </Typography>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={1}>
              <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                Showing {pagedRows.length} of {debugAdmin.recentNotifications.length} notification rows
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
            title="No notification rows yet"
            body="Play-intent notifications will show up here after a call to play matches someone and a notification row is created."
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
  onRefreshDebug
}: {
  isSignedIn: boolean;
  debugAdmin: DebugAdminResponse | null;
  debugLoading: boolean;
  onRefreshDebug: () => Promise<void>;
}) {
  const { timeZone, formatDateTime } = useLocalDateFormatter()
  const [selectedPlayIntentId, setSelectedPlayIntentId] = useState<string | null>(null)

  if (!isSignedIn) {
    return (
      <EmptyStateCard
        title="Sign in to inspect debug data"
        body="The debug view is only populated for authenticated sessions so it can reuse the same backend access checks as the rest of the dashboard."
      />
    )
  }

  const selectedPlayIntent = debugAdmin?.recentPlayIntents.find((intent) => intent.id === selectedPlayIntentId) ?? null
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
                { id: 'errors', label: 'Errors', count: debugAdmin.recentErrors.length },
                { id: 'prompts', label: 'Prompts', count: debugAdmin.recentAutoPlayPrompts.length },
                { id: 'notifications', label: 'Notifications', count: debugAdmin.recentNotifications.length }
              ]}
            />

            <Box id="bot-status" sx={{ scrollMarginTop: sectionScrollMarginTop }}>
              <BotStateCard debugAdmin={debugAdmin} formatDateTime={formatDateTime} />
            </Box>

            <Box id="ctps" sx={{ scrollMarginTop: sectionScrollMarginTop }}>
              <CtpTableSection debugAdmin={debugAdmin} formatDateTime={formatDateTime} onOpenLifecycle={setSelectedPlayIntentId} />
            </Box>

            <Box id="errors" sx={{ scrollMarginTop: sectionScrollMarginTop }}>
              <ErrorTableSection rows={debugAdmin.recentErrors} formatDateTime={formatDateTime} />
            </Box>

            <Box id="prompts" sx={{ scrollMarginTop: sectionScrollMarginTop }}>
              <PromptLogCard debugAdmin={debugAdmin} formatDateTime={formatDateTime} />
            </Box>

            <Box id="notifications" sx={{ scrollMarginTop: sectionScrollMarginTop }}>
              <NotificationLogCard debugAdmin={debugAdmin} formatDateTime={formatDateTime} />
            </Box>
          </>
        ) : (
          <EmptyStateCard
            title={debugLoading ? 'Loading debug data' : 'Debug data unavailable'}
            body={debugLoading ? 'Fetching the latest bot, prompt, notification, and lifecycle state from the API.' : 'No debug snapshot has been loaded yet.'}
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
    </>
  )
}

export function DebugView() {
  const { debugViewProps } = useDashboardContext()

  return <DebugViewContent {...debugViewProps} />
}
