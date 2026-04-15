import { Avatar, Box, Button, Card, Chip, Sheet, Stack, Typography } from '@mui/joy'
import type { PlayIntentPreview, PlayIntentRecipientResponseChoice } from '@game-is-up/shared'
import { DashboardDeferredImage } from './DashboardDeferredImage'
import { formatNotifyScopeLabel } from './dashboardUtils'
import type { DashboardLibraryQuickAddGame } from './types'

const selectedGameGridSx = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
  gap: 1.25
} as const

const compactActionLabelSx = {
  display: 'inline',
  '@container (max-width: 280px)': {
    display: 'none'
  }
} as const

const compactActionSymbolSx = {
  display: 'none',
  '@container (max-width: 280px)': {
    display: 'inline'
  }
} as const

function getGameMonogram(title: string) {
  return title
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export function PlayIntentCard({
  intent,
  canAddToLibrary,
  libraryGameIds,
  addingLibraryGameId,
  onAddToLibrary,
  responsePending,
  onRespondToIntent,
  isMuted,
  onMuteCreator,
  onUnmuteCreator
}: {
  intent: PlayIntentPreview;
  canAddToLibrary: boolean;
  libraryGameIds: ReadonlySet<string>;
  addingLibraryGameId: string | null;
  onAddToLibrary: (game: DashboardLibraryQuickAddGame) => Promise<void>;
  responsePending: boolean;
  onRespondToIntent: (playIntentId: string, responseChoice: PlayIntentRecipientResponseChoice) => Promise<void>;
  isMuted: boolean;
  onMuteCreator: (userId: string) => Promise<void>;
  onUnmuteCreator: (userId: string) => Promise<void>;
}) {
  const isLibraryWide = intent.selectionMode === 'library'
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
          <Chip size="sm" color="primary" variant="soft">
            {isLibraryWide ? 'Any game in library' : 'Selected games'}
          </Chip>
          <Chip size="sm" color="neutral" variant="outlined">
            {formatNotifyScopeLabel(intent.notifyScope)}
          </Chip>
          {intent.joinCount > 0 ? (
            <Chip size="sm" color="success" variant="soft">
              {intent.joinCount} {intent.joinCount === 1 ? 'person interested' : 'people interested'}
            </Chip>
          ) : null}
          <Button
            variant={viewerResponseChoice === 'join' ? 'solid' : 'outlined'}
            color={viewerResponseChoice === 'join' ? 'primary' : 'neutral'}
            size="sm"
            disabled={!canAddToLibrary || responsePending}
            onClick={() => void onRespondToIntent(intent.id, 'join')}
            sx={actionButtonSx}
          >
            I'm interested
          </Button>
          <Button
            variant={viewerResponseChoice === 'decline' ? 'soft' : 'outlined'}
            color="neutral"
            size="sm"
            disabled={!canAddToLibrary || responsePending}
            onClick={() => void onRespondToIntent(intent.id, 'decline')}
            sx={actionButtonSx}
          >
            Pass
          </Button>
          <Button
            variant={isMuted ? 'soft' : 'outlined'}
            color="neutral"
            size="sm"
            onClick={() => void (isMuted ? onUnmuteCreator(intent.user.id) : onMuteCreator(intent.user.id))}
            sx={actionButtonSx}
          >
            {isMuted ? 'Unmute creator' : 'Mute creator'}
          </Button>
        </Stack>
      </Stack>

      {viewerResponseChoice ? (
        <Typography level="body-xs" sx={{ mb: 1.5, color: viewerResponseChoice === 'join' ? 'success.300' : 'neutral.400' }}>
          {viewerResponseChoice === 'join' ? 'You are marked as joining this call to play.' : 'You are marked as passed on this call to play.'}
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

      {intent.notifyScope === 'specific-discord-server' && intent.targetServer ? (
        <Typography level="body-sm" sx={{ mb: 1.5, color: 'neutral.300' }}>
          Target Discord server: {intent.targetServer.name}
        </Typography>
      ) : null}

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
        <Box sx={selectedGameGridSx}>
          {intent.games.map((game) => {
            const libraryQuickAddGame: DashboardLibraryQuickAddGame = {
              gameId: game.id,
              title: game.title,
              coverUrl: game.coverUrl ?? null,
              platformLabels: [game.platform]
            }
            const isInLibrary = libraryGameIds.has(game.id)
            const isAddingToLibrary = addingLibraryGameId === game.id

            return (
              <Sheet
                key={game.id}
                variant="soft"
                sx={{
                  p: 1.5,
                  borderRadius: 'lg',
                  border: '1px solid rgba(141, 255, 216, 0.12)',
                  background: 'linear-gradient(180deg, rgba(13, 70, 58, 0.28), rgba(14, 21, 34, 0.88))',
                  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
                  height: '100%'
                }}
              >
                <Stack spacing={1.5} sx={{ height: '100%', containerType: 'inline-size' }}>
                  <Stack direction="row" spacing={1.25} alignItems="flex-start">
                    <Box
                      sx={{
                        width: 58,
                        height: 74,
                        borderRadius: 'md',
                        flexShrink: 0,
                        overflow: 'hidden',
                        background: 'linear-gradient(160deg, rgba(28, 171, 132, 0.8), rgba(17, 24, 38, 0.96) 72%)',
                        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.18)'
                      }}
                    >
                      {game.coverUrl ? (
                        <DashboardDeferredImage src={game.coverUrl} alt={game.title} rootMargin="220px 0px" />
                      ) : (
                        <Box
                          sx={{
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'flex-end',
                            justifyContent: 'flex-start',
                            p: 1
                          }}
                        >
                          <Typography
                            level="h3"
                            sx={{
                              color: 'common.white',
                              lineHeight: 0.9,
                              letterSpacing: '0.06em',
                              textShadow: '0 6px 18px rgba(0, 0, 0, 0.35)'
                            }}
                          >
                            {getGameMonogram(game.title)}
                          </Typography>
                        </Box>
                      )}
                    </Box>

                    <Stack spacing={1} sx={{ minWidth: 0, flex: 1 }}>
                      <Typography
                        level="title-sm"
                        sx={{
                          display: '-webkit-box',
                          overflow: 'hidden',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          color: 'neutral.50'
                        }}
                      >
                        {game.title}
                      </Typography>

                      <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap' }}>
                        <Chip size="sm" variant="soft" color="primary">
                          {game.platform}
                        </Chip>
                        <Chip size="sm" variant={isInLibrary ? 'soft' : 'outlined'} color={isInLibrary ? 'success' : 'neutral'}>
                          {isInLibrary ? 'In your library' : 'Quick add'}
                        </Chip>
                      </Stack>

                      <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                        Included in this call to play.
                      </Typography>
                    </Stack>
                  </Stack>

                  {!isInLibrary ? (
                    <Button
                      size="sm"
                      variant="soft"
                      color="success"
                      disabled={!canAddToLibrary || isAddingToLibrary}
                      onClick={() => void onAddToLibrary(libraryQuickAddGame)}
                      sx={{
                        mt: 'auto',
                        ml: 'auto',
                        flexShrink: 0,
                        alignSelf: 'flex-end',
                        borderRadius: 'xl',
                        minHeight: '1.75rem',
                        minWidth: { xs: '1.75rem', sm: 'auto' },
                        px: { xs: 0.625, sm: 1.25 },
                        whiteSpace: 'nowrap',
                        fontSize: 'xs',
                        fontWeight: 'md',
                        lineHeight: 1
                      }}
                    >
                      {!canAddToLibrary ? (
                        <>
                          <Box component="span" sx={compactActionLabelSx}>Sign in to add</Box>
                          <Box component="span" sx={compactActionSymbolSx}>?</Box>
                        </>
                      ) : isAddingToLibrary ? (
                        <>
                          <Box component="span" sx={compactActionLabelSx}>Adding...</Box>
                          <Box component="span" sx={compactActionSymbolSx}>...</Box>
                        </>
                      ) : (
                        <>
                          <Box component="span" sx={compactActionLabelSx}>Add to library</Box>
                          <Box component="span" sx={compactActionSymbolSx}>Add</Box>
                        </>
                      )}
                    </Button>
                  ) : null}
                </Stack>
              </Sheet>
            )
          })}
        </Box>
      )}
    </Card>
  )
}