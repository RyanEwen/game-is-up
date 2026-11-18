/** One-friend invitation dialog, backed by server eligibility and permission checks. */
import { useEffect, useState } from 'react'
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
  extractErrorMessage,
  playIntentFriendInviteResponseSchema,
  playIntentInvitableFriendsResponseSchema,
} from '@game-is-up/shared'
import { DashboardModal } from './DashboardModal'
import { DashboardModalActionBar } from './DashboardModalActionBar'
import { buildApiUrl } from '../../lib/apiUrl'

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
  const [friends, setFriends] = useState<
    { id: string; displayName: string; handle: string }[]
  >([])
  const [friendId, setFriendId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    let cancelled = false
    setLoading(true)
    setFriendId(null)
    setNotice(null)
    setError(null)
    setFriends([])
    async function loadFriends() {
      try {
        const response = await fetch(
          buildApiUrl(`/api/play-intents/${playIntentId}/invitable-friends`),
          { credentials: 'include' },
        )
        const body: unknown = await response.json()
        if (!response.ok) {
          throw new Error(extractErrorMessage(body, 'Unable to load friends.'))
        }
        const result = playIntentInvitableFriendsResponseSchema.parse(body)
        if (!cancelled) {
          setFriends(result.friends)
        }
      } catch (failure) {
        if (!cancelled) {
          setError(
            failure instanceof Error
              ? failure.message
              : 'Unable to load friends.',
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }
    void loadFriends()
    return () => {
      cancelled = true
    }
  }, [open, playIntentId])

  async function inviteFriend() {
    if (!friendId || pending) {
      return
    }
    setPending(true)
    setError(null)
    try {
      const response = await fetch(
        buildApiUrl(`/api/play-intents/${playIntentId}/friend-invites`),
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ friendUserId: friendId }),
        },
      )
      const body: unknown = await response.json()
      if (!response.ok) {
        throw new Error(
          extractErrorMessage(body, 'Unable to invite this friend.'),
        )
      }
      const result = playIntentFriendInviteResponseSchema.parse(body)
      setNotice(result.message)
      setFriends((current) =>
        current.filter((friend) => friend.id !== friendId),
      )
      setFriendId(null)
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Unable to invite this friend.',
      )
    } finally {
      setPending(false)
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
