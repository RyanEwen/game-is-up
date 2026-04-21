import { type ReactNode, useEffect, useMemo, useState } from 'react'
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded'
import HeadsetMicRoundedIcon from '@mui/icons-material/HeadsetMicRounded'
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded'
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded'
import { Avatar, Box, Button, ButtonGroup, Card, Chip, Stack, Typography } from '@mui/joy'
import { dashboardInvalidationEventSchema, playIntentDetailResponseSchema, type PlayIntentDetail } from '@game-is-up/shared'
import { useNavigate, useParams } from 'react-router-dom'
import { EmptyStateCard } from '../components/dashboard/EmptyStateCard'
import { PlayIntentResponseUserList } from '../components/dashboard/InterestedPlayerList'
import { CompactPersonGameCard } from '../components/dashboard/PersonCard'
import { PlayIntentGameList } from '../components/dashboard/PlayIntentCard'
import { formatNotifyScopeLabel, formatPlayIntentTimingSummary, memberGameGridSx } from '../components/dashboard/dashboardUtils'
import { useDashboardContext } from '../contexts/useDashboardContext'
import { buildApiUrl } from '../hooks/useDashboardApp'
import { formatMonthDayTime } from '../lib/dateTime'
import { CtpDmInboxDialog } from './DebugDmSurface'

function formatDateTimeLabel(value: string) {
  return formatMonthDayTime(value)
}

function formatDiscordSpaceStatusLabel(status: NonNullable<PlayIntentDetail['discordSpace']>['status']) {
  switch (status) {
    case 'delete-requested':
      return 'Delete requested'
    case 'provision-failed':
      return 'Provision failed'
    default:
      return status.replace('-', ' ')
  }
}

function buildGameBadges(platformLabels: string[]) {
  if (platformLabels.length <= 3) {
    return platformLabels.map((platformLabel) => ({
      label: platformLabel,
      color: 'neutral' as const,
      variant: 'outlined' as const
    }))
  }

  return [
    ...platformLabels.slice(0, 2).map((platformLabel) => ({
      label: platformLabel,
      color: 'neutral' as const,
      variant: 'outlined' as const
    })),
    {
      label: `+${platformLabels.length - 2} more`,
      color: 'neutral' as const,
      variant: 'soft' as const
    }
  ]
}

function InterestedCountLabel({ count }: { count: number }) {
  return (
    <>
      <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>
        {count} interested
      </Box>
      <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
        {count} {count === 1 ? 'person interested' : 'people interested'}
      </Box>
    </>
  )
}

