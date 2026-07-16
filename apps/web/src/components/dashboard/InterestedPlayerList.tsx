import { Avatar, Box, Sheet, Stack, Typography } from '@mui/joy'
import type { ActivePlayIntent, DiscoveryPerson, PlayIntentPreview } from '@game-is-up/shared'
import { CompactDiscoveryPlayerCard } from './GameCard'
import { nestedInsetSurfaceSx } from './dashboardUtils'
import type { FriendTarget } from './types'

const interestedPlayerGridSx = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
  gap: 1
} as const

/**
 * Accepts any call-to-play response user. The shared preview-user shape (used by
 * passed/targeted users) is the common denominator; interested users carry an
 * extra `runningLate` flag that this list does not need to render.
 */
type InterestedPlayer =
  | ActivePlayIntent['interestedUsers'][number]
  | PlayIntentPreview['interestedUsers'][number]
  | PlayIntentPreview['user']

const responseToneStyles = {
  interested: {
    accentColor: 'success.300',
    responseLabel: 'Interested',
    responseDetail: 'Interested in this call to play.',
    badgeColor: 'success',
    borderColor: 'var(--joy-palette-primary-600)',
    background: 'linear-gradient(180deg, rgba(var(--joy-palette-primary-darkChannel) / 0.5), var(--joy-palette-background-popup))'
  },
  late: {
    accentColor: 'warning.300',
    responseLabel: 'Running late',
    responseDetail: 'Interested, but running late.',
    badgeColor: 'warning',
    borderColor: 'var(--joy-palette-warning-700)',
    background: 'linear-gradient(180deg, rgba(var(--joy-palette-warning-darkChannel) / 0.5), var(--joy-palette-background-popup))'
  },
  passed: {
    accentColor: 'warning.200',
    responseLabel: 'Passed',
    responseDetail: 'Passed on this call to play.',
    badgeColor: 'warning',
    borderColor: 'var(--joy-palette-warning-700)',
    background: 'linear-gradient(180deg, rgba(var(--joy-palette-warning-darkChannel) / 0.5), var(--joy-palette-background-popup))'
  }
} as const satisfies Record<string, {
  accentColor: string;
  responseLabel: string;
  responseDetail: string;
  badgeColor: 'success' | 'warning';
  borderColor: string;
  background: string;
}>

export function PlayIntentResponseUserList({
  users,
  label = 'Interested players',
  tone = 'interested',
  sx = {},
  discoveryPeopleById,
  canManage = false,
  friendPendingId = null,
  onToggleFriend
}: {
  users: InterestedPlayer[];
  label?: string;
  tone?: 'interested' | 'passed' | 'late';
  sx?: Record<string, unknown>;
  discoveryPeopleById?: ReadonlyMap<string, DiscoveryPerson>;
  canManage?: boolean;
  friendPendingId?: string | null;
  onToggleFriend?: (target: FriendTarget) => Promise<void>;
}) {
  if (users.length === 0) {
    return null
  }

  const { accentColor, responseLabel, responseDetail, badgeColor, borderColor, background } = responseToneStyles[tone]

  return (
    <Box sx={sx}>
      <Typography level="body-xs" sx={{ mb: 0.75, color: accentColor, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </Typography>
      <Box sx={interestedPlayerGridSx}>
        {users.map((user) => {
          const person = discoveryPeopleById?.get(user.id)

          if (person && onToggleFriend) {
            return (
              <CompactDiscoveryPlayerCard
                key={user.id}
                target={{
                  id: person.id,
                  displayName: person.displayName,
                  avatarUrl: person.avatarUrl,
                  discordUserId: person.discordUserId,
                  friendEligible: person.friendEligible
                }}
                handle={person.handle}
                canManage={canManage}
                isPending={friendPendingId === person.id}
                supportingText={person.lastActiveLabel}
                detailLines={[
                  person.contactHint,
                  person.mutualServers.length > 0 ? `Mutual servers: ${person.mutualServers.join(', ')}` : 'Visible to you through your friends list or network.',
                  responseDetail,
                  `Timezone: ${person.timezoneLabel}`,
                  person.usualAvailability ? `Usually plays: ${person.usualAvailability}` : ''
                ]}
                badges={[
                  { label: responseLabel, color: badgeColor },
                  { label: person.timezoneLabel, variant: 'outlined' }
                ]}
                footerBadge={person.usualAvailability ? { label: `Usually: ${person.usualAvailability}`, color: 'neutral' } : null}
                onToggleFriend={onToggleFriend}
              />
            )
          }

          return (
            <Sheet
              key={user.id}
              variant="soft"
              sx={{
                p: 1.25,
                borderRadius: 'lg',
                border: `1px solid ${borderColor}`,
                background,
                boxShadow: nestedInsetSurfaceSx.boxShadow
              }}
            >
              <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                <Avatar src={user.avatarUrl ?? undefined} alt={user.displayName} size="sm" variant="soft" />
                <Box sx={{ minWidth: 0 }}>
                  <Typography level="title-sm" sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {user.displayName}
                  </Typography>
                  <Typography level="body-xs" sx={{ color: 'neutral.400', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    @{user.handle}
                  </Typography>
                </Box>
              </Stack>
            </Sheet>
          )
        })}
      </Box>
    </Box>
  )
}