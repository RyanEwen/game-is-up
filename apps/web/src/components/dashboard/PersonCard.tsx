import { Box, Card, Chip, Divider, Sheet, Stack, Typography } from '@mui/joy'
import type { DiscoveryPerson } from '@game-is-up/shared'
import { AvailabilityChip } from './AvailabilityChip'
import { FriendActionPopover } from './FriendActionPopover'
import { GameActionPopover } from './GameActionPopover'
import { formatDiscordActivityTypeLabel, formatLibraryIntentLabel, memberGameGridSx } from './dashboardUtils'
import type { DashboardLibraryQuickAddGame, FriendTarget } from './types'

export function PersonCard({
  person,
  canManage,
  canAddToLibrary,
  libraryGameIds,
  addingLibraryGameId,
  isPending,
  onToggleFriend,
  onAddToLibrary
}: {
  person: DiscoveryPerson;
  canManage: boolean;
  canAddToLibrary: boolean;
  libraryGameIds: ReadonlySet<string>;
  addingLibraryGameId: string | null;
  isPending: boolean;
  onToggleFriend: (target: FriendTarget) => Promise<void>;
  onAddToLibrary: (game: DashboardLibraryQuickAddGame) => Promise<void>;
}) {
  return (
    <Card
      variant="outlined"
      sx={{
        p: 3,
        backdropFilter: 'blur(16px)',
        backgroundColor: 'rgba(17, 24, 38, 0.74)',
        borderColor: 'rgba(255, 255, 255, 0.08)',
        boxShadow: 'lg'
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5, flexWrap: 'wrap' }}>
        <FriendActionPopover
          target={person}
          handle={person.handle}
          canManage={canManage}
          isPending={isPending}
          supportingText={person.lastActiveLabel}
          detailLines={[
            person.contactHint,
            person.mutualServers.length > 0 ? `Mutual servers: ${person.mutualServers.join(', ')}` : 'Visible to you through selected servers or friends.',
            `Shared games visible: ${person.games.length}`,
            `Timezone: ${person.timezoneLabel}`,
            person.usualAvailability ? `Usually plays: ${person.usualAvailability}` : ''
          ]}
          large
          onToggleFriend={onToggleFriend}
        />
        <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
          {person.lastActiveLabel}
        </Typography>
      </Stack>

      <Typography level="body-md" sx={{ mb: 2, color: 'neutral.200' }}>
        {person.bio}
      </Typography>

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

      <Box sx={{ mb: 2 }}>
        {person.games.length > 0 ? (
          <Box sx={memberGameGridSx}>
            {person.games.map((game) => (
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
                        <Box component="img" src={game.coverUrl} alt={game.title} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : null}
                    </Box>
                    <Stack direction="row" spacing={1} sx={{ minWidth: 0, flex: 1, justifyContent: 'space-between' }}>
                      <Stack spacing={0.5} sx={{ minWidth: 0, flex: 1 }}>
                        <GameActionPopover
                          game={{
                            gameId: game.id,
                            title: game.title,
                            coverUrl: game.coverUrl,
                            platformLabels: game.platformLabels
                          }}
                          canAddToLibrary={canAddToLibrary}
                          isInLibrary={libraryGameIds.has(game.id)}
                          isAddingToLibrary={addingLibraryGameId === game.id}
                          supportingText={formatLibraryIntentLabel(game.intent)}
                          detailLines={[
                            game.availability && game.availabilitySource === 'game-specific' ? `Availability: ${game.availability}` : 'No game-specific availability shared.',
                            `Platforms: ${game.platformLabels.join(', ')}`
                          ]}
                          onAddToLibrary={onAddToLibrary}
                        />
                        <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                          {game.platformLabels.join(', ')}
                        </Typography>
                      </Stack>
                      <Chip color={game.intent === 'playing-now' ? 'success' : 'primary'} size="sm" sx={{ alignSelf: 'flex-start', flexShrink: 0 }}>
                        {formatLibraryIntentLabel(game.intent)}
                      </Chip>
                    </Stack>
                  </Stack>

                  {game.availability && game.availabilitySource === 'game-specific' ? (
                    <Stack direction="row" spacing={1} sx={{ mt: 'auto', flexWrap: 'wrap' }} alignItems="center">
                      <AvailabilityChip
                        availability={game.availability}
                        availabilitySource={game.availabilitySource}
                        showInherited={false}
                        compactGameSpecificLabel
                      />
                    </Stack>
                  ) : null}
                </Stack>
              </Sheet>
            ))}
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
              Game Is Up found this person through one of your selected servers or your friends list, but they have not added any games yet. You can still add them as a friend now.
            </Typography>
          </Sheet>
        )}
      </Box>

      <Divider sx={{ my: 2 }} />

      <Stack spacing={0.5}>
        <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
          {person.contactHint}
        </Typography>
        <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
          Open the name above for friend actions and future person-level actions.
        </Typography>
      </Stack>
    </Card>
  )
}