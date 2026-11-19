import { Box, Option, Select, Stack, Typography } from '@mui/joy'
import { useEffect, useState } from 'react'
import type {
  DiscordServerPreference,
  DiscoveryGame,
  DiscoveryPerson,
  LibraryTrendingGame,
} from '@game-is-up/shared'
import { DashboardApiIssueCard } from '../components/dashboard/DashboardApiIssueCard'
import { DiscordServerPicker } from '../components/dashboard/DiscordServerPicker'
import { DashboardModal } from '../components/dashboard/DashboardModal'
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded'
import SportsEsportsRoundedIcon from '@mui/icons-material/SportsEsportsRounded'
import { EmptyState } from '../components/EmptyState'
import { SignedOutEmptyState } from '../components/dashboard/SignedOutEmptyState'
import { GameCard, GameCardSkeleton } from '../components/dashboard/GameCard'
import { LibraryEditorCard } from '../components/dashboard/LibraryEditorCard'
import { LibraryTrendingRow } from '../components/dashboard/LibraryTrendingRow'
import { PersonCard } from '../components/dashboard/PersonCard'
import { SectionNav } from '../components/dashboard/SectionNav'
import { sectionScrollMarginTop } from '../components/dashboard/SectionNav.constants'
import {
  buildHeaderFilterSelectSx,
  discoveryGameGridSx,
  headerFilterControlSx,
} from '../components/dashboard/dashboardUtils'
import { useDashboardContext } from '../contexts/useDashboardContext'
import type {
  DashboardLibraryQuickAddGame,
  FriendTarget,
} from '../components/dashboard/types'

const showsDemoDiscoveryCopy = import.meta.env.DEV

type SectionId = 'matching-games' | 'other-games' | 'network-members'

function DiscoverySection({
  isFirst = false,
  sectionId,
  title,
  description,
  children,
  helperText,
  sortControl,
}: {
  isFirst?: boolean
  sectionId: SectionId
  title: string
  description: string
  helperText?: string
  children: React.ReactNode
  sortControl?: React.ReactNode
}) {
  return (
    <Stack
      id={sectionId}
      spacing={2}
      sx={{ mt: isFirst ? 0 : 3, scrollMarginTop: sectionScrollMarginTop }}
    >
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', sm: 'center' }}
      >
        <Box>
          <Typography level="h2">{title}</Typography>
          <Typography level="body-md" sx={{ color: 'neutral.300', mt: 0.5 }}>
            {description}
          </Typography>
        </Box>
        {sortControl}
      </Stack>
      {helperText ? (
        <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
          {helperText}
        </Typography>
      ) : null}
      {children}
    </Stack>
  )
}

type GameSort = 'name' | 'players'
type MemberSort = 'name' | 'games'

function sortGames(games: DiscoveryGame[], sort: GameSort): DiscoveryGame[] {
  return [...games].sort((a, b) => {
    if (sort === 'players') return b.playerCount - a.playerCount
    return a.title.localeCompare(b.title)
  })
}

function sortPeople(
  people: DiscoveryPerson[],
  sort: MemberSort,
): DiscoveryPerson[] {
  return [...people].sort((a, b) => {
    if (sort === 'games') return b.games.length - a.games.length
    return a.displayName.localeCompare(b.displayName)
  })
}

