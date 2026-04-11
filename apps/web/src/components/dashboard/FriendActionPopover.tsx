import { Chip, Divider, Dropdown, Menu, MenuButton, MenuItem, Stack, Typography } from '@mui/joy'
import type { FriendTarget } from './types'

const interactiveTriggerSx = {
  p: 0,
  minHeight: 'unset',
  justifyContent: 'flex-start',
  alignSelf: 'flex-start',
  color: 'neutral.100',
  textAlign: 'left',
  borderRadius: 'sm',
  cursor: 'pointer',
  transition: 'background-color 180ms ease, color 180ms ease, transform 180ms ease',
  '&:hover': {
    backgroundColor: 'rgba(87, 244, 193, 0.12)',
    color: 'primary.200',
    transform: 'translateY(-1px)'
  },
  '&:hover .friend-trigger-name': {
    textDecoration: 'underline',
    textDecorationColor: 'rgba(141, 255, 216, 0.85)',
    textUnderlineOffset: '0.18em'
  },
  '&:hover .friend-trigger-handle': {
    backgroundColor: 'rgba(16, 106, 84, 0.7)'
  },
  '&:focus-visible': {
    outline: '2px solid',
    outlineColor: 'primary.400',
    outlineOffset: '3px'
  }
} as const

export function FriendActionPopover({
  target,
  handle,
  canManage,
  isPending,
  supportingText,
  detailLines = [],
  large = false,
  onToggleFriend
}: {
  target: FriendTarget;
  handle: string;
  canManage: boolean;
  isPending: boolean;
  supportingText?: string;
  detailLines?: string[];
  large?: boolean;
  onToggleFriend: (target: FriendTarget) => Promise<void>;
}) {
  const visibleDetailLines = detailLines.map((line) => line.trim()).filter(Boolean)

  return (
    <Dropdown>
      <MenuButton
        variant="plain"
        color="neutral"
        sx={interactiveTriggerSx}
      >
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }} alignItems="center">
          <Typography className="friend-trigger-name" level={large ? 'title-lg' : 'title-sm'}>
            {target.displayName}
          </Typography>
          <Chip className="friend-trigger-handle" size="sm" variant="soft" color="primary">
            @{handle}
          </Chip>
        </Stack>
      </MenuButton>

      <Menu placement="bottom-start" size="sm" sx={{ minWidth: 280, maxWidth: 320 }}>
        <MenuItem disabled sx={{ whiteSpace: 'normal', alignItems: 'flex-start', py: 1.25 }}>
          <Stack spacing={0.5}>
            <Typography level="title-md">{target.displayName}</Typography>
            <Typography level="body-sm" sx={{ color: 'primary.200' }}>
              @{handle}
            </Typography>
            {supportingText ? (
              <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                {supportingText}
              </Typography>
            ) : null}
          </Stack>
        </MenuItem>

        {visibleDetailLines.map((line) => (
          <MenuItem key={line} disabled sx={{ whiteSpace: 'normal', alignItems: 'flex-start', py: 1 }}>
            <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
              {line}
            </Typography>
          </MenuItem>
        ))}

        <Divider inset="context" />

        <MenuItem disabled={!canManage || isPending} onClick={() => void onToggleFriend(target)}>
          {!canManage
            ? 'Sign in to manage friends'
            : isPending
              ? 'Saving...'
              : target.friendEligible
                ? 'Add as friend'
                : 'Remove from friends'}
        </MenuItem>
      </Menu>
    </Dropdown>
  )
}