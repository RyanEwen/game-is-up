/**
 * Invites + Network page hook used by `useDashboardApp`.
 *
 * Backs the friends list, the per-server discovery preferences, the Discord
 * invite flow, and the manual-add fallback. Composes the audience eligibility
 * data that `useDashboardPlay` needs when building targeted call-to-play
 * audiences so both surfaces read from the same shape.
 */

import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  AuthSessionResponse,
  DiscordServerMembersResponse,
  DiscordServerPreferencesResponse,
  SendDiscordServerInvitesResponse
} from '@game-is-up/shared'
import { discordServerMembersResponseSchema, extractErrorMessage, sendDiscordServerInvitesResponseSchema } from '@game-is-up/shared'
import type { Notice } from '../components/dashboard/types'

const configuredPublicAppUrl = import.meta.env.VITE_PUBLIC_APP_URL
const emptyInviteMembers: DiscordServerMembersResponse['members'] = []

function normalizeInviteUrl(value: string | undefined | null): string | null {
  if (!value) {
    return null
  }

  try {
    const inviteUrl = new URL(value)

    if (inviteUrl.protocol !== 'http:' && inviteUrl.protocol !== 'https:') {
      return null
    }

    inviteUrl.search = ''
    inviteUrl.hash = ''

    return inviteUrl.toString()
  } catch {
    return null
  }
}

function resolveInviteUrl(currentHref: string | null): string | null {
  const configuredUrl = normalizeInviteUrl(configuredPublicAppUrl)

  if (configuredUrl) {
    return configuredUrl
  }

  return normalizeInviteUrl(currentHref)
}

function formatNameList(names: string[]): string {
  if (names.length === 0) {
    return ''
  }

  if (names.length === 1) {
    return names[0] ?? ''
  }

  if (names.length === 2) {
    return `${names[0] ?? ''} and ${names[1] ?? ''}`
  }

  return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`
}

function formatInviterLabel(displayName: string | null | undefined, handle: string | null | undefined): string | null {
  const normalizedDisplayName = displayName?.trim()
  const normalizedHandle = handle?.trim()

  if (normalizedDisplayName && normalizedHandle) {
    return `${normalizedDisplayName} (@${normalizedHandle})`
  }

  if (normalizedDisplayName) {
    return normalizedDisplayName
  }

  if (normalizedHandle) {
    return `@${normalizedHandle}`
  }

  return null
}

function buildInviteText(
  displayName: string | null | undefined,
  handle: string | null | undefined,
  inviteUrl: string,
  options?: {
    serverName?: string;
    targetedNames?: string[];
  }
): string {
  const targetedNames = options?.targetedNames ?? []
  const inviterLabel = formatInviterLabel(displayName, handle)
  const intro = targetedNames.length > 0
    ? inviterLabel
      ? `Hey ${formatNameList(targetedNames)}, ${inviterLabel} invited you to Game's Up${options?.serverName ? ` through ${options.serverName}` : ''}.`
      : `Hey ${formatNameList(targetedNames)}, someone invited you to Game's Up${options?.serverName ? ` through ${options.serverName}` : ''}.`
    : inviterLabel
      ? `${inviterLabel} invited you to Game's Up.`
      : "Join me on Game's Up."

  const body = targetedNames.length > 0
    ? 'Open the app to compare libraries, add each other as friends, and post when you want to play.'
    : 'Use it to find players, compare libraries, and post when you want to play.'

  return `${intro}\n\n${body}\n\n${inviteUrl}`
}

type InviteServer = DiscordServerPreferencesResponse['servers'][number]

export type DashboardInviteOverviewProps = {
  inviteUrl: string | null;
  selectedDiscoveryServers: InviteServer[];
  activeInviteServer: InviteServer | null;
  onSelectInviteServer: (serverId: string) => void;
  inviteMemberQuery: string;
  onInviteMemberQueryChange: (value: string) => void;
  inviteMembersLoading: boolean;
  inviteMembersNotice: Notice | null;
  inviteMembers: DiscordServerMembersResponse['members'];
  filteredInviteMembers: DiscordServerMembersResponse['members'];
  selectedInviteUserIds: string[];
  onToggleInviteUser: (userId: string) => void;
  onRetryInviteMembers: () => void;
  inviteSending: boolean;
  onSendBotInvites: () => Promise<void>;
  onCopyInvite: () => Promise<void>;
  canShareInvite: boolean;
  onShareInvite: () => Promise<void>;
  inviteSendSummary: SendDiscordServerInvitesResponse | null;
}

