/** One-friend invitation dialog, backed by server eligibility and permission checks. */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  Button,
  DialogTitle,
  Option,
  Select,
  Stack,
  Typography,
} from '@mui/joy'
import {
  playIntentFriendInviteResponseSchema,
  playIntentInvitableFriendsResponseSchema,
  type PlayIntentInvitableFriendsResponse,
} from '@game-is-up/shared'
import { DashboardModal } from './DashboardModal'
import { DashboardModalActionBar } from './DashboardModalActionBar'
import { apiRequest } from '../../lib/apiQuery'
import { queryKeys } from '../../lib/queryKeys'
import { useResetOnChange } from '../../hooks/useResetOnChange'

/** Keeps the chosen friend and any failure visible until an invitation succeeds. */
export function InvitePlayIntentFriendDialog({
  playIntentId,
  open,
  onClose,
}: {
  playIntentId: string
  open: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const friendsKey = queryKeys.playIntentInvitableFriends(playIntentId)
  const [friendId, setFriendId] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Who can be invited, reloaded each time the dialog opens (it is never fresh for long).
  const friendsQuery = useQuery({
    queryKey: friendsKey,
    queryFn: () =>
      apiRequest(
        `/api/play-intents/${playIntentId}/invitable-friends`,
        playIntentInvitableFriendsResponseSchema,
        'Unable to load friends.',
      ),
    enabled: open,
    staleTime: 0,
  })
  const inviteMutation = useMutation({
    mutationFn: (friendUserId: string) =>
      apiRequest(
        `/api/play-intents/${playIntentId}/friend-invites`,
        playIntentFriendInviteResponseSchema,
        'Unable to invite this friend.',
        { method: 'POST', body: JSON.stringify({ friendUserId }) },
      ),
  })

  const friends = friendsQuery.data?.friends ?? []
  const loading = friendsQuery.isFetching
  const pending = inviteMutation.isPending
  const error =
    inviteError ?? (friendsQuery.error ? friendsQuery.error.message : null)

  // A fresh start each time the dialog opens.
  useResetOnChange([open], () => {
    if (open) {
      setFriendId(null)
      setNotice(null)
      setInviteError(null)
    }
  })

  async function inviteFriend() {
    if (!friendId || pending) {
      return
    }
    setInviteError(null)
    try {
      const result = await inviteMutation.mutateAsync(friendId)
      setNotice(result.message)
      // The invited friend is no longer invitable.
      queryClient.setQueryData<PlayIntentInvitableFriendsResponse>(
        friendsKey,
        (current) =>
          current
            ? {
                ...current,
                friends: current.friends.filter(
                  (friend) => friend.id !== friendId,
                ),
              }
            : current,
      )
      setFriendId(null)
    } catch (failure) {
      setInviteError(
        failure instanceof Error && failure.message
          ? failure.message
          : 'Unable to invite this friend.',
      )
    }
  }

  return (
    <DashboardModal
      open={open}
      onClose={() => {
        if (!pending) {
          onClose()
        }
      }}
      width="420px"
    >
      <Stack spacing={2}>
        <DialogTitle>Invite a friend</DialogTitle>
        <Typography level="body-sm">
          Invite one of your friends to this call to play.
        </Typography>
        <Select
          placeholder={loading ? 'Loading friends...' : 'Choose one friend'}
          value={friendId}
          disabled={loading || pending}
          onChange={(_, value) => setFriendId(value)}
        >
          {friends.map((friend) => (
            <Option key={friend.id} value={friend.id}>
              {friend.displayName} (@{friend.handle})
            </Option>
          ))}
        </Select>
        {!loading && !error && friends.length === 0 ? (
          <Typography level="body-sm">
            No eligible friends to invite. Friends must have a matching playable
            game and not already be invited.
          </Typography>
        ) : null}
        {error ? <Alert color="danger">{error}</Alert> : null}
        {notice ? <Alert color="success">{notice}</Alert> : null}
        <DashboardModalActionBar
          primaryAction={
            <Button
              disabled={!friendId || loading}
              loading={pending}
              onClick={() => void inviteFriend()}
            >
              Invite friend
            </Button>
          }
          cancelAction={
            <Button
              variant="plain"
              color="neutral"
              disabled={pending}
              onClick={onClose}
            >
              Close
            </Button>
          }
        />
      </Stack>
    </DashboardModal>
  )
}