function DiscoveryViewContent({
  error,
  discoveryLoading,
  overlapGames,
  browseGames,
  trendingGames,
  discoveryPeople,
  selectedDiscoveryServers,
  noDiscoveryServersSelected,
  isSignedIn,
  libraryGameIds,
  libraryEntryIdsByGameId,
  addingLibraryGameId,
  removingLibraryEntryId,
  friendPendingId,
  onToggleFriend,
  onAddGameToLibrary,
  onRemoveLibraryEntry,
  mutedPlayIntentUserIds,
  onMutePlayIntentUser,
  onUnmutePlayIntentUser,
}: {
  error: string | null
  discoveryLoading: boolean
  overlapGames: DiscoveryGame[]
  browseGames: DiscoveryGame[]
  trendingGames: LibraryTrendingGame[]
  discoveryPeople: DiscoveryPerson[]
  selectedDiscoveryServers: DiscordServerPreference[]
  noDiscoveryServersSelected: boolean
  isSignedIn: boolean
  libraryGameIds: ReadonlySet<string>
  libraryEntryIdsByGameId: ReadonlyMap<string, string>
  addingLibraryGameId: string | null
  removingLibraryEntryId: string | null
  friendPendingId: string | null
  onToggleFriend: (target: FriendTarget) => Promise<void>
  onAddGameToLibrary: (game: DashboardLibraryQuickAddGame) => Promise<void>
  onRemoveLibraryEntry: (entryId: string) => Promise<void>
  mutedPlayIntentUserIds: ReadonlySet<string>
  onMutePlayIntentUser: (userId: string) => Promise<void>
  onUnmutePlayIntentUser: (userId: string) => Promise<void>
}) {
  const networkPeople = discoveryPeople.filter((person) => !person.isFriend)
  const [gameSort, setGameSort] = useState<GameSort>('players')
  const [memberSort, setMemberSort] = useState<MemberSort>('games')
  const [memberServerFilterId, setMemberServerFilterId] = useState('')

  useEffect(() => {
    if (!memberServerFilterId) {
      return
    }

    if (
      !selectedDiscoveryServers.some(
        (server) => server.id === memberServerFilterId,
      )
    ) {
      setMemberServerFilterId('')
    }
  }, [memberServerFilterId, selectedDiscoveryServers])

  if (error) {
    return <DashboardApiIssueCard error={error} />
  }

  if (!isSignedIn) {
    return (
      <SignedOutEmptyState
        title="Sign in to discover your network"
        description="Discovery becomes personalized after Discord sign-in. Once you are signed in, you can compare your library with friends and other people in your network."
      />
    )
  }

  const sortedOverlapGames = sortGames(overlapGames, gameSort)
  const sortedBrowseGames = sortGames(browseGames, gameSort)
  const filteredNetworkPeople = memberServerFilterId
    ? networkPeople.filter((person) =>
        person.mutualServerIds.includes(memberServerFilterId),
      )
    : networkPeople
  const activeMemberServerFilter =
    selectedDiscoveryServers.find(
      (server) => server.id === memberServerFilterId,
    ) ?? null
  const sortedNetworkPeople = sortPeople(filteredNetworkPeople, memberSort)

  const gameSortControl = (
    <Box sx={headerFilterControlSx}>
      <Typography
        level="body-sm"
        sx={{ color: 'neutral.400', whiteSpace: 'nowrap' }}
      >
        Sort by
      </Typography>
      <Select
        size="sm"
        value={gameSort}
        onChange={(_e, val) => {
          if (val) setGameSort(val)
        }}
        sx={buildHeaderFilterSelectSx(140)}
      >
        <Option value="players">Number of players</Option>
        <Option value="name">Name</Option>
      </Select>
    </Box>
  )

  const memberSortControl = (
    <Box sx={headerFilterControlSx}>
      <Typography
        level="body-sm"
        sx={{ color: 'neutral.400', whiteSpace: 'nowrap' }}
      >
        Sort by
      </Typography>
      <Select
        size="sm"
        value={memberSort}
        onChange={(_e, val) => {
          if (val) setMemberSort(val)
        }}
        sx={buildHeaderFilterSelectSx(140)}
      >
        <Option value="games">Number of games</Option>
        <Option value="name">Name</Option>
      </Select>
    </Box>
  )

  const memberFilterControl =
    selectedDiscoveryServers.length > 1 ? (
      <Box sx={headerFilterControlSx}>
        <Typography
          level="body-sm"
          sx={{ color: 'neutral.400', whiteSpace: 'nowrap' }}
        >
          Filter
        </Typography>
        <Box
          sx={{
            flex: { xs: '1 1 0', sm: '0 0 auto' },
            minWidth: { xs: 0, sm: 240 },
            maxWidth: '100%',
          }}
        >
          <DiscordServerPicker
            options={selectedDiscoveryServers}
            value={memberServerFilterId}
            placeholder="Entire network"
            onChange={setMemberServerFilterId}
            emptyOptionLabel="Entire network"
            getOptionDescription={(option) =>
              option.knownUserCount > 0
                ? `${option.knownUserCount} network member${option.knownUserCount === 1 ? '' : 's'} visible`
                : 'No network members visible yet'
            }
          />
        </Box>
      </Box>
    ) : null

  const memberControls =
    networkPeople.length > 0 || selectedDiscoveryServers.length > 1 ? (
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        sx={{
          width: { xs: '100%', sm: 'auto' },
          alignItems: { xs: 'stretch', sm: 'center' },
        }}
      >
        {memberFilterControl}
        {memberSortControl}
      </Stack>
    ) : undefined

  return (
    <Stack spacing={0}>
      <SectionNav
        aria-label="Discovery sections"
        sections={[
          {
            id: 'matching-games',
            label: 'Matching',
            desktopLabel: 'Matching Games',
            ariaLabel: 'Matching games',
            count: sortedOverlapGames.length,
          },
          {
            id: 'other-games',
            label: 'Other',
            desktopLabel: 'Other Games',
            ariaLabel: 'Other games',
            count: sortedBrowseGames.length,
          },
          {
            id: 'network-members',
            label: 'Members',
            desktopLabel: 'Network Members',
            ariaLabel: 'Network members',
            count: sortedNetworkPeople.length,
          },
        ]}
      />

      {trendingGames.length > 0 ? (
        <Box sx={{ mt: 1, mb: 2 }}>
          <LibraryTrendingRow
            trendingGames={trendingGames}
            addingLibraryGameId={addingLibraryGameId}
            onAddToLibrary={onAddGameToLibrary}
          />
        </Box>
      ) : null}

      <DiscoverySection
        isFirst
        sectionId="matching-games"
        title="Matching games"
        description="Games you have in common with people in your network."
        sortControl={
          overlapGames.length > 0 || browseGames.length > 0
            ? gameSortControl
            : undefined
        }
      >
        {discoveryLoading ? (
          <Box sx={discoveryGameGridSx}>
            {Array.from({ length: 6 }, (_, i) => (
              <GameCardSkeleton key={i} compact />
            ))}
          </Box>
        ) : sortedOverlapGames.length > 0 ? (
          <Box sx={discoveryGameGridSx}>
            {sortedOverlapGames.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                canManage={isSignedIn}
                canAddToLibrary={isSignedIn}
                isInLibrary={libraryGameIds.has(game.id)}
                libraryEntryId={libraryEntryIdsByGameId.get(game.id) ?? null}
                isAddingToLibrary={addingLibraryGameId === game.id}
                isRemovingFromLibrary={
                  removingLibraryEntryId ===
                  (libraryEntryIdsByGameId.get(game.id) ?? null)
                }
                pendingFriendId={friendPendingId}
                onToggleFriend={onToggleFriend}
                onAddToLibrary={onAddGameToLibrary}
                onRemoveFromLibrary={onRemoveLibraryEntry}
                compact
              />
            ))}
          </Box>
        ) : (
          <EmptyState
            icon={<SportsEsportsRoundedIcon />}
            title={
              isSignedIn
                ? 'No matching games yet'
                : 'Matching games will appear here'
            }
            description={
              noDiscoveryServersSelected
                ? 'You do not have any Discord servers in your network, so the app has no network members to compare against.'
                : isSignedIn
                  ? "Add games to your library and select at least one Discord server to form your network so Game's Up can find people with matching games."
                  : showsDemoDiscoveryCopy
                    ? 'This section shows games that the seeded demo viewer and other users both have in their playlists.'
                    : 'Sign in to compare your library with friends and other people in your network.'
            }
          />
        )}
      </DiscoverySection>

      <DiscoverySection
        sectionId="other-games"
        title="Other games"
        description="Games you don't have in common with people in your network."
        sortControl={
          overlapGames.length > 0 || browseGames.length > 0
            ? gameSortControl
            : undefined
        }
      >
        {discoveryLoading ? (
          <Box sx={discoveryGameGridSx}>
            {Array.from({ length: 6 }, (_, i) => (
              <GameCardSkeleton key={i} compact />
            ))}
          </Box>
        ) : sortedBrowseGames.length > 0 ? (
          <Box sx={discoveryGameGridSx}>
            {sortedBrowseGames.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                canManage={isSignedIn}
                canAddToLibrary={isSignedIn}
                isInLibrary={libraryGameIds.has(game.id)}
                libraryEntryId={libraryEntryIdsByGameId.get(game.id) ?? null}
                isAddingToLibrary={addingLibraryGameId === game.id}
                isRemovingFromLibrary={
                  removingLibraryEntryId ===
                  (libraryEntryIdsByGameId.get(game.id) ?? null)
                }
                pendingFriendId={friendPendingId}
                onToggleFriend={onToggleFriend}
                onAddToLibrary={onAddGameToLibrary}
                onRemoveFromLibrary={onRemoveLibraryEntry}
                compact
              />
            ))}
          </Box>
        ) : (
          <EmptyState
            icon={<SportsEsportsRoundedIcon />}
            title={isSignedIn ? 'No other games yet' : 'No other games yet'}
            description={
              noDiscoveryServersSelected
                ? 'Select at least one Discord server to form your network so that you can browse other games played by network members.'
                : isSignedIn
                  ? overlapGames.length > 0
                    ? 'Everything is already shown above because it also matches your library.'
                    : 'No one in your network has games in their playlist yet.'
                  : overlapGames.length > 0
                    ? 'All titles are already covered in the matching games section above.'
                    : 'Sign in to see other games played by friends and other people in your network.'
            }
          />
        )}
      </DiscoverySection>

      <DiscoverySection
        sectionId="network-members"
        title="Network members"
        description="People in your network who are not already on your friends list."
        helperText={
          activeMemberServerFilter
            ? `Showing members visible through ${activeMemberServerFilter.name}.`
            : undefined
        }
        sortControl={memberControls}
      >
        {sortedNetworkPeople.length > 0 ? (
          <Stack spacing={2}>
            {sortedNetworkPeople.map((person) => (
              <PersonCard
                key={person.id}
                person={person}
                canManage={isSignedIn}
                canAddToLibrary={isSignedIn}
                libraryGameIds={libraryGameIds}
                libraryEntryIdsByGameId={libraryEntryIdsByGameId}
                addingLibraryGameId={addingLibraryGameId}
                removingLibraryEntryId={removingLibraryEntryId}
                isPending={friendPendingId === person.id}
                onToggleFriend={onToggleFriend}
                onAddToLibrary={onAddGameToLibrary}
                onRemoveLibraryEntry={onRemoveLibraryEntry}
                isMuted={mutedPlayIntentUserIds.has(person.id)}
                onMute={onMutePlayIntentUser}
                onUnmute={onUnmutePlayIntentUser}
              />
            ))}
          </Stack>
        ) : (
          <EmptyState
            icon={<GroupsRoundedIcon />}
            title={
              isSignedIn
                ? 'No network members to show yet'
                : 'Network members will appear here'
            }
            description={
              noDiscoveryServersSelected
                ? 'You do not have any Discord servers in your network to find others on.'
                : activeMemberServerFilter
                  ? `No other people from ${activeMemberServerFilter.name} are available yet. Try another server or clear the filter.`
                  : isSignedIn
                    ? 'No other people in your network are available yet. Friends appear in the Friends view.'
                    : showsDemoDiscoveryCopy
                      ? 'This section shows the seeded network-member view. Friends are listed separately in the Friends view.'
                      : 'Sign in to browse people in your network here.'
            }
          />
        )}
      </DiscoverySection>
    </Stack>
  )
}

