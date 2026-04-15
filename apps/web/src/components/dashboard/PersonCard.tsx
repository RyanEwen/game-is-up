import { Box, Button, Card, Chip, Sheet, Stack, Typography } from '@mui/joy'
import type { DiscoveryPerson } from '@game-is-up/shared'
import { DashboardDeferredImage } from './DashboardDeferredImage'
import { FriendActionPopover } from './FriendActionPopover'
import { GameActionPopover } from './GameActionPopover'
import { formatDiscordActivityTypeLabel, formatLibraryIntentLabel, memberGameGridSx } from './dashboardUtils'
import type { DashboardLibraryQuickAddGame, FriendTarget } from './types'

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

export function PersonCard({
  person,
  canManage,
  canAddToLibrary,
  libraryGameIds,
  addingLibraryGameId,
  isPending,
  onToggleFriend,
  onAddToLibrary,
  isMuted = false,
  isMutePending = false,
  onMute,
  onUnmute
}: {
  person: DiscoveryPerson;
  canManage: boolean;
  canAddToLibrary: boolean;
  libraryGameIds: ReadonlySet<string>;
  libraryEntryIdsByGameId: ReadonlyMap<string, string>;
  addingLibraryGameId: string | null;
  removingLibraryEntryId: string | null;
  isPending: boolean;
  onToggleFriend: (target: FriendTarget) => Promise<void>;
  onAddToLibrary: (game: DashboardLibraryQuickAddGame) => Promise<void>;
  onRemoveLibraryEntry: (entryId: string) => Promise<void>;
  isMuted?: boolean;
  isMutePending?: boolean;
  onMute?: (userId: string) => Promise<void>;
  onUnmute?: (userId: string) => Promise<void>;
}) {
  return (
    <Card
      variant="outlined"
      sx={{
        p: 3,
        backdropFilter: 'blur(16px)',
        backgroundColor: 'rgba(17, 24, 38, 0.74)',
        borderColor: 'rgba(255, 255, 255, 0.08)',
        boxShadow: 'lg',
        contentVisibility: 'auto',
        containIntrinsicSize: '780px'
      }}
    >
      <Stack
        direction="row"
        spacing={1.25}
        justifyContent="space-between"
        alignItems="flex-start"
        sx={{ mb: 1, containerType: 'inline-size', flexWrap: 'wrap' }}
      >
        <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0, flexWrap: 'wrap', flex: 1 }}>
          <FriendActionPopover
            target={person}
            handle={person.handle}
            canManage={canManage}
            isPending={isPending}
            supportingText={person.lastActiveLabel}
            detailLines={[
              person.contactHint,
              person.mutualServers.length > 0 ? `Mutual servers: ${person.mutualServers.join(', ')}` : 'Visible to you through your friends list or network.',
              `Shared games visible: ${person.games.length}`,
              `Timezone: ${person.timezoneLabel}`,
              person.usualAvailability ? `Usually plays: ${person.usualAvailability}` : ''
            ]}
            large
            isMuted={isMuted}
            isMutePending={isMutePending}
            onToggleFriend={onToggleFriend}
            onMute={onMute}
            onUnmute={onUnmute}
          />
        </Stack>

        <Button
          size="sm"
          variant="soft"
          color={person.friendEligible ? 'success' : 'neutral'}
          disabled={!canManage || isPending}
          onClick={() => void onToggleFriend(person)}
          sx={{
            alignSelf: 'flex-start',
            flexShrink: 0,
            borderRadius: 'xl',
            whiteSpace: 'nowrap',
            minHeight: '1.75rem',
            minWidth: { xs: '1.75rem', sm: 'auto' },
            px: { xs: 0.625, sm: 1.25 },
            fontSize: 'xs',
            fontWeight: 'md',
            lineHeight: 1
          }}
        >
          {!canManage ? (
            <>
              <Box component="span" sx={compactActionLabelSx}>Sign in to manage</Box>
              <Box component="span" sx={compactActionSymbolSx}>?</Box>
            </>
          ) : isPending ? (
            <>
              <Box component="span" sx={compactActionLabelSx}>Saving...</Box>
              <Box component="span" sx={compactActionSymbolSx}>...</Box>
            </>
          ) : person.friendEligible ? (
            <>
              <Box component="span" sx={compactActionLabelSx}>Add friend</Box>
              <Box component="span" sx={compactActionSymbolSx}>Add</Box>
            </>
          ) : (
            <>
              <Box component="span" sx={compactActionLabelSx}>Remove friend</Box>
              <Box component="span" sx={compactActionSymbolSx}>Remove</Box>
            </>
          )}
        </Button>
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }}>
        {person.mutualServers.map((serverName) => (
          <Chip key={serverName} size="sm" color="warning" variant="soft">
            {serverName}
          </Chip>
        ))}
        <Chip variant="outlined" color="warning">
          {person.timezoneLabel}
        </Chip>
        {person.usualAvailability ? (
          <Chip variant="soft" color="success">
            Usually: {person.usualAvailability}
          </Chip>
        ) : null}
        <Chip variant="soft" color="neutral">
          {person.lastActiveLabel}
        </Chip>
      </Stack>

      {person.discordActivity ? (
        <Sheet
          variant="soft"
          sx={{
            mb: 2,
            p: 1.5,
            borderRadius: 'md'
          }}
        >
          <Typography level="title-sm">
            {formatDiscordActivityTypeLabel(person.discordActivity.activityType)} {person.discordActivity.title}
          </Typography>
          <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
            Last seen {new Date(person.discordActivity.lastObservedAt).toLocaleString()}
            {person.discordActivity.sourceServerName ? ` via ${person.discordActivity.sourceServerName}` : ''}
          </Typography>
          {person.discordActivity.details || person.discordActivity.state ? (
            <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
              {[person.discordActivity.details, person.discordActivity.state].filter(Boolean).join(' • ')}
            </Typography>
          ) : null}
        </Sheet>
      ) : null}

      <Box>
        {person.games.length > 0 ? (
          <Box sx={memberGameGridSx}>
            {person.games.map((game) => {
              const isInLibrary = libraryGameIds.has(game.id)

              return (
                <Sheet
                  key={game.id}
                  variant="soft"
                  sx={{
                    p: 1.5,
                    borderRadius: 'md',
                    height: '100%'
                  }}
                >
                  <Stack spacing={1.25} sx={{ height: '100%' }}>
                    <Stack direction="row" spacing={1.25} alignItems="flex-start">
                      <Box
                        sx={{
                          width: 52,
                          height: 68,
                          borderRadius: 'sm',
                          overflow: 'hidden',
                          backgroundColor: 'rgba(255,255,255,0.06)',
                          flexShrink: 0
                        }}
                      >
                        {game.coverUrl ? (
                          <DashboardDeferredImage src={game.coverUrl} alt={game.title} rootMargin="240px 0px" />
                        ) : null}
                      </Box>
                      <Stack spacing={0.75} sx={{ minWidth: 0, flex: 1 }}>
                        <Stack direction="row" spacing={1} sx={{ minWidth: 0, width: '100%', containerType: 'inline-size' }} alignItems="flex-start">
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <GameActionPopover
                              game={{
                                gameId: game.id,
                                title: game.title,
                                coverUrl: game.coverUrl,
                                platformLabels: game.platformLabels
                              }}
                              canAddToLibrary={canAddToLibrary}
                              isInLibrary={isInLibrary}
                              isAddingToLibrary={addingLibraryGameId === game.id}
                              supportingText={formatLibraryIntentLabel(game.intent)}
                              detailLines={[
                                game.availability && game.availabilitySource === 'game-specific' ? `Availability: ${game.availability}` : 'No game-specific availability shared.',
                                `Platforms: ${game.platformLabels.join(', ')}`
                              ]}
                              onAddToLibrary={onAddToLibrary}
                            />
                          </Box>
                          {!isInLibrary ? (
                            <Button
                              size="sm"
                              variant="soft"
                              color="success"
                              disabled={!canAddToLibrary || addingLibraryGameId === game.id}
                              onClick={() => void onAddToLibrary({
                                gameId: game.id,
                                title: game.title,
                                coverUrl: game.coverUrl,
                                platformLabels: game.platformLabels
                              })}
                              sx={{
                                ml: 'auto',
                                flexShrink: 0,
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
                              ) : addingLibraryGameId === game.id ? (
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
                        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', width: '100%' }} alignItems="center">
                          <Chip color={game.intent === 'playing-now' ? 'success' : 'primary'} size="sm" sx={{ flexShrink: 0 }}>
                            {formatLibraryIntentLabel(game.intent)}
                          </Chip>
                          {game.platformLabels.map((platform) => (
                            <Chip key={platform} size="sm" variant="outlined" color="neutral">
                              {platform}
                            </Chip>
                          ))}
                        </Stack>
                        {game.availability && game.availabilitySource === 'game-specific' ? (
                          <Chip size="sm" variant="soft" color="neutral" sx={{ alignSelf: 'flex-start' }}>
                            Plays: {game.availability}
                          </Chip>
                        ) : null}
                      </Stack>
                    </Stack>
                  </Stack>
                </Sheet>
              )
            })}
          </Box>
        ) : (
          <Sheet
            variant="soft"
            sx={{
              p: 1.5,
              borderRadius: 'md'
            }}
          >
            <Typography level="title-sm">No games shared yet</Typography>
            <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
              Game's Up found this person through your friends list or network, but they have not added any games yet. You can still add them as a friend now.
            </Typography>
          </Sheet>
        )}
      </Box>
    </Card>
  )
}