export function useDashboardInvites({
  buildApiUrl,
  session,
  isSignedIn,
  availableDiscoveryServers,
  setActionNotice
}: {
  buildApiUrl: (path: string) => string;
  session: AuthSessionResponse | null;
  isSignedIn: boolean;
  availableDiscoveryServers: InviteServer[];
  setActionNotice: Dispatch<SetStateAction<Notice | null>>;
}) {
  const [inviteServerId, setInviteServerId] = useState<string | null>(null)
  const [selectedInviteUserIds, setSelectedInviteUserIds] = useState<string[]>([])
  const [inviteMembersState, setInviteMembersState] = useState<DiscordServerMembersResponse | null>(null)
  const [inviteMembersLoading, setInviteMembersLoading] = useState(false)
  const [inviteMembersNotice, setInviteMembersNotice] = useState<Notice | null>(null)
  const [inviteMemberQuery, setInviteMemberQuery] = useState('')
  const [inviteMembersReloadVersion, setInviteMembersReloadVersion] = useState(0)
  const [inviteSending, setInviteSending] = useState(false)
  const [inviteSendSummary, setInviteSendSummary] = useState<SendDiscordServerInvitesResponse | null>(null)

  const inviteUrl = resolveInviteUrl(typeof window === 'undefined' ? null : window.location.href)
  const selectedDiscoveryServers = availableDiscoveryServers.filter((server) => server.selected)
  const activeInviteServer = selectedDiscoveryServers.find((server) => server.id === inviteServerId) ?? selectedDiscoveryServers[0] ?? null
  const activeInviteServerId = activeInviteServer?.id ?? null
  const inviteMembers = inviteMembersState?.members ?? emptyInviteMembers
  const inviteableInviteUserIds = useMemo(
    () => new Set(inviteMembers.filter((member) => !member.isAppUser).map((member) => member.id)),
    [inviteMembers]
  )
  const filteredInviteMembers = inviteMemberQuery.trim().length === 0
    ? inviteMembers
    : inviteMembers.filter((member) => {
        const normalizedQuery = inviteMemberQuery.trim().toLowerCase()
        return [member.displayName, member.profileDisplayName, member.username, member.appDisplayName, member.appHandle]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(normalizedQuery))
      })
  const selectedInviteUsers = inviteMembers.filter((member) => selectedInviteUserIds.includes(member.id) && !member.isAppUser)
  const inviteText = inviteUrl
    ? buildInviteText(session?.user?.displayName ?? null, session?.user?.handle ?? null, inviteUrl, {
        serverName: inviteMembersState?.serverName ?? activeInviteServer?.name,
        targetedNames: selectedInviteUsers.map((member) => member.displayName)
      })
    : null
  const canShareInvite = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  useEffect(() => {
    if (selectedDiscoveryServers.length === 0) {
      if (inviteServerId !== null) {
        setInviteServerId(null)
      }
      return
    }

    if (!selectedDiscoveryServers.some((server) => server.id === inviteServerId)) {
      const firstSelectedServer = selectedDiscoveryServers[0]

      if (firstSelectedServer) {
        setInviteServerId(firstSelectedServer.id)
      }
    }
  }, [inviteServerId, selectedDiscoveryServers])

  useEffect(() => {
    if (!isSignedIn || !activeInviteServerId) {
      setInviteMembersState(null)
      setInviteMembersNotice(null)
      setInviteMembersLoading(false)
      setSelectedInviteUserIds([])
      setInviteMemberQuery('')
      setInviteSendSummary(null)
      return
    }

    let cancelled = false
    setInviteMembersLoading(true)
    setInviteMembersNotice(null)
    setInviteMembersState(null)
    setSelectedInviteUserIds([])
    setInviteMemberQuery('')
    setInviteSendSummary(null)

    void (async () => {
      try {
        const response = await fetch(buildApiUrl(`/api/discord-servers/me/${activeInviteServerId}/members`), {
          credentials: 'include'
        })
        const responseJson = await response.json() as DiscordServerMembersResponse | { error?: string }

        if (cancelled) {
          return
        }

        if (!response.ok) {
          throw new Error(extractErrorMessage(responseJson, 'Unable to load Discord members right now.'))
        }

        setInviteMembersState(discordServerMembersResponseSchema.parse(responseJson))
      } catch (error) {
        if (cancelled) {
          return
        }

        setInviteMembersNotice({
          tone: 'danger',
          message: error instanceof Error ? error.message : 'Unable to load Discord members right now.'
        })
      } finally {
        if (!cancelled) {
          setInviteMembersLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [activeInviteServerId, buildApiUrl, inviteMembersReloadVersion, isSignedIn])

  const handleCopyInvite = useCallback(async () => {
    setActionNotice(null)

    if (!inviteText) {
      setActionNotice({
        tone: 'danger',
        message: 'This build does not have a public invite link available right now.'
      })
      return
    }

    if (!navigator.clipboard?.writeText) {
      setActionNotice({
        tone: 'danger',
        message: 'Clipboard access is not available here. Use the invite link field to copy it manually.'
      })
      return
    }

    try {
      await navigator.clipboard.writeText(inviteText)
      setActionNotice({
        tone: 'success',
        message: 'Invite text copied. Send it wherever you want.'
      })
    } catch (error) {
      setActionNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Unable to copy the invite right now.'
      })
    }
  }, [inviteText, setActionNotice])

  const handleShareInvite = useCallback(async () => {
    setActionNotice(null)

    if (!inviteUrl || !inviteText) {
      setActionNotice({
        tone: 'danger',
        message: 'This build does not have a public invite link available right now.'
      })
      return
    }

    if (typeof navigator.share !== 'function') {
      await handleCopyInvite()
      return
    }

    try {
      await navigator.share({
        title: "Join me on Game's Up",
        text: inviteText,
        url: inviteUrl
      })
      setActionNotice({
        tone: 'success',
        message: 'Invite ready to send.'
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }

      setActionNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Unable to share the invite right now.'
      })
    }
  }, [handleCopyInvite, inviteText, inviteUrl, setActionNotice])

  const handleSendBotInvites = useCallback(async () => {
    setActionNotice(null)
    setInviteSendSummary(null)

    const inviteableSelectedInviteUserIds = selectedInviteUserIds.filter((memberId) => inviteableInviteUserIds.has(memberId))

    if (!activeInviteServerId || inviteableSelectedInviteUserIds.length === 0 || !inviteUrl) {
      setActionNotice({
        tone: 'danger',
        message: 'Choose a server, select at least one Discord member, and make sure the invite link is available first.'
      })
      return
    }

    setInviteSending(true)

    try {
      const response = await fetch(buildApiUrl(`/api/discord-servers/me/${activeInviteServerId}/invites`), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          inviteUrl,
          memberIds: inviteableSelectedInviteUserIds
        })
      })

      const responseJson = await response.json() as SendDiscordServerInvitesResponse | { error?: string }

      if (!response.ok) {
        throw new Error(extractErrorMessage(responseJson, 'Unable to send invites right now.'))
      }

      const parsed = sendDiscordServerInvitesResponseSchema.parse(responseJson)
      const failedRecipients = parsed.results.filter((result) => result.status === 'failed')

      setInviteSendSummary(parsed)
      setActionNotice({
        tone: failedRecipients.length === 0 ? 'success' : 'neutral',
        message: failedRecipients.length === 0
          ? `Sent ${parsed.sentCount} invite${parsed.sentCount === 1 ? '' : 's'} from ${parsed.serverName}.`
          : `Sent ${parsed.sentCount} invite${parsed.sentCount === 1 ? '' : 's'} from ${parsed.serverName}. ${parsed.failedCount} failed${failedRecipients[0]?.error ? `: ${failedRecipients[0].displayName} (${failedRecipients[0].error})` : '.'}`
      })
    } catch (error) {
      setActionNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Unable to send invites right now.'
      })
      setInviteSendSummary(null)
    } finally {
      setInviteSending(false)
    }
  }, [activeInviteServerId, buildApiUrl, inviteUrl, inviteableInviteUserIds, selectedInviteUserIds, setActionNotice])

  const handleToggleInviteUser = useCallback((userId: string) => {
    if (!inviteableInviteUserIds.has(userId)) {
      return
    }

    setInviteSendSummary(null)
    setSelectedInviteUserIds((current) => (current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]))
  }, [inviteableInviteUserIds])

  const handleRetryInviteMembers = useCallback(() => {
    setInviteMembersReloadVersion((current) => current + 1)
  }, [])

  const handleSelectInviteServer = useCallback((serverId: string) => {
    setInviteServerId(serverId)
  }, [])

  const handleInviteMemberQueryChange = useCallback((value: string) => {
    setInviteMemberQuery(value)
  }, [])

  const inviteOverviewProps: DashboardInviteOverviewProps = {
    inviteUrl,
    selectedDiscoveryServers,
    activeInviteServer,
    onSelectInviteServer: handleSelectInviteServer,
    inviteMemberQuery,
    onInviteMemberQueryChange: handleInviteMemberQueryChange,
    inviteMembersLoading,
    inviteMembersNotice,
    inviteMembers,
    filteredInviteMembers,
    selectedInviteUserIds,
    onToggleInviteUser: handleToggleInviteUser,
    onRetryInviteMembers: handleRetryInviteMembers,
    inviteSending,
    onSendBotInvites: handleSendBotInvites,
    onCopyInvite: handleCopyInvite,
    canShareInvite,
    onShareInvite: handleShareInvite,
    inviteSendSummary
  }

  return {
    inviteOverviewProps
  }
}