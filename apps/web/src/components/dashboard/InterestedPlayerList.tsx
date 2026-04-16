import { Avatar, Box, Sheet, Stack, Typography } from '@mui/joy'
import type { ActivePlayIntent, DiscoveryPerson, PlayIntentPreview } from '@game-is-up/shared'
import { CompactDiscoveryPlayerCard } from './GameCard'
import type { FriendTarget } from './types'

const interestedPlayerGridSx = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))',
  gap: 1
} as const

type InterestedPlayer = ActivePlayIntent['interestedUsers'][number] | PlayIntentPreview['interestedUsers'][number]

export function InterestedPlayerList({
  users,
  label = 'Interested players',
  sx = {},
  discoveryPeopleById,
  canManage = false,
  friendPendingId = null,
  onToggleFriend
}: {
  users: InterestedPlayer[];
  label?: string;
  sx?: Record<string, unknown>;
  discoveryPeopleById?: ReadonlyMap<string, DiscoveryPerson>;
  canManage?: boolean;
  friendPendingId?: string | null;
  onToggleFriend?: (target: FriendTarget) => Promise<void>;
}) {
  if (users.length === 0) {
    return null
  }

  return (
    <Box sx={sx}>
      <Typography level="body-xs" sx={{ mb: 0.75, color: 'success.300', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
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
                  friendEligible: person.friendEligible
                }}
                handle={person.handle}
                canManage={canManage}
                isPending={friendPendingId === person.id}
                supportingText={person.lastActiveLabel}
                detailLines={[
                  person.contactHint,
                  person.mutualServers.length > 0 ? `Mutual servers: ${person.mutualServers.join(', ')}` : 'Visible to you through your friends list or network.',
                  'Interested in this call to play.',
                  `Timezone: ${person.timezoneLabel}`,
                  person.usualAvailability ? `Usually plays: ${person.usualAvailability}` : ''
                ]}
                badges={[
                  { label: 'Interested', color: 'success' },
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
                border: '1px solid rgba(87, 244, 193, 0.14)',
                background: 'linear-gradient(180deg, rgba(16, 45, 40, 0.72), rgba(15, 20, 33, 0.96))'
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