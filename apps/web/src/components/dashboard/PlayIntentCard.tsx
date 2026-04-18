import { Avatar, Box, Button, Card, Chip, Stack, Typography } from '@mui/joy'
import type { ActivePlayIntent, DiscoveryPerson, PlayIntentPreview, PlayIntentRecipientResponseChoice } from '@game-is-up/shared'
import { InterestedPlayerList } from './InterestedPlayerList'
import { CompactPersonGameCard } from './PersonCard'
import { formatNotifyScopeLabel } from './dashboardUtils'
import type { DashboardLibraryQuickAddGame, FriendTarget } from './types'

const selectedGameGridSx = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
  gap: 1.25
} as const

type PlayIntentGame = ActivePlayIntent['games'][number] | PlayIntentPreview['games'][number]

export function PlayIntentGameList({
  games,
  canAddToLibrary,
  libraryGameIds,
  addingLibraryGameId,
  onAddToLibrary,
  label = 'Games in this call to play'
}: {
  games: PlayIntentGame[];
  canAddToLibrary: boolean;
  libraryGameIds: ReadonlySet<string>;
  addingLibraryGameId: string | null;
  onAddToLibrary: (game: DashboardLibraryQuickAddGame) => Promise<void>;
  label?: string;
}) {
  if (games.length === 0) {
    return null
  }

  return (
    <Box>
      <Typography level="body-xs" sx={{ mb: 0.75, color: 'primary.200', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </Typography>
      <Box sx={selectedGameGridSx}>
        {games.map((game) => {
          return (
            <CompactPersonGameCard
              key={game.id}
              game={{
                gameId: game.id,
                title: game.title,
                coverUrl: game.coverUrl ?? null,
                platformLabels: [game.platform]
              }}
              canAddToLibrary={canAddToLibrary}
              isInLibrary={libraryGameIds.has(game.id)}
              isAddingToLibrary={addingLibraryGameId === game.id}
              supportingText="Looking to play"
              detailLines={[
                'Included in this call to play.',
                `Platform: ${game.platform}`
              ]}
              badges={[
                { label: 'Looking to play', color: 'primary' },
                { label: game.platform, variant: 'outlined' }
              ]}
              onAddToLibrary={onAddToLibrary}
            />
          )
        })}
      </Box>
    </Box>
  )
}

export function PlayIntentCard({
  intent,
  canAddToLibrary,
  discoveryPeopleById,
  libraryGameIds,
  addingLibraryGameId,
  friendPendingId,
  onAddToLibrary,
  onToggleFriend,
  responsePending,
  onRespondToIntent,
  isMuted,
  onMuteCreator,
  onUnmuteCreator,
  onOpenDmEmulator
}: {
  intent: PlayIntentPreview;
  canAddToLibrary: boolean;
  discoveryPeopleById: ReadonlyMap<string, DiscoveryPerson>;
  libraryGameIds: ReadonlySet<string>;
  addingLibraryGameId: string | null;
  friendPendingId: string | null;
  onAddToLibrary: (game: DashboardLibraryQuickAddGame) => Promise<void>;
  onToggleFriend: (target: FriendTarget) => Promise<void>;
  responsePending: boolean;
  onRespondToIntent: (playIntentId: string, responseChoice: PlayIntentRecipientResponseChoice) => Promise<void>;
  isMuted: boolean;
  onMuteCreator: (userId: string) => Promise<void>;
  onUnmuteCreator: (userId: string) => Promise<void>;
  onOpenDmEmulator?: () => void;
}) {
  const isLibraryWide = intent.selectionMode === 'library'
  const isClosed = intent.status === 'closed'
  const canRespondToIntent = canAddToLibrary && intent.appliesToViewer && !isClosed
  const viewerResponseChoice = intent.viewerResponseChoice
  const actionButtonSx = {
    flexShrink: 0,
    borderRadius: 'md',
    minHeight: '2rem',
    px: 1.25,
    fontSize: 'xs',
    fontWeight: 'md',
    lineHeight: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
    transition: 'background-color 180ms ease, border-color 180ms ease, color 180ms ease, transform 120ms ease',
    '&:hover': {
      backgroundColor: 'rgba(255, 255, 255, 0.06)',
      borderColor: 'rgba(181, 192, 208, 0.28)',
      transform: 'translateY(-1px)'
    },
    '&:active': {
      transform: 'translateY(0)'
    }
  } as const

  return (
    <Card
      variant="outlined"
      sx={{
        p: 3,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        backgroundColor: 'rgba(13, 18, 30, 0.82)'
      }}
    >
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" sx={{ mb: 1.5 }}>
        <Stack direction="row" spacing={1.25} alignItems="center">
          <Avatar src={intent.user.avatarUrl ?? undefined} alt={intent.user.displayName} size="lg" variant="soft" />
          <Box>
            <Typography level="title-lg">{intent.title}</Typography>
            <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
              {intent.availabilityWindow.label}
            </Typography>
          </Box>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }} alignItems="center">
          {isClosed ? (
            <Chip size="sm" color="warning" variant="soft">
              Closed
            </Chip>
          ) : null}
          <Chip size="sm" color="primary" variant="soft">
            {isLibraryWide ? 'Any game in library' : 'Selected games'}
          </Chip>
          <Chip size="sm" color="neutral" variant="outlined">
            {formatNotifyScopeLabel(intent.notifyScope)}
          </Chip>
          {!intent.appliesToViewer ? (
            <Chip size="sm" color="neutral" variant="soft">
              Does not match your library
            </Chip>
          ) : null}
          {intent.joinCount > 0 ? (
            <Chip size="sm" color="success" variant="soft">
              {intent.joinCount} {intent.joinCount === 1 ? 'person interested' : 'people interested'}
            </Chip>
          ) : null}
          {canRespondToIntent && viewerResponseChoice !== 'join' ? (
            <Button
              variant="outlined"
              color="neutral"
              size="sm"
              disabled={!canAddToLibrary || responsePending}
              onClick={() => void onRespondToIntent(intent.id, 'join')}
              sx={actionButtonSx}
            >
              I'm interested
            </Button>
          ) : null}
          {canRespondToIntent && viewerResponseChoice !== 'decline' ? (
            <Button
              variant="outlined"
              color="neutral"
              size="sm"
              disabled={!canAddToLibrary || responsePending}
              onClick={() => void onRespondToIntent(intent.id, 'decline')}
              sx={actionButtonSx}
            >
              Pass
            </Button>
          ) : null}
          <Button
            variant={isMuted ? 'soft' : 'outlined'}
            color="neutral"
            size="sm"
            onClick={() => void (isMuted ? onUnmuteCreator(intent.user.id) : onMuteCreator(intent.user.id))}
            sx={actionButtonSx}
          >
            {isMuted ? 'Unmute creator' : 'Mute creator'}
          </Button>
          {onOpenDmEmulator ? (
            <Button
              variant="outlined"
              color="neutral"
              size="sm"
              onClick={onOpenDmEmulator}
              sx={actionButtonSx}
            >
              Open DM emulator
            </Button>
          ) : null}
        </Stack>
      </Stack>

      {isClosed ? (
        <Typography level="body-xs" sx={{ mb: 1.5, color: 'warning.200' }}>
          This call to play has ended.
        </Typography>
      ) : null}

      {!intent.appliesToViewer ? (
        <Typography level="body-xs" sx={{ mb: 1.5, color: 'neutral.400' }}>
          This call is visible in your network, but it does not currently match your library.
        </Typography>
      ) : null}

      {viewerResponseChoice ? (
        <Typography level="body-xs" sx={{ mb: 1.5, color: viewerResponseChoice === 'join' ? 'success.300' : 'neutral.400' }}>
          {viewerResponseChoice === 'join' ? 'You are marked as interested in this call to play.' : 'You are marked as passed on this call to play.'}
        </Typography>
      ) : null}

      {responsePending ? (
        <Typography level="body-xs" sx={{ mb: 1.5, color: 'neutral.400' }}>
          Updating your response...
        </Typography>
      ) : null}

      {intent.note.trim() ? (
        <Typography level="body-md" sx={{ mb: 2, color: 'neutral.200' }}>
          {intent.note}
        </Typography>
      ) : null}

      {intent.voiceChannelName ? (
        <Typography level="body-sm" sx={{ mb: 1.5, color: 'neutral.300' }}>
          Voice channel: {intent.voiceChannelName}
        </Typography>
      ) : null}

      {intent.notifyScope === 'specific-discord-server' && intent.targetServers.length > 0 ? (
        <Typography level="body-sm" sx={{ mb: 1.5, color: 'neutral.300' }}>
          Target Discord servers: {intent.targetServers.map((server) => server.name).join(', ')}
        </Typography>
      ) : null}

      <InterestedPlayerList
        users={intent.interestedUsers}
        sx={{ mb: intent.selectionMode === 'subset' || isLibraryWide ? 2 : 0 }}
        discoveryPeopleById={discoveryPeopleById}
        canManage={canAddToLibrary}
        friendPendingId={friendPendingId}
        onToggleFriend={onToggleFriend}
      />

      {isLibraryWide ? (
        <>
          <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }}>
            {intent.platforms.map((platform) => (
              <Chip key={platform} size="sm" variant="outlined" color="neutral">
                {platform}
              </Chip>
            ))}
          </Stack>
          <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
            This call to play is for any proposed game that matches, not one specific title.
          </Typography>
        </>
      ) : (
        <PlayIntentGameList
          games={intent.games}
          canAddToLibrary={canAddToLibrary}
          libraryGameIds={libraryGameIds}
          addingLibraryGameId={addingLibraryGameId}
          onAddToLibrary={onAddToLibrary}
        />
      )}
    </Card>
  )
}