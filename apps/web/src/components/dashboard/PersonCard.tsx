import { Box, Button, Card, Chip, Sheet, Stack, Typography } from '@mui/joy'
import type { DiscoveryPerson } from '@game-is-up/shared'
import { DashboardDeferredImage } from './DashboardDeferredImage'
import { FriendActionPopover } from './FriendActionPopover'
import { GameActionPopover } from './GameActionPopover'
import {
  formatDiscordActivityTypeLabel,
  formatLibraryIntentLabel,
  formatRelativeTimeShort,
  memberGameGridSx,
  nestedInsetMediaSx,
  nestedInsetSurfaceSx,
  topLevelCardSx
} from './dashboardUtils'
import type { DashboardLibraryQuickAddGame, FriendTarget } from './types'
import { useDashboardContext } from '../../contexts/useDashboardContext'

type CompactCardBadge = {
  label: string;
  color?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger';
  variant?: 'soft' | 'outlined' | 'solid' | 'plain';
}

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

export function CompactPersonGameCard({
  game,
  canAddToLibrary,
  isInLibrary,
  isAddingToLibrary,
  supportingText,
  detailLines = [],
  badges,
  footerBadge,
  onAddToLibrary
}: {
  game: DashboardLibraryQuickAddGame;
  canAddToLibrary: boolean;
  isInLibrary: boolean;
  isAddingToLibrary: boolean;
  supportingText?: string;
  detailLines?: string[];
  badges: CompactCardBadge[];
  footerBadge?: CompactCardBadge | null;
  onAddToLibrary: (game: DashboardLibraryQuickAddGame) => Promise<void>;
}) {
  const { gameDetailsViewProps } = useDashboardContext()

  return (
    <Sheet
      variant="soft"
      sx={{
        p: 1.5,
        borderRadius: 'md',
        height: '100%',
        ...nestedInsetSurfaceSx
      }}
    >
      <Stack spacing={1.25} sx={{ height: '100%' }}>
        <Stack direction="row" spacing={1.25} alignItems="flex-start">
          <Box
            component="button"
            type="button"
            onClick={() => gameDetailsViewProps.openGameDetails({
              source: 'local',
              sourceId: game.gameId,
              title: game.title,
              coverUrl: game.coverUrl,
              platformLabels: game.platformLabels
            })}
            sx={{
              width: 52,
              height: 68,
              borderRadius: 'sm',
              overflow: 'hidden',
              ...nestedInsetMediaSx,
              flexShrink: 0,
              border: 'none',
              padding: 0,
              cursor: 'pointer'
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
                  game={game}
                  canAddToLibrary={canAddToLibrary}
                  isInLibrary={isInLibrary}
                  isAddingToLibrary={isAddingToLibrary}
                  supportingText={supportingText}
                  detailLines={detailLines}
                  onAddToLibrary={onAddToLibrary}
                />
              </Box>
              {!isInLibrary ? (
                <Button
                  size="sm"
                  variant="soft"
                  color="success"
                  disabled={!canAddToLibrary || isAddingToLibrary}
                  onClick={() => void onAddToLibrary(game)}
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
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', width: '100%' }} alignItems="center">
              {badges.map((badge) => (
                <Chip
                  key={`${badge.label}-${badge.color ?? 'neutral'}-${badge.variant ?? 'soft'}`}
                  color={badge.color ?? 'neutral'}
                  variant={badge.variant ?? 'soft'}
                  size="sm"
                  sx={{ flexShrink: 0 }}
                >
                  {badge.label}
                </Chip>
              ))}
            </Stack>
            {footerBadge ? (
              <Chip size="sm" variant={footerBadge.variant ?? 'soft'} color={footerBadge.color ?? 'neutral'} sx={{ alignSelf: 'flex-start' }}>
                {footerBadge.label}
              </Chip>
            ) : null}
          </Stack>
        </Stack>
      </Stack>
    </Sheet>
  )
}

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
      variant="soft"
      sx={{
        p: 3,
        ...topLevelCardSx
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
              `Matching games: ${person.games.length}`,
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

      <Box
        sx={{
          mb: 2,
          display: 'grid',
          gridTemplateColumns: person.mutualServers.length > 0 ? { xs: '1fr', md: 'minmax(0, 1fr) auto' } : '1fr',
          gap: 1,
          alignItems: 'start'
        }}
      >
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, minWidth: 0 }}>
          <Chip variant="outlined" color="neutral">
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
        </Box>
        {person.mutualServers.length > 0 ? (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: { xs: 'flex-start', md: 'flex-end' } }}>
            {person.mutualServers.map((serverName) => (
              <Chip key={serverName} size="sm" color="primary" variant="soft">
                {serverName}
              </Chip>
            ))}
          </Box>
        ) : null}
      </Box>

      {person.discordActivity ? (
        <Sheet
          variant="soft"
          sx={{
            mb: 2,
            p: 1.5,
            borderRadius: 'md',
            ...nestedInsetSurfaceSx
          }}
        >
          <Typography level="title-sm">
            {formatDiscordActivityTypeLabel(person.discordActivity.activityType, person.discordActivity.isActive)} {person.discordActivity.title}
          </Typography>
          <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
            Seen {formatRelativeTimeShort(person.discordActivity.lastObservedAt)}
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
                <CompactPersonGameCard
                  key={game.id}
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
                  badges={[
                    { label: formatLibraryIntentLabel(game.intent), color: game.intent === 'playing-now' ? 'success' : 'primary' },
                    ...game.platformLabels.map((platform) => ({ label: platform, variant: 'outlined' as const }))
                  ]}
                  footerBadge={game.availability && game.availabilitySource === 'game-specific'
                    ? { label: `Plays: ${game.availability}` }
                    : null}
                  onAddToLibrary={onAddToLibrary}
                />
              )
            })}
          </Box>
        ) : (
          <Sheet
            variant="soft"
            sx={{
              p: 1.5,
              borderRadius: 'md',
              ...nestedInsetSurfaceSx
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