export function DiscoveryView() {
  const { discoveryViewProps, libraryViewProps } = useDashboardContext()
  const gameAliasByGameId = new Map(
    libraryViewProps.gameAliases.map((alias) => [
      alias.gameId,
      alias.aliasValue,
    ]),
  )
  const editorGameAlias = libraryViewProps.editingLibraryEntry
    ? (gameAliasByGameId.get(libraryViewProps.editingLibraryEntry.gameId) ??
      null)
    : null

  return (
    <>
      <DiscoveryViewContent {...discoveryViewProps} />
      <DashboardModal
        open={libraryViewProps.isLibraryEditorOpen}
        onClose={libraryViewProps.closeLibraryEditor}
        width="min(96vw, 760px)"
      >
        <LibraryEditorCard
          editingLibraryEntry={libraryViewProps.editingLibraryEntry}
          libraryTitle={libraryViewProps.libraryTitle}
          onLibraryTitleChange={libraryViewProps.onLibraryTitleChange}
          selectedCatalogResult={libraryViewProps.selectedCatalogResult}
          gameSuggestions={libraryViewProps.gameSuggestions}
          gameSuggestionsLoading={libraryViewProps.gameSuggestionsLoading}
          onSelectSuggestion={libraryViewProps.onSelectSuggestion}
          platformOptions={libraryViewProps.platformOptions}
          selectedPlatformLabels={libraryViewProps.selectedPlatformLabels}
          onTogglePlatformLabel={libraryViewProps.onTogglePlatformLabel}
          libraryIntent={libraryViewProps.libraryIntent}
          onLibraryIntentChange={libraryViewProps.onLibraryIntentChange}
          currentUsualAvailability={libraryViewProps.currentUsualAvailability}
          libraryAvailability={libraryViewProps.libraryAvailability}
          onLibraryAvailabilityChange={
            libraryViewProps.onLibraryAvailabilityChange
          }
          gameAlias={editorGameAlias}
          aliasSaving={Boolean(
            libraryViewProps.editingLibraryEntry &&
            libraryViewProps.aliasSavingKey ===
              `game:${libraryViewProps.editingLibraryEntry.gameId}`,
          )}
          onSaveGameAlias={libraryViewProps.onSaveGameAlias}
          onDeleteGameAlias={libraryViewProps.onDeleteGameAlias}
          librarySaving={libraryViewProps.librarySaving}
          onAddLibraryEntry={libraryViewProps.onAddLibraryEntry}
          onCancelLibraryEdit={libraryViewProps.onCancelLibraryEdit}
        />
      </DashboardModal>
    </>
  )
}
