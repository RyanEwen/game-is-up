import { useEffect, useMemo, useState } from 'react'
import { Avatar, Box, Button, Card, Chip, Link, Stack, Typography } from '@mui/joy'
import { playIntentDetailResponseSchema, type PlayIntentDetail } from '@game-is-up/shared'
import { useNavigate, useParams } from 'react-router-dom'
import { EmptyStateCard } from '../components/dashboard/EmptyStateCard'
import { InterestedPlayerList } from '../components/dashboard/InterestedPlayerList'
import { CompactPersonGameCard } from '../components/dashboard/PersonCard'
import { PlayIntentGameList } from '../components/dashboard/PlayIntentCard'
import { formatNotifyScopeLabel, memberGameGridSx } from '../components/dashboard/dashboardUtils'
import { useDashboardContext } from '../contexts/useDashboardContext'
import { buildApiUrl } from '../hooks/useDashboardApp'

function formatDateTimeLabel(value: string) {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
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

function DiscordChannelLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} target="_blank" rel="noreferrer" sx={{ color: 'primary.200' }}>
      {label}
    </Link>
  )
}

export function PlayIntentDetailView() {
  const { playIntentId } = useParams<{ playIntentId: string }>()
  const navigate = useNavigate()
  const { overviewViewProps, playViewProps } = useDashboardContext()
  const [intent, setIntent] = useState<PlayIntentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [requiresAuth, setRequiresAuth] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

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
      preview?.viewerResponseChoice ?? '',
      String(preview?.interestedCount ?? ''),
      activeIntent?.id ?? '',
      String(activeIntent?.interestedCount ?? '')
    ].join(':')
  }, [playIntentId, playViewProps.activePlayIntent, playViewProps.playIntentPreviews])

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
  }, [playIntentId, refreshToken])

  useEffect(() => {
    document.title = intent
      ? `${intent.title} • Game's Up`
      : "Game's Up • Play"
  }, [intent])

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
            This dedicated view uses your Game&apos;s Up account to confirm who can see the call and which games actually overlap.
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
  const isEditingCurrentIntent = playViewProps.activePlayIntent?.id === intent.id
  const libraryWideScope = intent.selectionMode === 'library' ? intent.expandedGameScope : null

  return (
    <Stack spacing={2.5}>
      <Button
        variant="plain"
        color="neutral"
        onClick={() => navigate('/play')}
        sx={{ alignSelf: 'flex-start', px: 0 }}
      >
        Back to play feed
      </Button>

      <Card
        variant="soft"
        sx={{
          p: 3,
          border: '1px solid rgba(87, 244, 193, 0.18)',
          background: 'linear-gradient(180deg, rgba(15, 84, 68, 0.28), rgba(11, 16, 32, 0.94))',
          boxShadow: '0 24px 40px -32px rgba(28, 171, 132, 0.5)'
        }}
      >
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between">
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
              <Avatar src={intent.user.avatarUrl ?? undefined} alt={intent.user.displayName} size="lg" variant="soft" />
              <Box sx={{ minWidth: 0 }}>
                <Typography level="body-xs" sx={{ color: 'primary.200', textTransform: 'uppercase', letterSpacing: '0.08em', mb: 0.75 }}>
                  Dedicated call view
                </Typography>
                <Typography level="h2" sx={{ fontSize: { xs: '1.6rem', md: '2rem' } }}>
                  {intent.title}
                </Typography>
                <Typography level="body-sm" sx={{ color: 'neutral.200', mt: 0.5 }}>
                  {intent.availabilityWindow.label}
                </Typography>
              </Box>
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ flexWrap: 'wrap', alignItems: { xs: 'stretch', sm: 'flex-start' } }}>
              {isEditingCurrentIntent ? (
                <Button
                  color="primary"
                  onClick={() => {
                    playViewProps.openPlayIntentComposer()
                    navigate('/play')
                  }}
                >
                  Edit call to play
                </Button>
              ) : null}
              {canRespond && intent.viewerResponseChoice !== 'interested' ? (
                <Button
                  variant="solid"
                  color="primary"
                  disabled={responsePending}
                  onClick={() => void playViewProps.onRespondToPlayIntent(intent.id, 'interested')}
                >
                  I&apos;m interested
                </Button>
              ) : null}
              {canRespond && intent.viewerResponseChoice !== 'pass' ? (
                <Button
                  variant="outlined"
                  color="neutral"
                  disabled={responsePending}
                  onClick={() => void playViewProps.onRespondToPlayIntent(intent.id, 'pass')}
                >
                  Pass
                </Button>
              ) : null}
              {!isOwnIntent && playViewProps.isSignedIn ? (
                <Button
                  variant={isMuted ? 'soft' : 'outlined'}
                  color="neutral"
                  onClick={() => void (isMuted ? playViewProps.onUnmutePlayIntentUser(intent.user.id) : playViewProps.onMutePlayIntentUser(intent.user.id))}
                >
                  {isMuted ? 'Unmute creator' : 'Mute creator'}
                </Button>
              ) : null}
            </Stack>
          </Stack>

          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            <Chip size="sm" color={intent.status === 'active' ? 'success' : 'warning'} variant="soft">
              {intent.status === 'active' ? 'Active' : 'Closed'}
            </Chip>
            <Chip size="sm" color="primary" variant="soft">
              {intent.selectionMode === 'library' ? 'Any game in library' : 'Selected games'}
            </Chip>
            <Chip size="sm" color="neutral" variant="outlined">
              {formatNotifyScopeLabel(intent.notifyScope)}
            </Chip>
            {!intent.appliesToViewer ? (
              <Chip size="sm" color="warning" variant="soft">
                No current library match
              </Chip>
            ) : null}
            {intent.interestedCount > 0 ? (
              <Chip size="sm" color="success" variant="soft">
                {intent.interestedCount} {intent.interestedCount === 1 ? 'person interested' : 'people interested'}
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
            <Card variant="soft" color="warning" sx={{ p: 1.5 }}>
              <Typography level="body-sm">
                This call is visible to you, but none of your current games match it right now.
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
          <Card variant="outlined" sx={{ p: 3, borderColor: 'rgba(255, 255, 255, 0.08)', backgroundColor: 'rgba(13, 18, 30, 0.82)' }}>
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
            <Card variant="outlined" sx={{ p: 3, borderColor: 'rgba(255, 255, 255, 0.08)', backgroundColor: 'rgba(13, 18, 30, 0.82)' }}>
              <Stack spacing={1.5}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }}>
                  <Box>
                    <Typography level="title-md">{libraryWideScope.title}</Typography>
                    <Typography level="body-sm" sx={{ color: 'neutral.300', mt: 0.5 }}>
                      {libraryWideScope.description}
                    </Typography>
                  </Box>
                  <Chip size="sm" color="primary" variant="soft">
                    {libraryWideScope.totalCount} {libraryWideScope.totalCount === 1 ? 'game' : 'games'}
                  </Chip>
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
                        footerBadge={{
                          label: libraryWideScope.kind === 'creator-library' ? 'Creator library' : 'Shared overlap',
                          color: libraryWideScope.kind === 'creator-library' ? 'primary' : 'success'
                        }}
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
              </Stack>
            </Card>
          ) : (
            <Card variant="outlined" sx={{ p: 3, borderColor: 'rgba(255, 255, 255, 0.08)', backgroundColor: 'rgba(13, 18, 30, 0.82)' }}>
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
          <Card variant="outlined" sx={{ p: 3, borderColor: 'rgba(255, 255, 255, 0.08)', backgroundColor: 'rgba(13, 18, 30, 0.82)' }}>
            <Stack spacing={1.5}>
              <Typography level="title-md">Call details</Typography>
              <Stack spacing={0.75}>
                <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                  Starts: {formatDateTimeLabel(intent.availabilityWindow.startsAt)}
                </Typography>
                <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                  Ends: {formatDateTimeLabel(intent.availabilityWindow.endsAt)}
                </Typography>
                <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                  Created: {formatDateTimeLabel(intent.createdAt)}
                </Typography>
                {intent.voiceChannelName ? (
                  <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                    Voice channel: {intent.voiceChannelName}
                  </Typography>
                ) : null}
                {intent.discordSpace ? (
                  <Stack spacing={0.75}>
                    <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                      Temporary Discord space: {formatDiscordSpaceStatusLabel(intent.discordSpace.status)}
                    </Typography>
                    {intent.discordSpace.textChannelUrl ? (
                      <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                        Text channel:{' '}
                        <DiscordChannelLink
                          href={intent.discordSpace.textChannelUrl}
                          label={intent.discordSpace.textChannelName ?? 'Open text channel'}
                        />
                      </Typography>
                    ) : intent.discordSpace.textChannelName ? (
                      <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                        Text channel: {intent.discordSpace.textChannelName}
                      </Typography>
                    ) : null}
                    {intent.discordSpace.voiceChannelUrl ? (
                      <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                        Voice channel:{' '}
                        <DiscordChannelLink
                          href={intent.discordSpace.voiceChannelUrl}
                          label={intent.discordSpace.voiceChannelName ?? 'Open voice channel'}
                        />
                      </Typography>
                    ) : intent.discordSpace.voiceChannelName ? (
                      <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                        Voice channel: {intent.discordSpace.voiceChannelName}
                      </Typography>
                    ) : null}
                    {intent.discordSpace.inviteUrl ? (
                      <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                        Invite:{' '}
                        <DiscordChannelLink href={intent.discordSpace.inviteUrl} label="Open Discord invite" />
                      </Typography>
                    ) : null}
                  </Stack>
                ) : null}
              </Stack>
            </Stack>
          </Card>

          <Card variant="outlined" sx={{ p: 3, borderColor: 'rgba(255, 255, 255, 0.08)', backgroundColor: 'rgba(13, 18, 30, 0.82)' }}>
            <InterestedPlayerList
              users={intent.interestedUsers}
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
          </Card>
        </Stack>
      </Box>

      {errorMessage ? (
        <Card variant="soft" color="warning" sx={{ p: 1.5 }}>
          <Typography level="body-sm">{errorMessage}</Typography>
        </Card>
      ) : null}
    </Stack>
  )
}