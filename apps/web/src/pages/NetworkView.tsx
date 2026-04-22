import { useState } from 'react'
import { Card, Stack, Typography } from '@mui/joy'
import { DashboardApiIssueCard } from '../components/dashboard/DashboardApiIssueCard'
import { DashboardModal } from '../components/dashboard/DashboardModal'
import { DiscordSignInCard } from '../components/dashboard/EmptyStateCard'
import { useDashboardContext } from '../contexts/useDashboardContext'
import { DiscoveryServersSection, InviteUsersCard } from './OverviewView'

export function NetworkView() {
  const { overviewViewProps } = useDashboardContext()
  const {
    error,
    isSignedIn,
    discordEnabled,
    discordBotInstallUrl,
    availableDiscoveryServers,
    hasSyncedDiscordServers,
    serverPreferencePendingId,
    onDiscordLogin,
    onToggleDiscordServer,
    inviteUrl,
    selectedDiscoveryServers,
    activeInviteServer,
    onSelectInviteServer,
    inviteMemberQuery,
    onInviteMemberQueryChange,
    inviteMembersLoading,
    inviteMembersNotice,
    inviteMembers,
    filteredInviteMembers,
    selectedInviteUserIds,
    onToggleInviteUser,
    onRetryInviteMembers,
    inviteSending,
    onSendBotInvites,
    inviteSendSummary
  } = overviewViewProps
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)

  if (error) {
    return <DashboardApiIssueCard error={error} />
  }

  const handleOpenInviteServer = (serverId: string) => {
    onSelectInviteServer(serverId)
    setIsInviteModalOpen(true)
  }

  return (
    <>
      <Stack spacing={3}>
        {isSignedIn ? (
          <DiscoveryServersSection
            discordBotInstallUrl={discordBotInstallUrl}
            availableDiscoveryServers={availableDiscoveryServers}
            hasSyncedServers={hasSyncedDiscordServers}
            serverPreferencePendingId={serverPreferencePendingId}
            onToggleDiscordServer={onToggleDiscordServer}
            onOpenInviteServer={handleOpenInviteServer}
          />
        ) : (
          <Stack spacing={1.5}>
            <Card variant="soft" sx={{ p: 3 }}>
              <Stack spacing={1.5}>
                <Typography level="title-lg">Sign in to manage your network</Typography>
                <Typography level="body-md" sx={{ color: 'neutral.300' }}>
                  Network management becomes available after Discord sign-in. Once you are signed in, you can select Discord servers, browse members, and invite people into Game&apos;s Up.
                </Typography>
              </Stack>
            </Card>
            <DiscordSignInCard disabled={!discordEnabled} onClick={() => void onDiscordLogin()} />
          </Stack>
        )}
      </Stack>

      {isSignedIn ? (
        <DashboardModal open={isInviteModalOpen} onClose={() => setIsInviteModalOpen(false)} width="min(96vw, 920px)">
          <InviteUsersCard
            onClose={() => setIsInviteModalOpen(false)}
            inviteUrl={inviteUrl}
            selectedDiscoveryServers={selectedDiscoveryServers}
            activeInviteServer={activeInviteServer}
            onSelectInviteServer={onSelectInviteServer}
            inviteMemberQuery={inviteMemberQuery}
            onInviteMemberQueryChange={onInviteMemberQueryChange}
            inviteMembersLoading={inviteMembersLoading}
            inviteMembersNotice={inviteMembersNotice}
            inviteMembers={inviteMembers}
            filteredInviteMembers={filteredInviteMembers}
            selectedInviteUserIds={selectedInviteUserIds}
            onToggleInviteUser={onToggleInviteUser}
            onRetryInviteMembers={onRetryInviteMembers}
            inviteSending={inviteSending}
            onSendBotInvites={onSendBotInvites}
            inviteSendSummary={inviteSendSummary}
          />
        </DashboardModal>
      ) : null}
    </>
  )
}