function DiscordChannelButton({
  href,
  label,
  icon,
  color = 'primary',
  disabled = false
}: {
  href: string;
  label: string;
  icon: ReactNode;
  color?: 'primary' | 'neutral';
  disabled?: boolean;
}) {
  return (
    <Button
      component={disabled ? 'button' : 'a'}
      href={disabled ? undefined : href}
      target={disabled ? undefined : '_blank'}
      rel={disabled ? undefined : 'noreferrer'}
      variant="soft"
      color={color}
      size="sm"
      disabled={disabled}
      startDecorator={(
        <Box component="span" aria-hidden sx={{ display: 'inline-flex', lineHeight: 1, '& svg': { fontSize: '1rem' } }}>
          {icon}
        </Box>
      )}
      sx={{
        justifyContent: 'flex-start',
        minWidth: 0,
        width: '100%',
        flex: 1
      }}
    >
      <Box
        component="span"
        sx={{
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}
      >
        {label}
      </Box>
    </Button>
  )
}

function DiscordDetailTextRow({
  icon,
  children
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Box component="span" aria-hidden sx={{ display: 'inline-flex', color: 'primary.300', '& svg': { fontSize: '1rem' } }}>
        {icon}
      </Box>
      <Typography level="body-sm" sx={{ color: 'neutral.200' }}>
        {children}
      </Typography>
    </Stack>
  )
}

export function PlayIntentDetailView() {
  const { playIntentId } = useParams<{ playIntentId: string }>()
  const navigate = useNavigate()
  const { overviewViewProps, playViewProps, debugViewProps } = useDashboardContext()
  const [intent, setIntent] = useState<PlayIntentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [requiresAuth, setRequiresAuth] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isDmEmulatorOpen, setIsDmEmulatorOpen] = useState(false)
  const [showNonOverlappingGames, setShowNonOverlappingGames] = useState(false)
  const [invalidationVersion, setInvalidationVersion] = useState(0)

  const discoveryPeopleById = useMemo(
    () => new Map(playViewProps.discoveryPeople.map((person) => [person.id, person] as const)),
    [playViewProps.discoveryPeople]
  )

  const refreshToken = useMemo(() => {
    if (!playIntentId) {
      return 'missing'
    }

    const preview = playViewProps.playIntentPreviews.find((candidate) => candidate.id === playIntentId) ?? null
    const activeIntent = playViewProps.activePlayIntent?.id === playIntentId ? playViewProps.activePlayIntent : null

    return [
      preview?.status ?? '',
      preview?.discordSpace?.status ?? '',
      preview?.viewerResponseChoice ?? '',
      String(preview?.interestedCount ?? ''),
      activeIntent?.id ?? '',
      activeIntent?.discordSpace?.status ?? '',
      String(activeIntent?.interestedCount ?? '')
    ].join(':')
  }, [playIntentId, playViewProps.activePlayIntent, playViewProps.playIntentPreviews])

  useEffect(() => {
    if (typeof window === 'undefined' || !playViewProps.isSignedIn) {
      return
    }

    const eventSource = new EventSource(buildApiUrl('/api/events/dashboard'), {
      withCredentials: true
    })

    eventSource.onmessage = (messageEvent) => {
      try {
        const payload = dashboardInvalidationEventSchema.parse(JSON.parse(messageEvent.data) as unknown)

        if (payload.domains.includes('play-intents')) {
          setInvalidationVersion((current) => current + 1)
        }
      } catch {
        // Ignore malformed invalidations and rely on the next valid payload.
      }
    }

    return () => {
      eventSource.close()
    }
  }, [playViewProps.isSignedIn])

  useEffect(() => {
    if (!playIntentId) {
      setIntent(null)
      setLoading(false)
      setRequiresAuth(false)
      setErrorMessage('This call to play link is missing its id.')
      return
    }

    let cancelled = false

    void (async () => {
      setLoading(true)
      setRequiresAuth(false)
      setErrorMessage(null)

      try {
        const response = await fetch(buildApiUrl(`/api/play-intents/${playIntentId}`), {
          credentials: 'include'
        })

        if (response.status === 401) {
          if (!cancelled) {
            setIntent(null)
            setRequiresAuth(true)
          }
          return
        }

        if (response.status === 404) {
          if (!cancelled) {
            setIntent(null)
            setErrorMessage('That call to play is no longer available.')
          }
          return
        }

        const responseJson = await response.json()

        if (!response.ok) {
          const responseBody = typeof responseJson === 'object' && responseJson && 'error' in responseJson && typeof responseJson.error === 'string'
            ? responseJson.error
            : 'Unable to load this call to play right now.'

          if (!cancelled) {
            setIntent(null)
            setErrorMessage(responseBody)
          }
          return
        }

        const parsedIntent = playIntentDetailResponseSchema.parse(responseJson).intent

        if (!cancelled) {
          setIntent(parsedIntent)
        }
      } catch (error) {
        if (!cancelled) {
          setIntent(null)
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load this call to play right now.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [invalidationVersion, playIntentId, refreshToken])

  useEffect(() => {
    document.title = intent
      ? `${intent.title} • Game's Up`
      : "Game's Up • Play"
  }, [intent])

  useEffect(() => {
    setShowNonOverlappingGames(false)
  }, [playIntentId])

  if (!playIntentId) {
    return (
      <EmptyStateCard
        title="Call to play unavailable"
        body="This link does not include a valid call to play id."
      />
    )
  }

  if (loading && !intent) {
    return (
      <Card variant="soft" sx={{ p: 3 }}>
        <Typography level="title-md">Loading call to play...</Typography>
        <Typography level="body-sm" sx={{ mt: 0.75, color: 'neutral.400' }}>
          Pulling the latest details from the app so the link from Discord opens with the full context.
        </Typography>
      </Card>
    )
  }

  if (requiresAuth) {
    return (
      <Card variant="soft" sx={{ p: 3 }}>
        <Stack spacing={1.5}>
          <Typography level="title-lg">Sign in to open this call to play</Typography>
          <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
            This dedicated view uses your Game&apos;s Up account to confirm which people in your network the call reaches and which games actually overlap.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button color="primary" onClick={() => void overviewViewProps.onDiscordLogin()}>
              Sign in with Discord
            </Button>
            <Button variant="outlined" color="neutral" onClick={() => navigate('/play')}>
              Back to play feed
            </Button>
          </Stack>
        </Stack>
      </Card>
    )
  }

  if (!intent) {
    return (
      <Card variant="soft" color="danger" sx={{ p: 3 }}>
        <Stack spacing={1.5}>
          <Typography level="title-lg">Call to play unavailable</Typography>
          <Typography level="body-sm">{errorMessage ?? 'This call to play could not be loaded.'}</Typography>
          <Button variant="outlined" color="neutral" onClick={() => navigate('/play')} sx={{ alignSelf: 'flex-start' }}>
            Back to play feed
          </Button>
        </Stack>
      </Card>
    )
  }

  const isOwnIntent = overviewViewProps.session?.user?.id === intent.user.id
  const canRespond = playViewProps.isSignedIn && !isOwnIntent && intent.status === 'active' && intent.appliesToViewer
  const responsePending = playViewProps.playIntentResponsePendingIntentId === intent.id
  const isMuted = playViewProps.mutedPlayIntentUserIds.has(intent.user.id)
  const isEditingCurrentIntent = isOwnIntent && intent.status === 'active'
  const isScheduledIntent = intent.status === 'active' && new Date(intent.availabilityWindow.startsAt).getTime() > Date.now() + 60 * 1000
  const libraryWideScope = intent.selectionMode === 'library' ? intent.expandedGameScope : null
  const canRevealNonOverlappingGames = libraryWideScope?.kind === 'shared-library' && libraryWideScope.nonOverlappingGames.length > 0
  const canDeleteDiscordSpace = Boolean(
    isOwnIntent
    && intent.status === 'ended'
    && intent.discordSpace
    && intent.discordSpace.status !== 'requested'
    && intent.discordSpace.status !== 'provisioning'
    && intent.discordSpace.status !== 'deleted'
  )
  const canRetryDiscordSpace = Boolean(
    isOwnIntent
    && intent.discordSpace?.lastSyncError
    && intent.discordSpace.status !== 'deleted'
    && intent.discordSpace.status !== 'provisioning'
  )
  const debugMailboxIntent = debugViewProps.debugAdmin?.recentPlayIntents.find((candidate) => candidate.id === intent.id) ?? null
  const canOpenDmEmulator = debugViewProps.debugAdmin != null && debugMailboxIntent != null

  return (
    <Stack spacing={2.5}>
      <Button
        variant="plain"
        color="neutral"
        onClick={() => navigate('/play')}
        sx={{ alignSelf: 'flex-start', px: 1.5 }}
      >
        ← Back to play feed
      </Button>

      <Card
        variant="soft"
        sx={{
          p: 3,
            border: '1px solid #14886a',
            background: 'linear-gradient(180deg, #143b33, #0d1322)',
            boxShadow: 'none'
        }}
      >
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between">
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
              <Avatar src={intent.user.avatarUrl ?? undefined} alt={intent.user.displayName} size="lg" variant="soft" />
              <Box sx={{ minWidth: 0 }}>
                <Typography level="h2" sx={{ fontSize: { xs: '1.6rem', md: '2rem' } }}>
                  {intent.title}
                </Typography>
                <Typography level="title-md" sx={{ color: 'neutral.100', mt: 0.5 }}>
                  by {intent.user.displayName}
                </Typography>
                <Typography level="body-sm" sx={{ color: 'neutral.200', mt: 0.5 }}>
                  {formatPlayIntentTimingSummary(intent.availabilityWindow.startsAt, intent.availabilityWindow.endsAt)}
                </Typography>
              </Box>
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ flexWrap: 'wrap', alignItems: { xs: 'stretch', sm: 'flex-start' } }}>
              {isEditingCurrentIntent ? (
                <Button
                  color="primary"
                  sx={{ width: { xs: '100%', sm: 'auto' } }}
                  onClick={() => {
                    playViewProps.openPlayIntentComposerForIntent(intent)
                    navigate('/play')
                  }}
                >
                  Edit call to play
                </Button>
              ) : null}
              {canOpenDmEmulator ? (
                <Button
                  variant="outlined"
                  color="neutral"
                  sx={{ width: { xs: '100%', sm: 'auto' } }}
                  onClick={() => setIsDmEmulatorOpen(true)}
                >
                  Open DM emulator
                </Button>
              ) : null}
              {canRespond ? (
                <ButtonGroup
                  sx={{
                    width: { xs: '100%', sm: 'auto' },
                    '& > *': {
                      flex: { xs: 1, sm: 'initial' },
                      minWidth: 0
                    }
                  }}
                >
                  {intent.viewerResponseChoice !== 'interested' ? (
                    <Button
                      variant="solid"
                      color="primary"
                      disabled={responsePending}
                      onClick={() => void playViewProps.onRespondToPlayIntent(intent.id, 'interested')}
                    >
                      I&apos;m interested
                    </Button>
                  ) : null}
                  {intent.viewerResponseChoice !== 'pass' ? (
                    <Button
                      variant="outlined"
                      color="neutral"
                      disabled={responsePending}
                      onClick={() => void playViewProps.onRespondToPlayIntent(intent.id, 'pass')}
                    >
                      Pass
                    </Button>
                  ) : null}
                </ButtonGroup>
              ) : null}
              {!isOwnIntent && playViewProps.isSignedIn ? (
                <Button
                  variant={isMuted ? 'soft' : 'outlined'}
                  color="neutral"
                  sx={{ width: { xs: '100%', sm: 'auto' } }}
                  onClick={() => void (isMuted ? playViewProps.onUnmutePlayIntentUser(intent.user.id) : playViewProps.onMutePlayIntentUser(intent.user.id))}
                >
                  {isMuted ? 'Unmute creator' : 'Mute creator'}
                </Button>
              ) : null}
              {canDeleteDiscordSpace ? (
                <Button
                  variant="outlined"
                  color="danger"
                  sx={{ width: { xs: '100%', sm: 'auto' } }}
                  disabled={playViewProps.playIntentDiscordSpaceDeletePendingIntentId === intent.id}
                  onClick={() => void playViewProps.onDeletePlayIntentDiscordSpace(intent.id)}
                >
                  {playViewProps.playIntentDiscordSpaceDeletePendingIntentId === intent.id
                    ? 'Removing Discord channel...'
                    : 'Remove Discord channel'}
                </Button>
              ) : null}
            </Stack>
          </Stack>

          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            <Chip size="sm" color={intent.status === 'active' ? 'success' : 'warning'} variant="soft">
              {intent.status === 'active' ? 'Active' : 'Ended'}
            </Chip>
            {isScheduledIntent ? (
              <Chip size="sm" color="warning" variant="soft" startDecorator={<ScheduleRoundedIcon fontSize="small" />}>
                Scheduled
              </Chip>
            ) : null}
            <Chip size="sm" color="primary" variant="soft">
              {intent.selectionMode === 'library' ? 'Any game in library' : 'Selected games'}
            </Chip>
            <Chip size="sm" color="neutral" variant="outlined">
              {formatNotifyScopeLabel(intent.notifyScope)}
            </Chip>
            {!intent.appliesToViewer ? (
              <Chip size="sm" color="warning" variant="outlined">
                Not for you right now
              </Chip>
            ) : null}
            {intent.interestedCount > 0 ? (
              <Chip size="sm" color="success" variant="soft">
                <InterestedCountLabel count={intent.interestedCount} />
              </Chip>
            ) : null}
          </Stack>

          {intent.note.trim() ? (
            <Typography level="body-md" sx={{ color: 'neutral.100' }}>
              {intent.note}
            </Typography>
          ) : null}

          {intent.viewerResponseChoice ? (
            <Card variant="soft" color={intent.viewerResponseChoice === 'interested' ? 'success' : 'neutral'} sx={{ p: 1.5 }}>
              <Typography level="body-sm">
                {intent.viewerResponseChoice === 'interested'
                  ? 'You are marked as interested in this call to play.'
                  : 'You are marked as passed on this call to play.'}
              </Typography>
            </Card>
          ) : null}

          {responsePending ? (
            <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
              Updating your response...
            </Typography>
          ) : null}

          {!intent.appliesToViewer ? (
            <Card
              variant="outlined"
              color="warning"
              sx={{ p: 1.5, borderColor: 'warning.700', backgroundColor: 'warning.900' }}
            >
              <Typography level="body-sm" sx={{ color: 'warning.200' }}>
                This call is visible in your network, but it does not currently include you.
              </Typography>
            </Card>
          ) : null}
        </Stack>
      </Card>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1.75fr) minmax(300px, 1fr)' },
          gap: 2
        }}
      >
        <Stack spacing={2}>
          <Card variant="outlined" sx={{ p: 3 }}>
            <Stack spacing={1.5}>
              <Typography level="title-md">Who this call can reach</Typography>
              <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                {intent.audienceSummary}
              </Typography>
              {intent.notifyScope === 'specific-discord-server' && intent.targetServers.length > 0 ? (
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                  {intent.targetServers.map((server) => (
                    <Chip
                      key={server.id}
                      size="sm"
                      color="neutral"
                      variant="outlined"
                      startDecorator={<Avatar src={server.iconUrl ?? undefined} alt={server.name} size="sm" variant="soft" />}
                    >
                      {server.name}
                    </Chip>
                  ))}
                </Stack>
              ) : null}
              {intent.targetedFriends.length > 0 ? (
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                  {intent.targetedFriends.map((friend) => (
                    <Chip
                      key={friend.id}
                      size="sm"
                      color="neutral"
                      variant="soft"
                      startDecorator={<Avatar src={friend.avatarUrl ?? undefined} alt={friend.displayName} size="sm" variant="soft" />}
                    >
                      {friend.displayName}
                    </Chip>
                  ))}
                </Stack>
              ) : null}
            </Stack>
          </Card>

          {libraryWideScope ? (
            <Card variant="outlined" sx={{ p: 3 }}>
              <Stack spacing={1.5}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }}>
                  <Box>
                    <Typography level="title-md">{libraryWideScope.title}</Typography>
                    <Typography level="body-sm" sx={{ color: 'neutral.300', mt: 0.5 }}>
                      {libraryWideScope.description}
                    </Typography>
                  </Box>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'flex-start', sm: 'center' }}>
                    <Chip size="sm" color="primary" variant="soft">
                      {libraryWideScope.totalCount} {libraryWideScope.totalCount === 1 ? 'game' : 'games'}
                    </Chip>
                    {canRevealNonOverlappingGames ? (
                      <Button
                        size="sm"
                        variant="soft"
                        color={showNonOverlappingGames ? 'warning' : 'neutral'}
                        onClick={() => setShowNonOverlappingGames((currentValue) => !currentValue)}
                      >
                        {showNonOverlappingGames
                          ? 'Show overlap only'
                          : `Show non-overlap (${libraryWideScope.nonOverlappingGames.length})`}
                      </Button>
                    ) : null}
                  </Stack>
                </Stack>

                {libraryWideScope.games.length > 0 ? (
                  <Box sx={memberGameGridSx}>
                    {libraryWideScope.games.map((game) => (
                      <CompactPersonGameCard
                        key={game.id}
                        game={{
                          gameId: game.id,
                          title: game.title,
                          coverUrl: game.coverUrl,
                          platformLabels: game.platformLabels
                        }}
                        canAddToLibrary={playViewProps.isSignedIn}
                        isInLibrary={playViewProps.libraryGameIds.has(game.id)}
                        isAddingToLibrary={playViewProps.addingLibraryGameId === game.id}
                        supportingText={libraryWideScope.kind === 'creator-library' ? 'Covered by this call' : 'Current overlap'}
                        detailLines={[
                          libraryWideScope.kind === 'creator-library'
                            ? 'This title is included because the call covers the creator\'s full active library.'
                            : 'This title is part of the current overlap between your library and the creator\'s library.',
                          `Platforms: ${game.platformLabels.join(', ')}`
                        ]}
                        badges={buildGameBadges(game.platformLabels)}
                        footerBadge={libraryWideScope.kind === 'creator-library'
                          ? {
                              label: 'Creator library',
                              color: 'primary'
                            }
                          : null}
                        onAddToLibrary={playViewProps.onAddGameToLibrary}
                      />
                    ))}
                  </Box>
                ) : (
                  <EmptyStateCard
                    title={libraryWideScope.kind === 'creator-library' ? 'No active library titles yet' : 'No shared games yet'}
                    body={libraryWideScope.description}
                  />
                )}

                {canRevealNonOverlappingGames && showNonOverlappingGames ? (
                  <Stack spacing={1.5}>
                    <Typography level="title-sm">Other games in {intent.user.displayName}&apos;s library</Typography>
                    <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
                      These titles are part of the creator&apos;s active library, but they do not currently overlap with yours.
                    </Typography>
                    <Box sx={memberGameGridSx}>
                      {libraryWideScope.nonOverlappingGames.map((game) => (
                        <CompactPersonGameCard
                          key={`non-overlap-${game.id}`}
                          game={{
                            gameId: game.id,
                            title: game.title,
                            coverUrl: game.coverUrl,
                            platformLabels: game.platformLabels
                          }}
                          canAddToLibrary={playViewProps.isSignedIn}
                          isInLibrary={playViewProps.libraryGameIds.has(game.id)}
                          isAddingToLibrary={playViewProps.addingLibraryGameId === game.id}
                          supportingText="Not in your current overlap"
                          detailLines={[
                            `This title is in ${intent.user.displayName}'s library, but it does not currently overlap with yours.`,
                            `Platforms: ${game.platformLabels.join(', ')}`
                          ]}
                          badges={buildGameBadges(game.platformLabels)}
                          footerBadge={null}
                          onAddToLibrary={playViewProps.onAddGameToLibrary}
                        />
                      ))}
                    </Box>
                  </Stack>
                ) : null}
              </Stack>
            </Card>
          ) : (
            <Card variant="outlined" sx={{ p: 3 }}>
              <Stack spacing={1.5}>
                <Typography level="title-md">Selected games</Typography>
                <PlayIntentGameList
                  games={intent.games}
                  label="Games in this call to play"
                  canAddToLibrary={playViewProps.isSignedIn}
                  libraryGameIds={playViewProps.libraryGameIds}
                  addingLibraryGameId={playViewProps.addingLibraryGameId}
                  onAddToLibrary={playViewProps.onAddGameToLibrary}
                />
              </Stack>
            </Card>
          )}
        </Stack>

        <Stack spacing={2}>
          <Card variant="outlined" sx={{ p: 3 }}>
            <Stack spacing={1.5}>
              <Typography level="title-md">Call details</Typography>
              <Stack spacing={0.75}>
                <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                  Timing: {formatPlayIntentTimingSummary(intent.availabilityWindow.startsAt, intent.availabilityWindow.endsAt)}
                </Typography>
                <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                  Ends: {formatDateTimeLabel(intent.availabilityWindow.endsAt)}
                </Typography>
                <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                  Created: {formatDateTimeLabel(intent.createdAt)}
                </Typography>
                {(intent.discordSpace || intent.voiceChannelName) ? (
                  <Card
                    variant="soft"
                    color="primary"
                    sx={{ p: 1.5, mt: 0.5 }}
                  >
                    <Stack spacing={1.25}>
                      {intent.discordSpace?.status === 'deleted' ? (
                        <Typography level="body-xs" sx={{ color: 'neutral.300' }}>
                          This temporary Discord channel has been deleted.
                        </Typography>
                      ) : null}

                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }}>
                        <Typography level="title-sm">Discord access</Typography>
                        {intent.discordSpace ? (
                          <Chip size="sm" color="primary" variant="soft">
                            {formatDiscordSpaceStatusLabel(intent.discordSpace.status)}
                          </Chip>
                        ) : null}
                      </Stack>

                      {intent.discordSpace?.textChannelUrl || intent.discordSpace?.voiceChannelUrl || intent.discordSpace?.inviteUrl ? (
                        <Box
                          sx={{
                            display: 'grid',
                            gap: 1,
                            gridTemplateColumns: {
                              xs: '1fr',
                              sm: 'repeat(2, minmax(0, 1fr))'
                            }
                          }}
                        >
                          {intent.discordSpace?.textChannelUrl ? (
                            <DiscordChannelButton
                              href={intent.discordSpace.textChannelUrl}
                              label={intent.discordSpace.textChannelName ?? 'Open text channel'}
                              icon={<ChatBubbleOutlineRoundedIcon />}
                              disabled={intent.discordSpace.status === 'deleted'}
                            />
                          ) : null}
                          {intent.discordSpace?.voiceChannelUrl ? (
                            <DiscordChannelButton
                              href={intent.discordSpace.voiceChannelUrl}
                              label={intent.discordSpace.voiceChannelName ?? 'Open voice channel'}
                              icon={<HeadsetMicRoundedIcon />}
                              disabled={intent.discordSpace.status === 'deleted'}
                            />
                          ) : null}
                          {intent.discordSpace?.inviteUrl ? (
                            <DiscordChannelButton
                              href={intent.discordSpace.inviteUrl}
                              label="Open Discord invite"
                              icon={<OpenInNewRoundedIcon />}
                              color="neutral"
                              disabled={intent.discordSpace.status === 'deleted'}
                            />
                          ) : null}
                        </Box>
                      ) : null}

                      {intent.discordSpace?.textChannelUrl == null && intent.discordSpace?.textChannelName ? (
                        <DiscordDetailTextRow icon={<ChatBubbleOutlineRoundedIcon />}>
                          Text channel: {intent.discordSpace.textChannelName}
                        </DiscordDetailTextRow>
                      ) : null}
                      {intent.discordSpace?.voiceChannelUrl == null && intent.discordSpace?.voiceChannelName ? (
                        <DiscordDetailTextRow icon={<HeadsetMicRoundedIcon />}>
                          Voice channel: {intent.discordSpace.voiceChannelName}
                        </DiscordDetailTextRow>
                      ) : null}
                      {!intent.discordSpace && intent.voiceChannelName ? (
                        <DiscordDetailTextRow icon={<HeadsetMicRoundedIcon />}>
                          Voice channel: {intent.voiceChannelName}
                        </DiscordDetailTextRow>
                      ) : null}

                      {intent.discordSpace?.lastSyncError ? (
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'flex-start', sm: 'center' }}>
                          <Typography level="body-xs" sx={{ color: 'warning.200', flex: 1 }}>
                            {intent.discordSpace.lastSyncError}
                          </Typography>
                          {canRetryDiscordSpace ? (
                            <Button
                              size="sm"
                              variant="soft"
                              color="warning"
                              disabled={playViewProps.playIntentDiscordSpaceRetryPendingIntentId === intent.id}
                              onClick={() => void playViewProps.onRetryPlayIntentDiscordSpace(intent.id)}
                              sx={{ flexShrink: 0 }}
                            >
                              {playViewProps.playIntentDiscordSpaceRetryPendingIntentId === intent.id
                                ? 'Retrying...'
                                : 'Retry access'}
                            </Button>
                          ) : null}
                        </Stack>
                      ) : null}
                    </Stack>
                  </Card>
                ) : null}
              </Stack>
            </Stack>
          </Card>

          <Card variant="outlined" sx={{ p: 3 }}>
            <Stack spacing={2}>
              <Typography level="title-md">Responses</Typography>
              <Box>
                <PlayIntentResponseUserList
                  users={intent.interestedUsers}
                  label="Interested players"
                  tone="interested"
                  discoveryPeopleById={discoveryPeopleById}
                  canManage={playViewProps.isSignedIn}
                  friendPendingId={playViewProps.friendPendingId}
                  onToggleFriend={playViewProps.onToggleFriend}
                />
                {intent.interestedUsers.length === 0 ? (
                  <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
                    Nobody has marked themselves as interested yet.
                  </Typography>
                ) : null}
              </Box>

              {intent.notifyScope === 'specific-friends' ? (
                <Box sx={{ pt: 2, borderTop: '1px solid', borderColor: 'neutral.700' }}>
                  <PlayIntentResponseUserList
                    users={intent.passedUsers}
                    label="Passed on this call"
                    tone="passed"
                    discoveryPeopleById={discoveryPeopleById}
                    canManage={playViewProps.isSignedIn}
                    friendPendingId={playViewProps.friendPendingId}
                    onToggleFriend={playViewProps.onToggleFriend}
                  />
                  {intent.passedUsers.length === 0 ? (
                    <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
                      Nobody has passed on this call yet.
                    </Typography>
                  ) : null}
                </Box>
              ) : null}
            </Stack>
          </Card>
        </Stack>
      </Box>

      {errorMessage ? (
        <Card variant="soft" color="warning" sx={{ p: 1.5 }}>
          <Typography level="body-sm">{errorMessage}</Typography>
        </Card>
      ) : null}

      <CtpDmInboxDialog
        open={isDmEmulatorOpen}
        onClose={() => setIsDmEmulatorOpen(false)}
        ctp={debugMailboxIntent}
        formatDateTime={(value) => value ? formatMonthDayTime(value) : 'Not available'}
        buildApiUrl={debugViewProps.buildApiUrl}
        onRefreshDebug={debugViewProps.onRefreshDebug}
        parseDebugDmActionResponse={debugViewProps.parseDebugDmActionResponse}
      />
    </Stack>
  )
}