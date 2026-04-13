import { Box, Button, Card, Chip, Divider, Stack, Typography } from '@mui/joy'
import type { DebugAdminResponse } from '@game-is-up/shared'
import { EmptyStateCard } from '../components/dashboard/EmptyStateCard'
import { useDashboardContext } from '../contexts/useDashboardContext'

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Not available'
  }

  return new Date(value).toLocaleString()
}

function BotStateCard({ debugAdmin }: { debugAdmin: DebugAdminResponse }) {
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
          <Chip variant="outlined">
            Mode: {debugAdmin.bot.mode}
          </Chip>
          <Chip
            color={debugAdmin.bot.connected ? 'success' : debugAdmin.bot.mode === 'gateway' ? 'warning' : 'neutral'}
            variant={debugAdmin.bot.connected ? 'soft' : 'outlined'}
          >
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

function PromptLogCard({ debugAdmin }: { debugAdmin: DebugAdminResponse }) {
  return (
    <Card variant="soft" sx={{ p: 3 }}>
      <Stack spacing={1.5}>
        <Box>
          <Typography level="title-lg">Recent auto-play prompts</Typography>
          <Typography level="body-sm" sx={{ color: 'neutral.400', mt: 0.5 }}>
            Recent prompt decisions from Discord activity starts, including skipped reasons, delivery failures, and Discord-created calls to play.
          </Typography>
        </Box>
        {debugAdmin.recentAutoPlayPrompts.length > 0 ? (
          <Stack spacing={1.25}>
            {debugAdmin.recentAutoPlayPrompts.map((prompt) => (
              <Card key={prompt.id} variant="outlined" sx={{ p: 2 }}>
                <Stack spacing={1}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between">
                    <Typography level="title-sm">
                      {prompt.user.displayName} · {prompt.game.title}
                    </Typography>
                    <Chip size="sm" variant="soft">
                      {prompt.status}
                    </Chip>
                  </Stack>
                  <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                    {prompt.statusDetail ?? 'No detail recorded.'}
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                    <Chip size="sm" variant="outlined">friends {prompt.friendRecipientCount}</Chip>
                    <Chip size="sm" variant="outlined">network + friends {prompt.networkRecipientCount}</Chip>
                    {prompt.durationMinutes ? <Chip size="sm" variant="outlined">{prompt.durationMinutes} min</Chip> : null}
                    {prompt.notifyScope ? <Chip size="sm" variant="outlined">{prompt.notifyScope}</Chip> : null}
                  </Stack>
                  <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                    Created {formatDateTime(prompt.createdAt)} · Delivered {formatDateTime(prompt.deliveredAt)} · Responded {formatDateTime(prompt.respondedAt)}
                  </Typography>
                  <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                    Source server: {prompt.sourceServerName ?? 'Unknown'} · Observation start: {formatDateTime(prompt.observationStartedAt)}
                  </Typography>
                  {prompt.dmError ? (
                    <Typography level="body-xs" sx={{ color: 'warning.300' }}>
                      DM error: {prompt.dmError}
                    </Typography>
                  ) : null}
                </Stack>
              </Card>
            ))}
          </Stack>
        ) : (
          <EmptyStateCard
            title="No auto-play prompt history yet"
            body="Once the bot sees someone start playing a game and evaluates the prompt rules, entries will appear here."
            chips={['Discord presence', 'Prompt log', 'Auto-play DM flow']}
          />
        )}
      </Stack>
    </Card>
  )
}

function NotificationLogCard({ debugAdmin }: { debugAdmin: DebugAdminResponse }) {
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
          <Stack spacing={1.25}>
            {debugAdmin.recentNotifications.map((notification) => (
              <Card key={notification.id} variant="outlined" sx={{ p: 2 }}>
                <Stack spacing={1}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between">
                    <Typography level="title-sm">{notification.title}</Typography>
                    <Chip size="sm" color={notification.deliveredAt ? 'success' : 'neutral'} variant={notification.deliveredAt ? 'soft' : 'outlined'}>
                      {notification.deliveredAt ? 'DM delivered' : 'Stored only'}
                    </Chip>
                  </Stack>
                  <Typography level="body-sm" sx={{ color: 'neutral.300' }}>{notification.body}</Typography>
                  <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                    Recipient: {notification.recipient.displayName} @{notification.recipient.handle}
                  </Typography>
                  <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                    Triggered by: {notification.triggeredBy ? `${notification.triggeredBy.displayName} @${notification.triggeredBy.handle}` : 'System'}
                  </Typography>
                  <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                    Game: {notification.gameTitle ?? 'None'} · Created {formatDateTime(notification.createdAt)} · Delivered {formatDateTime(notification.deliveredAt)}
                  </Typography>
                </Stack>
              </Card>
            ))}
          </Stack>
        ) : (
          <EmptyStateCard
            title="No notification rows yet"
            body="Play-intent notifications will show up here after a call to play matches someone and a notification row is created."
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
  onRefreshDebug
}: {
  isSignedIn: boolean;
  debugAdmin: DebugAdminResponse | null;
  debugLoading: boolean;
  onRefreshDebug: () => Promise<void>;
}) {
  if (!isSignedIn) {
    return (
      <EmptyStateCard
        title="Sign in to inspect debug data"
        body="The debug view is only populated for authenticated sessions so it can reuse the same backend access checks as the rest of the dashboard."
        chips={['Development only', 'Signed-in route', 'Bot and prompt logs']}
      />
    )
  }

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
        <Box>
          <Typography level="h2">Admin and debug</Typography>
          <Typography level="body-md" sx={{ color: 'neutral.300', mt: 0.5 }}>
            Inspect Discord bot state, auto-play prompt decisions, and recent DM-backed notification deliveries.
          </Typography>
        </Box>
        <Button variant="outlined" color="neutral" onClick={() => void onRefreshDebug()}>
          {debugLoading ? 'Refreshing...' : 'Refresh'}
        </Button>
      </Stack>

      {debugAdmin ? (
        <>
          <BotStateCard debugAdmin={debugAdmin} />
          <Divider />
          <PromptLogCard debugAdmin={debugAdmin} />
          <NotificationLogCard debugAdmin={debugAdmin} />
        </>
      ) : (
        <EmptyStateCard
          title={debugLoading ? 'Loading debug data' : 'Debug data unavailable'}
          body={debugLoading ? 'Fetching the latest bot, prompt, and notification state from the API.' : 'No debug snapshot has been loaded yet.'}
          chips={['Bot state', 'Prompt log', 'Notification deliveries']}
        />
      )}
    </Stack>
  )
}

export function DebugView() {
  const { debugViewProps } = useDashboardContext()

  return <DebugViewContent {...debugViewProps} />
}