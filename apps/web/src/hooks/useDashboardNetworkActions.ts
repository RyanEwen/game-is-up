/**
 * The dashboard's network actions: adding and removing friends, saving and deleting friends
 * lists, and choosing which shared Discord servers form the user's network (and refreshing that
 * list from Discord). Each is a TanStack Query mutation; while one runs, its pending flag or id
 * marks the row in the UI, and when it succeeds the network-dependent dashboard data refreshes.
 *
 * Notices read as they did before the move from `useDashboardApp`.
 */
import type { Dispatch, SetStateAction } from 'react'
import { useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  deleteFriendsListResponseSchema,
  discordServerPreferencesResponseSchema,
  friendsListResponseSchema,
} from '@game-is-up/shared'
import type { FriendTarget, Notice } from '../components/dashboard/types'
import { apiRequest, noResponseBody } from '../lib/apiQuery'

/** The server's message for a failed request, or the fallback. */
function errorNotice(error: unknown, fallback: string): Notice {
  return {
    tone: 'danger',
    message: error instanceof Error && error.message ? error.message : fallback,
  }
}

export function useDashboardNetworkActions({
  refreshAfterChange,
  setActionNotice,
}: {
  /** Refetch what a network change affects, once the server has accepted it. */
  refreshAfterChange: () => Promise<void>
  setActionNotice: Dispatch<SetStateAction<Notice | null>>
}) {
  const friendMutation = useMutation({
    mutationFn: (target: FriendTarget) =>
      apiRequest(
        `/api/friends/${target.id}`,
        noResponseBody,
        'Unable to update friends right now.',
        { method: target.friendEligible ? 'POST' : 'DELETE' },
      ),
  })
  const saveFriendsListMutation = useMutation({
    mutationFn: (input: {
      listId?: string
      name: string
      friendUserIds: string[]
    }) =>
      apiRequest(
        input.listId
          ? `/api/friends-lists/${input.listId}`
          : '/api/friends-lists',
        friendsListResponseSchema,
        'Unable to save that friends list right now.',
        {
          method: input.listId ? 'PUT' : 'POST',
          body: JSON.stringify({
            name: input.name,
            friendUserIds: input.friendUserIds,
          }),
        },
      ),
  })
  const deleteFriendsListMutation = useMutation({
    mutationFn: (listId: string) =>
      apiRequest(
        `/api/friends-lists/${listId}`,
        deleteFriendsListResponseSchema,
        'Unable to delete that friends list right now.',
        { method: 'DELETE' },
      ),
  })
  const serverPreferenceMutation = useMutation({
    mutationFn: (variables: { serverId: string; selected: boolean }) =>
      apiRequest(
        `/api/discord-servers/me/${variables.serverId}`,
        discordServerPreferencesResponseSchema,
        'Unable to update your Discord server network right now.',
        {
          method: 'PUT',
          body: JSON.stringify({ selected: variables.selected }),
        },
      ),
  })
  const refreshServersMutation = useMutation({
    mutationFn: () =>
      apiRequest(
        '/api/discord-servers/me/refresh',
        discordServerPreferencesResponseSchema,
        'Unable to refresh your Discord server list right now.',
        { method: 'POST' },
      ),
  })

  const handleToggleFriend = useCallback(
    async (target: FriendTarget) => {
      setActionNotice(null)

      try {
        await friendMutation.mutateAsync(target)
      } catch (error) {
        setActionNotice(
          errorNotice(error, 'Unable to update friends right now.'),
        )
        return
      }

      setActionNotice({
        tone: 'success',
        message: target.friendEligible
          ? `${target.displayName} was added to your friends list.`
          : `${target.displayName} was removed from your friends list.`,
      })
      await refreshAfterChange()
    },
    [friendMutation, refreshAfterChange, setActionNotice],
  )

  const handleSaveFriendsList = useCallback(
    async (input: {
      listId?: string
      name: string
      friendUserIds: string[]
    }): Promise<boolean> => {
      setActionNotice(null)

      try {
        const parsed = await saveFriendsListMutation.mutateAsync(input)
        setActionNotice({
          tone: 'success',
          message: input.listId
            ? `Updated the "${parsed.list.name}" friends list.`
            : `Created the "${parsed.list.name}" friends list.`,
        })
      } catch (error) {
        setActionNotice(
          errorNotice(error, 'Unable to save that friends list right now.'),
        )
        return false
      }

      await refreshAfterChange()
      return true
    },
    [refreshAfterChange, saveFriendsListMutation, setActionNotice],
  )

  const handleDeleteFriendsList = useCallback(
    async (listId: string): Promise<boolean> => {
      setActionNotice(null)

      try {
        const parsed = await deleteFriendsListMutation.mutateAsync(listId)
        setActionNotice({
          tone: parsed.status === 'deleted' ? 'success' : 'danger',
          message: parsed.message,
        })
        await refreshAfterChange()
        return parsed.status === 'deleted'
      } catch (error) {
        setActionNotice(
          errorNotice(error, 'Unable to delete that friends list right now.'),
        )
        return false
      }
    },
    [deleteFriendsListMutation, refreshAfterChange, setActionNotice],
  )

  const handleToggleDiscordServer = useCallback(
    async (serverId: string, nextSelected: boolean) => {
      setActionNotice(null)

      try {
        await serverPreferenceMutation.mutateAsync({
          serverId,
          selected: nextSelected,
        })
      } catch (error) {
        setActionNotice(
          errorNotice(
            error,
            'Unable to update your Discord server network right now.',
          ),
        )
        return
      }

      setActionNotice({
        tone: 'success',
        message: nextSelected
          ? 'Discord server added to your network.'
          : 'Discord server removed from your network.',
      })
      await refreshAfterChange()
    },
    [refreshAfterChange, serverPreferenceMutation, setActionNotice],
  )

  const handleRefreshDiscordServers = useCallback(async () => {
    if (refreshServersMutation.isPending) {
      return
    }

    setActionNotice(null)

    try {
      await refreshServersMutation.mutateAsync()
    } catch (error) {
      setActionNotice(
        errorNotice(
          error,
          'Unable to refresh your Discord server list right now.',
        ),
      )
      return
    }

    setActionNotice({
      tone: 'success',
      message: 'Discord servers refreshed from Discord.',
    })
    await refreshAfterChange()
  }, [refreshAfterChange, refreshServersMutation, setActionNotice])

  return {
    friendPendingId: friendMutation.isPending
      ? (friendMutation.variables?.id ?? null)
      : null,
    friendsListMutationPending:
      saveFriendsListMutation.isPending || deleteFriendsListMutation.isPending,
    serverPreferencePendingId: serverPreferenceMutation.isPending
      ? (serverPreferenceMutation.variables?.serverId ?? null)
      : null,
    discordServerRefreshPending: refreshServersMutation.isPending,
    handleToggleFriend,
    handleSaveFriendsList,
    handleDeleteFriendsList,
    handleToggleDiscordServer,
    handleRefreshDiscordServers,
  }
}
