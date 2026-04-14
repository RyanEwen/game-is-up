import { Box, Card, Option, Select, Stack, Typography } from '@mui/joy'
import { useEffect, useRef, useState } from 'react'
import type { DiscoveryGame, DiscoveryPerson } from '@game-is-up/shared'
import { DashboardModal } from '../components/dashboard/DashboardModal'
import { EmptyStateCard } from '../components/dashboard/EmptyStateCard'
import { GameCard } from '../components/dashboard/GameCard'
import { LibraryEditorCard } from '../components/dashboard/LibraryEditorCard'
import { PersonCard } from '../components/dashboard/PersonCard'
import { discoveryGameGridSx } from '../components/dashboard/dashboardUtils'
import { useDashboardContext } from '../contexts/useDashboardContext'
import type { DashboardLibraryQuickAddGame, FriendTarget } from '../components/dashboard/types'

const showsDemoDiscoveryCopy = import.meta.env.DEV

// Tab bar pill bottom = sticky-top + margin(4) + border(1) + padding + tab-minHeight + padding + border(1)
// xs: 12 + 4 + 1 + 6 + 44 + 6 + 1 = 74px
// md: 16 + 4 + 1 + 8 + 52 + 8 + 1 = 90px
const sectionNavTop = {
  xs: 'calc(var(--app-top-inset, 0px) + 74px)',
  md: 'calc(var(--app-top-inset, 0px) + 90px)'
} as const

// scroll-margin-top = nav top + nav height (~48px) + 8px gap
const sectionScrollMarginTop = {
  xs: 'calc(var(--app-top-inset, 0px) + 132px)',
  md: 'calc(var(--app-top-inset, 0px) + 152px)'
} as const

type SectionId = 'matching-games' | 'other-games' | 'network-members'

