import { Avatar, Box, Button, Card, Chip, Stack, Typography } from '@mui/joy'
import type { ActivePlayIntent, PlayIntentPreview } from '@game-is-up/shared'
import { CompactPersonGameCard } from './PersonCard'
import { formatNotifyScopeLabel, formatPlayIntentTimingSummary, topLevelCardSx } from './dashboardUtils'
import type { DashboardLibraryQuickAddGame } from './types'

const selectedGameGridSx = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
  gap: 1.25
} as const

type PlayIntentGame = ActivePlayIntent['games'][number] | PlayIntentPreview['games'][number]

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
  onOpenDetails
}: {
  intent: PlayIntentPreview;
  onOpenDetails: (playIntentId: string) => void;
}) {
  const isLibraryWide = intent.selectionMode === 'library'
  const isEnded = intent.status === 'ended'
  const viewerResponseChoice = intent.viewerResponseChoice
  const timingSummary = formatPlayIntentTimingSummary(intent.availabilityWindow.startsAt, intent.availabilityWindow.endsAt)
  const actionButtonSx = {
    flexShrink: 0,
    width: { xs: '100%', sm: 'auto' },
    alignSelf: { xs: 'stretch', sm: 'flex-start' },
    borderRadius: 'md',
    minHeight: { xs: 44, sm: '2.25rem' },
    px: { xs: 2, sm: 1.5 },
    fontSize: { xs: 'sm', sm: 'sm' },
    fontWeight: 'md',
    lineHeight: 1,
    backgroundColor: 'primary.500',
    color: 'primary.50',
    boxShadow: 'none',
    transition: 'background-color 180ms ease, border-color 180ms ease, color 180ms ease, transform 120ms ease',
    '&:hover': {
      backgroundColor: 'primary.400',
      borderColor: 'primary.400',
      transform: 'translateY(-1px)'
    },
    '&:active': {
      backgroundColor: 'primary.600',
      transform: 'translateY(0)'
    }
  } as const

  return (
    <Card
      variant="soft"
      sx={{
        px: 3,
        py: 2.25,
        ...topLevelCardSx
      }}
    >
      <Stack spacing={1.25} sx={{ mb: 1 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.25}
          justifyContent="space-between"
          alignItems={{ xs: 'stretch', sm: 'center' }}
        >
          <Stack direction="row" spacing={1.25} alignItems="center">
          <Avatar src={intent.user.avatarUrl ?? undefined} alt={intent.user.displayName} size="lg" variant="soft" />
          <Box sx={{ minWidth: 0 }}>
            <Typography level="title-lg">{intent.title}</Typography>
            <Typography level="body-sm" sx={{ color: 'neutral.200', mt: 0.25 }}>
              by {intent.user.displayName}
            </Typography>
            <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
              {timingSummary}
            </Typography>
          </Box>
        </Stack>
          <Button
            variant="solid"
            color="primary"
            size="sm"
            onClick={() => onOpenDetails(intent.id)}
            sx={actionButtonSx}
          >
            View Details
          </Button>
        </Stack>

        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }} alignItems="center">
          {isEnded ? (
            <Chip size="sm" color="warning" variant="soft">
              Ended
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
              Not for you right now
            </Chip>
          ) : null}
          {intent.interestedCount > 0 ? (
            <Chip size="sm" color="success" variant="soft">
              <InterestedCountLabel count={intent.interestedCount} />
            </Chip>
          ) : null}
        </Stack>
      </Stack>

      {!intent.appliesToViewer ? (
        <Typography level="body-xs" sx={{ mb: 1.5, color: 'neutral.400' }}>
          This call is visible in your network, but it does not currently include you.
        </Typography>
      ) : null}

      {viewerResponseChoice ? (
        <Typography level="body-xs" sx={{ mb: 1.5, color: viewerResponseChoice === 'interested' ? 'success.300' : 'neutral.400' }}>
          {viewerResponseChoice === 'interested' ? 'You are marked as interested in this call to play.' : 'You are marked as passed on this call to play.'}
        </Typography>
      ) : null}

      {!intent.discordSpace && intent.voiceChannelName ? (
        <Typography level="body-sm" sx={{ mb: 1.5, color: 'neutral.300' }}>
          Voice channel: {intent.voiceChannelName}
        </Typography>
      ) : null}

      {intent.notifyScope === 'specific-discord-server' && intent.targetServers.length > 0 ? (
        <Typography level="body-sm" sx={{ mb: 1.5, color: 'neutral.300' }}>
          Target Discord servers: {intent.targetServers.map((server) => server.name).join(', ')}
        </Typography>
      ) : null}
    </Card>
  )
}