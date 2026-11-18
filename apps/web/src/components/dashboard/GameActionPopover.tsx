import {
  Chip,
  Divider,
  Dropdown,
  Menu,
  MenuButton,
  MenuItem,
  Stack,
  Typography,
} from '@mui/joy'
import type { DashboardLibraryQuickAddGame } from './types'
import { useDashboardContext } from '../../contexts/useDashboardContext'

const titleTriggerSx = {
  px: 0,
  py: 0,
  minHeight: 0,
  justifyContent: 'flex-start',
  display: 'inline-flex',
  alignItems: 'center',
  lineHeight: 1,
  color: 'neutral.100',
  textAlign: 'left',
  borderRadius: 'sm',
  cursor: 'pointer',
  transition: 'color 180ms ease, transform 180ms ease',
  '&:hover': {
    color: 'primary.200',
    transform: 'translateY(-1px)',
  },
  '&:hover .game-trigger-title': {
    textDecoration: 'underline',
    textDecorationColor: '#8dffd8',
    textUnderlineOffset: '0.18em',
  },
  '&:focus-visible': {
    outline: '2px solid',
    outlineColor: 'primary.400',
    outlineOffset: '3px',
  },
} as const

const chipTriggerSx = {
  justifyContent: 'flex-start',
  alignSelf: 'flex-start',
  cursor: 'pointer',
  transition:
    'background-color 180ms ease, color 180ms ease, transform 180ms ease, box-shadow 180ms ease',
  '&:hover': {
    backgroundColor: 'rgba(var(--joy-palette-primary-darkChannel) / 0.9)',
    color: 'primary.100',
    transform: 'translateY(-1px)',
    boxShadow: '0 0 0 1px rgba(var(--joy-palette-primary-lightChannel) / 0.22)',
  },
  '&:focus-visible': {
    outline: '2px solid',
    outlineColor: 'primary.400',
    outlineOffset: '3px',
  },
} as const

export function GameActionPopover({
  game,
  canAddToLibrary,
  isInLibrary,
  isAddingToLibrary,
  supportingText,
  detailLines = [],
  trigger = 'title',
  large = false,
  onAddToLibrary,
}: {
  game: DashboardLibraryQuickAddGame
  canAddToLibrary: boolean
  isInLibrary: boolean
  isAddingToLibrary: boolean
  supportingText?: string
  detailLines?: string[]
  trigger?: 'title' | 'chip'
  large?: boolean
  onAddToLibrary: (game: DashboardLibraryQuickAddGame) => Promise<void>
}) {
  const { gameDetailsViewProps } = useDashboardContext()
  const visibleDetailLines = detailLines
    .map((line) => line.trim())
    .filter(Boolean)

  return (
    <Dropdown>
      <MenuButton
        variant={trigger === 'chip' ? 'soft' : 'plain'}
        color={trigger === 'chip' ? 'success' : 'neutral'}
        size="sm"
        sx={trigger === 'chip' ? chipTriggerSx : titleTriggerSx}
      >
        {trigger === 'chip' ? (
          game.title
        ) : (
          <Typography
            className="game-trigger-title"
            level={large ? 'title-lg' : 'title-sm'}
            sx={{
              display: '-webkit-box',
              overflow: 'hidden',
              lineHeight: 1.2,
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {game.title}
          </Typography>
        )}
      </MenuButton>

      <Menu
        placement="bottom-start"
        size="sm"
        sx={{ minWidth: 280, maxWidth: 320 }}
      >
        <MenuItem
          disabled
          sx={{ whiteSpace: 'normal', alignItems: 'flex-start', py: 1.25 }}
        >
          <Stack spacing={0.75}>
            <Typography level="title-md">{game.title}</Typography>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
              {game.platformLabels.map((platform) => (
                <Chip
                  key={platform}
                  size="sm"
                  variant="outlined"
                  color="neutral"
                >
                  {platform}
                </Chip>
              ))}
            </Stack>
            {supportingText ? (
              <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                {supportingText}
              </Typography>
            ) : null}
          </Stack>
        </MenuItem>

        {visibleDetailLines.map((line) => (
          <MenuItem
            key={line}
            disabled
            sx={{ whiteSpace: 'normal', alignItems: 'flex-start', py: 1 }}
          >
            <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
              {line}
            </Typography>
          </MenuItem>
        ))}

        <Divider inset="context" />

        <MenuItem
          onClick={() =>
            gameDetailsViewProps.openGameDetails({
              source: 'local',
              sourceId: game.gameId,
              title: game.title,
              coverUrl: game.coverUrl,
              platformLabels: game.platformLabels,
            })
          }
        >
          View details
        </MenuItem>

        <MenuItem
          disabled={!canAddToLibrary || isInLibrary || isAddingToLibrary}
          onClick={() => void onAddToLibrary(game)}
        >
          {!canAddToLibrary
            ? 'Sign in to add to library'
            : isInLibrary
              ? 'Already in your library'
              : isAddingToLibrary
                ? 'Adding...'
                : 'Add to library'}
        </MenuItem>
      </Menu>
    </Dropdown>
  )
}