function scrollToSection(id: SectionId) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function DiscoverySectionNav({ sections }: { sections: Array<{ id: SectionId; label: string; count: number }> }) {
  const navRef = useRef<HTMLDivElement>(null)
  const [isStuck, setIsStuck] = useState(false)

  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const check = () => {
      const rect = nav.getBoundingClientRect()
      const stickyTop = parseFloat(getComputedStyle(nav).top) || 0
      setIsStuck(rect.top <= stickyTop + 1)
    }
    window.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check, { passive: true })
    check()
    return () => {
      window.removeEventListener('scroll', check)
      window.removeEventListener('resize', check)
    }
  }, [])

  const topRadius = isStuck ? 0 : 'var(--joy-radius-xl, 16px)'

  return (
    <Box
      ref={navRef}
      component="nav"
      aria-label="Discovery sections"
      sx={{
        position: 'sticky',
        top: sectionNavTop,
        zIndex: 19,
        mb: 3,
        display: 'flex',
        justifyContent: 'center'
      }}
    >
      <Box
        sx={{
          display: 'inline-flex',
          flexDirection: 'row',
          alignItems: 'center',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: 0,
          px: { xs: 2, sm: 2.5 },
          py: { xs: 0.75, sm: 1 },
          borderTop: 'none',
          borderLeft: '1px solid rgba(129, 166, 214, 0.22)',
          borderRight: '1px solid rgba(129, 166, 214, 0.22)',
          borderBottom: '1px solid rgba(129, 166, 214, 0.22)',
          borderTopLeftRadius: topRadius,
          borderTopRightRadius: topRadius,
          borderBottomLeftRadius: 'var(--joy-radius-xl, 16px)',
          borderBottomRightRadius: 'var(--joy-radius-xl, 16px)',
          transition: 'border-top-left-radius 120ms ease, border-top-right-radius 120ms ease',
          backgroundColor: 'rgba(7, 12, 24, 0.86)',
          backdropFilter: 'blur(10px) saturate(1.04)',
          WebkitBackdropFilter: 'blur(10px) saturate(1.04)',
          boxShadow: [
            '0 14px 26px -18px rgba(0, 0, 0, 0.92)',
            'inset 0 -1px 0 rgba(255, 255, 255, 0.04)',
            '0 0 0 1px rgba(94, 144, 206, 0.14)'
          ].join(', ')
        }}
      >
        {sections.map(({ id, label, count }, i) => (
          <Box key={id} sx={{ display: 'flex', alignItems: 'center' }}>
            {i > 0 && (
              <Box component="span" aria-hidden sx={{ mx: 1.5, color: 'rgba(255,255,255,0.18)', userSelect: 'none', fontSize: 'sm' }}>·</Box>
            )}
            <Box
              component="button"
              onClick={() => scrollToSection(id)}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                border: 'none',
                background: 'none',
                padding: 0,
                color: 'var(--joy-palette-neutral-400)',
                fontSize: { xs: 'var(--joy-fontSize-sm)', sm: 'var(--joy-fontSize-md)' },
                fontWeight: 'var(--joy-fontWeight-md)',
                fontFamily: 'var(--joy-fontFamily-body)',
                cursor: 'pointer',
                transition: 'color 150ms ease',
                '&:hover': { color: 'var(--joy-palette-neutral-100)' },
                '&:focus-visible': {
                  outline: '2px solid rgba(129, 166, 214, 0.6)',
                  outlineOffset: 3,
                  borderRadius: 2
                }
              }}
            >
              {label}
              {count > 0 && (
                <Box
                  component="span"
                  sx={{
                    color: 'var(--joy-palette-neutral-500)',
                    fontSize: { xs: 'var(--joy-fontSize-xs)', sm: 'var(--joy-fontSize-sm)' },
                    fontWeight: 'var(--joy-fontWeight-md)'
                  }}
                >
                  {count}
                </Box>
              )}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

function DiscoverySection({
  isFirst = false,
  sectionId,
  title,
  description,
  children,
  helperText,
  sortControl
}: {
  isFirst?: boolean;
  sectionId: SectionId;
  title: string;
  description: string;
  helperText?: string;
  children: React.ReactNode;
  sortControl?: React.ReactNode;
}) {
  return (
    <Stack id={sectionId} spacing={2} sx={{ mt: isFirst ? 0 : 3, scrollMarginTop: sectionScrollMarginTop }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Typography level="h2">{title}</Typography>
        {sortControl}
      </Box>
      <Typography level="body-md" sx={{ color: 'neutral.300' }}>
        {description}
      </Typography>
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

function sortPeople(people: DiscoveryPerson[], sort: MemberSort): DiscoveryPerson[] {
  return [...people].sort((a, b) => {
    if (sort === 'games') return b.games.length - a.games.length
    return a.displayName.localeCompare(b.displayName)
  })
}

function DiscoveryViewContent({
  error,
  overlapGames,
  browseGames,
  discoveryPeople,
  noDiscoveryServersSelected,
  isSignedIn,
  libraryGameIds,
  libraryEntryIdsByGameId,
  addingLibraryGameId,
  removingLibraryEntryId,
  friendPendingId,
  onToggleFriend,
  onAddGameToLibrary,
  onRemoveLibraryEntry
}: {
  error: string | null;
  overlapGames: DiscoveryGame[];
  browseGames: DiscoveryGame[];
  discoveryPeople: DiscoveryPerson[];
  noDiscoveryServersSelected: boolean;
  isSignedIn: boolean;
  libraryGameIds: ReadonlySet<string>;
  libraryEntryIdsByGameId: ReadonlyMap<string, string>;
  addingLibraryGameId: string | null;
  removingLibraryEntryId: string | null;
  friendPendingId: string | null;
  onToggleFriend: (target: FriendTarget) => Promise<void>;
  onAddGameToLibrary: (game: DashboardLibraryQuickAddGame) => Promise<void>;
  onRemoveLibraryEntry: (entryId: string) => Promise<void>;
}) {
  const networkPeople = discoveryPeople.filter((person) => !person.isFriend)
  const [gameSort, setGameSort] = useState<GameSort>('players')
  const [memberSort, setMemberSort] = useState<MemberSort>('games')

  const sortedOverlapGames = sortGames(overlapGames, gameSort)
  const sortedBrowseGames = sortGames(browseGames, gameSort)
  const sortedNetworkPeople = sortPeople(networkPeople, memberSort)

  const gameSortControl = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Typography level="body-sm" sx={{ color: 'neutral.400', whiteSpace: 'nowrap' }}>Sort by</Typography>
      <Select
        size="sm"
        value={gameSort}
        onChange={(_e, val) => { if (val) setGameSort(val) }}
        sx={{ minWidth: 140 }}
      >
        <Option value="players">Number of players</Option>
        <Option value="name">Name</Option>
      </Select>
    </Box>
  )

  const memberSortControl = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Typography level="body-sm" sx={{ color: 'neutral.400', whiteSpace: 'nowrap' }}>Sort by</Typography>
      <Select
        size="sm"
        value={memberSort}
        onChange={(_e, val) => { if (val) setMemberSort(val) }}
        sx={{ minWidth: 140 }}
      >
        <Option value="games">Number of games</Option>
        <Option value="name">Name</Option>
      </Select>
    </Box>
  )

  return (
    <Stack spacing={0}>
      <DiscoverySectionNav
        sections={[
          { id: 'matching-games', label: 'Matching games', count: sortedOverlapGames.length },
          { id: 'other-games', label: 'Other games', count: sortedBrowseGames.length },
          { id: 'network-members', label: 'Network members', count: sortedNetworkPeople.length }
        ]}
      />
      <DiscoverySection
        isFirst
        sectionId="matching-games"
        title="Matching games"
        description="Games you have in common with people in your network."
        sortControl={overlapGames.length > 0 || browseGames.length > 0 ? gameSortControl : undefined}
      >
        {error ? (
          <Card color="danger" variant="soft">
            <Typography level="body-md">{error}</Typography>
            <Typography level="body-sm" sx={{ mt: 1 }}>
              Retrying in the background every 5 seconds. The dashboard will refresh automatically when the API responds again.
            </Typography>
          </Card>
        ) : null}
        {sortedOverlapGames.length > 0 ? (
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
                isRemovingFromLibrary={removingLibraryEntryId === (libraryEntryIdsByGameId.get(game.id) ?? null)}
                pendingFriendId={friendPendingId}
                onToggleFriend={onToggleFriend}
                onAddToLibrary={onAddGameToLibrary}
                onRemoveFromLibrary={onRemoveLibraryEntry}
                compact
              />
            ))}
          </Box>
        ) : (
          <EmptyStateCard
            title={isSignedIn ? 'No matching games yet' : 'Matching games will appear here'}
            body={
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
      >
        {sortedBrowseGames.length > 0 ? (
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
                isRemovingFromLibrary={removingLibraryEntryId === (libraryEntryIdsByGameId.get(game.id) ?? null)}
                pendingFriendId={friendPendingId}
                onToggleFriend={onToggleFriend}
                onAddToLibrary={onAddGameToLibrary}
                onRemoveFromLibrary={onRemoveLibraryEntry}
                compact
              />
            ))}
          </Box>
        ) : (
          <EmptyStateCard
            title={isSignedIn ? 'No other games yet' : 'No other games yet'}
            body={
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
        sortControl={networkPeople.length > 0 ? memberSortControl : undefined}
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
              />
            ))}
          </Stack>
        ) : (
          <EmptyStateCard
            title={isSignedIn ? 'No network members to show yet' : 'Network members will appear here'}
            body={
              noDiscoveryServersSelected
                ? 'You do not have any Discord servers in your network to find others on.'
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

  return (
    <>
      <DiscoveryViewContent {...discoveryViewProps} />
      <DashboardModal open={libraryViewProps.isLibraryEditorOpen} onClose={libraryViewProps.closeLibraryEditor} width="min(96vw, 760px)">
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
          onLibraryAvailabilityChange={libraryViewProps.onLibraryAvailabilityChange}
          librarySaving={libraryViewProps.librarySaving}
          onAddLibraryEntry={libraryViewProps.onAddLibraryEntry}
          onCancelLibraryEdit={libraryViewProps.onCancelLibraryEdit}
        />
      </DashboardModal>
    </>
  )
}