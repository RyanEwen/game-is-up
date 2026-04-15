import { Avatar, Divider, Dropdown, Menu, MenuButton, MenuItem, Stack, Typography } from '@mui/joy'
import type { FriendTarget } from './types'

const interactiveTriggerSx = {
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
    textDecoration: 'underline',
    textDecorationColor: 'rgba(141, 255, 216, 0.85)',
    textUnderlineOffset: '0.18em'
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
  isMuted = false,
  isMutePending = false,
  onToggleFriend,
  onMute,
  onUnmute
}: {
  target: FriendTarget;
  handle: string;
  canManage: boolean;
  isPending: boolean;
  supportingText?: string;
  detailLines?: string[];
  large?: boolean;
  isMuted?: boolean;
  isMutePending?: boolean;
  onToggleFriend: (target: FriendTarget) => Promise<void>;
  onMute?: (userId: string) => Promise<void>;
  onUnmute?: (userId: string) => Promise<void>;
}) {
  const visibleDetailLines = detailLines.map((line) => line.trim()).filter(Boolean)

  return (
    <Dropdown>
      <Stack direction="row" spacing={1} alignItems="center">
        <Avatar
          src={target.avatarUrl ?? undefined}
          alt={target.displayName}
          size={large ? 'lg' : 'sm'}
          variant="soft"
          sx={{ flexShrink: 0 }}
        />
        <MenuButton
          variant="plain"
          color="neutral"
          sx={interactiveTriggerSx}
        >
          <Typography className="friend-trigger-name" level={large ? 'title-lg' : 'title-sm'} sx={{ lineHeight: 1.2, display: 'block' }}>
            {target.displayName}
          </Typography>
        </MenuButton>
      </Stack>

      <Menu placement="bottom-start" size="sm" sx={{ minWidth: 280, maxWidth: 320 }}>
        <MenuItem disabled sx={{ whiteSpace: 'normal', alignItems: 'flex-start', py: 1.25 }}>
          <Stack direction="row" spacing={1.25} alignItems="center">
            <Avatar src={target.avatarUrl ?? undefined} alt={target.displayName} size="md" variant="soft" />
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

        {onMute && onUnmute ? (
          <MenuItem
            disabled={!canManage || isMutePending}
            onClick={() => void (isMuted ? onUnmute(target.id) : onMute(target.id))}
          >
            {isMutePending
              ? 'Updating...'
              : isMuted
                ? 'Unmute this player\'s CTPs'
                : 'Mute this player\'s CTPs'}
          </MenuItem>
        ) : null}
      </Menu>
    </Dropdown>
  )
}