import { useState } from 'react'
import { Avatar, Box, Button, Card, Chip, DialogContent, DialogTitle, Input, Sheet, Stack, Typography } from '@mui/joy'
import type {
  AuthSessionResponse,
  DiscordServerMembersResponse,
  DiscordServerPreferencesResponse,
  SendDiscordServerInvitesResponse
} from '@game-is-up/shared'
import { DashboardModal } from '../components/dashboard/DashboardModal'
import { DashboardModalActionBar } from '../components/dashboard/DashboardModalActionBar'
import { EmptyStateCard } from '../components/dashboard/EmptyStateCard'
import { useDashboardContext } from '../contexts/useDashboardContext'
import type { Notice } from '../components/dashboard/types'

type DiscoveryServer = DiscordServerPreferencesResponse['servers'][number]
type InviteMember = DiscordServerMembersResponse['members'][number]

function AccountCard({
  session,
  discordEnabled,
  hasGatedScopeWarning,
  onLogout,
  onDiscordLogin
}: {
  session: AuthSessionResponse | null;
  discordEnabled: boolean;
  hasGatedScopeWarning: boolean;
  onLogout: () => Promise<void>;
  onDiscordLogin: () => Promise<void>;
}) {
  const signedInUser = session?.authenticated ? session.user : null

  return (
    <Card variant="soft" sx={{ p: 3 }}>
      <Typography level="title-lg" sx={{ mb: 1 }}>
        Account
      </Typography>
      {signedInUser ? (
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Avatar
              src={signedInUser.avatarUrl ?? undefined}
              alt={signedInUser.displayName}
              size="lg"
              variant="soft"
            />
            <Stack spacing={0.25}>
              <Typography level="title-md">{signedInUser.displayName}</Typography>
              <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                @{signedInUser.handle}
              </Typography>
            </Stack>
          </Stack>
          {signedInUser.email ? (
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
              <Chip variant="outlined">{signedInUser.email}</Chip>
            </Stack>
          ) : null}
          <Button variant="outlined" color="neutral" onClick={() => void onLogout()}>
            Sign out
          </Button>
        </Stack>
      ) : (
        <Stack spacing={1.5}>
          <Typography level="body-md">
            Sign in with Discord to build your network from shared servers and keep it current.
          </Typography>
          <Button color="primary" disabled={!discordEnabled} onClick={() => void onDiscordLogin()}>
            Sign in with Discord
          </Button>
          {hasGatedScopeWarning ? (
            <Typography level="body-sm" sx={{ color: 'warning.300' }}>
              Game's Up builds your network from the Discord servers you choose here. After that, add the friends you want to keep track of in the app.
            </Typography>
          ) : null}
        </Stack>
      )}
    </Card>
  )
}

function QuickStartCard() {
  return (
    <Card variant="soft" sx={{ p: 3 }}>
      <Stack spacing={1.5}>
        <Box>
          <Typography level="title-lg">Quick start</Typography>
        </Box>
        <Stack spacing={1}>
          <Sheet variant="outlined" sx={{ p: 1.5, borderRadius: 'md', backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
            <Typography level="title-sm">1. Sign in</Typography>
            <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
              Sign in using your Discord account.
            </Typography>
          </Sheet>
          <Sheet variant="outlined" sx={{ p: 1.5, borderRadius: 'md', backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
            <Typography level="title-sm">2. Build your network</Typography>
            <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
              Add the Discord servers where your wider group is active. If one isn't shown, invite the bot there first.
            </Typography>
          </Sheet>
          <Sheet variant="outlined" sx={{ p: 1.5, borderRadius: 'md', backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
            <Typography level="title-sm">3. Build your library</Typography>
            <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
              Add games to your library so that you can be matched with other players in your network.
            </Typography>
          </Sheet>
          <Sheet variant="outlined" sx={{ p: 1.5, borderRadius: 'md', backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
            <Typography level="title-sm">4. Add friends</Typography>
            <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
              Browse the people in your network, then add the friends you want to keep track of most.
            </Typography>
          </Sheet>
          <Sheet variant="outlined" sx={{ p: 1.5, borderRadius: 'md', backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
            <Typography level="title-sm">5. Send a call to play</Typography>
            <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
              Let others know you're ready to play and invite them to join.
            </Typography>
          </Sheet>
        </Stack>
      </Stack>
    </Card>
  )
}

function DiscoveryServersSection({
  availableDiscoveryServers,
  hasSyncedServers,
  serverPreferencePendingId,
  onToggleDiscordServer
}: {
  availableDiscoveryServers: DiscoveryServer[];
  hasSyncedServers: boolean;
  serverPreferencePendingId: string | null;
  onToggleDiscordServer: (serverId: string, nextSelected: boolean) => Promise<void>;
}) {
  return (
    <Stack spacing={2}>
      <Typography level="h2">Your network</Typography>
      <Typography level="body-md" sx={{ color: 'neutral.300' }}>
        Use Discord servers where your friends and other players are active to widen your network.
      </Typography>
      {availableDiscoveryServers.length > 0 ? (
        <Stack spacing={1.5}>
          {availableDiscoveryServers.map((server) => (
            <Card key={server.id} variant="soft" sx={{ p: 2.5 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
                <Stack spacing={0.5}>
                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }} alignItems="center">
                    <Typography level="title-md">{server.name}</Typography>
                    <Chip size="sm" color="success" variant="soft">
                      Bot present
                    </Chip>
                  </Stack>
                  <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
                    {server.knownUserCount > 0
                      ? `${server.knownUserCount} other members${server.knownUserCount === 1 ? '' : 's'} currently in your network via this server.`
                      : 'No other members from this server are in your network yet.'}
                  </Typography>
                </Stack>
                <Button
                  size="sm"
                  variant={server.selected ? 'outlined' : 'solid'}
                  color={server.selected ? 'neutral' : 'primary'}
                  disabled={serverPreferencePendingId === server.id}
                  onClick={() => void onToggleDiscordServer(server.id, !server.selected)}
                >
                  {serverPreferencePendingId === server.id
                    ? 'Saving...'
                    : server.selected
                      ? 'Remove from your network'
                      : 'Add to your network'}
                </Button>
              </Stack>
            </Card>
          ))}
        </Stack>
      ) : hasSyncedServers ? (
        <EmptyStateCard
          title="No servers with the Game's Up bot available"
          body="You have Discord servers added to your network, but the bot is not running or is not installed on any of them."
        />
      ) : (
        <EmptyStateCard
          title="No Discord servers added yet"
          body="You have not added any Discord servers yet."
        />
      )}
    </Stack>
  )
}

function InviteUsersCard({
  onClose,
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
  onCopyInvite,
  canShareInvite,
  onShareInvite,
  inviteSendSummary
}: {
  onClose: () => void;
  inviteUrl: string | null;
  selectedDiscoveryServers: DiscoveryServer[];
  activeInviteServer: DiscoveryServer | null;
  onSelectInviteServer: (serverId: string) => void;
  inviteMemberQuery: string;
  onInviteMemberQueryChange: (value: string) => void;
  inviteMembersLoading: boolean;
  inviteMembersNotice: Notice | null;
  inviteMembers: InviteMember[];
  filteredInviteMembers: InviteMember[];
  selectedInviteUserIds: string[];
  onToggleInviteUser: (userId: string) => void;
  onRetryInviteMembers: () => void;
  inviteSending: boolean;
  onSendBotInvites: () => Promise<void>;
  onCopyInvite: () => Promise<void>;
  canShareInvite: boolean;
  onShareInvite: () => Promise<void>;
  inviteSendSummary: SendDiscordServerInvitesResponse | null;
}) {
  const inviteMemberAvatarById = new Map(inviteMembers.map((member) => [member.id, member.avatarUrl]))

  return (
    <>
      <DialogTitle sx={{ pr: 6 }}>Invite people from selected servers</DialogTitle>
      <DialogContent
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          pr: 0.5,
          minHeight: 0,
          overflow: 'auto',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        <Stack spacing={1.5}>
          <Typography level="body-md" sx={{ color: 'neutral.300' }}>
            Choose a server, then pick members for the bot to send an invite message to.
          </Typography>
        </Stack>

        {selectedDiscoveryServers.length > 0 ? (
          <Stack spacing={1.5}>
            <Box>
              <Typography level="body-sm" sx={{ color: 'neutral.300', mb: 0.75 }}>
                Pick a server
              </Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                {selectedDiscoveryServers.map((server) => (
                  <Button
                    key={server.id}
                    size="sm"
                    variant={activeInviteServer?.id === server.id ? 'solid' : 'outlined'}
                    color={activeInviteServer?.id === server.id ? 'primary' : 'neutral'}
                    onClick={() => onSelectInviteServer(server.id)}
                  >
                    {server.name}
                  </Button>
                ))}
              </Stack>
            </Box>
            {activeInviteServer ? (
              <Stack spacing={1.25}>
                <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                  Browse members in {activeInviteServer.name}
                </Typography>
                <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                  People who already joined Game's Up are shown for context, but only members who have not joined yet can be invited.
                </Typography>
                <Input
                  placeholder="Search Discord members"
                  value={inviteMemberQuery}
                  onChange={(event) => onInviteMemberQueryChange(event.target.value)}
                />
                {inviteMembersLoading ? (
                  <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
                    Loading Discord members...
                  </Typography>
                ) : inviteMembersNotice ? (
                  <Card color={inviteMembersNotice.tone} variant="soft">
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
                      <Typography level="body-sm">{inviteMembersNotice.message}</Typography>
                      <Button size="sm" variant="outlined" color="neutral" onClick={onRetryInviteMembers}>
                        Retry
                      </Button>
                    </Stack>
                  </Card>
                ) : filteredInviteMembers.length > 0 ? (
                  <Stack spacing={1} sx={{ maxHeight: 320, overflowY: 'auto', pr: 0.5 }}>
                    {filteredInviteMembers.map((member) => {
                      const isSelected = selectedInviteUserIds.includes(member.id)
                      const canInviteMember = !member.isAppUser

                      return (
                        <Sheet
                          key={member.id}
                          variant="outlined"
                          sx={{
                            p: 1.25,
                            borderRadius: 'md',
                            backgroundColor: isSelected ? 'rgba(20, 136, 106, 0.14)' : 'transparent'
                          }}
                        >
                          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
                            <Stack direction="row" spacing={1.25} alignItems="center">
                              <Avatar src={member.avatarUrl ?? undefined} alt={member.displayName} size="md" variant="soft" />
                              <Box>
                                <Typography level="title-sm">{member.displayName}</Typography>
                                <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
                                  @{member.username}
                                  {member.isAppUser && member.appHandle ? ` • Game's Up: @${member.appHandle}` : ''}
                                </Typography>
                              </Box>
                            </Stack>
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
                              <Chip size="sm" color={member.isAppUser ? 'success' : 'neutral'} variant={member.isAppUser ? 'soft' : 'outlined'}>
                                {member.isAppUser ? "On Game's Up" : "Not on Game's Up"}
                              </Chip>
                              <Button
                                size="sm"
                                variant={canInviteMember && isSelected ? 'solid' : 'outlined'}
                                color={canInviteMember && isSelected ? 'primary' : 'neutral'}
                                disabled={!canInviteMember}
                                onClick={() => onToggleInviteUser(member.id)}
                              >
                                {member.isAppUser ? 'Already joined' : isSelected ? 'Selected' : 'Select'}
                              </Button>
                            </Stack>
                          </Stack>
                        </Sheet>
                      )
                    })}
                  </Stack>
                ) : inviteMemberQuery.trim().length > 0 ? (
                  <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
                    No server members match that search.
                  </Typography>
                ) : (
                  <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
                    No Discord members are available to browse for this server yet.
                  </Typography>
                )}
              </Stack>
            ) : null}
          </Stack>
        ) : (
          <Sheet variant="soft" sx={{ p: 1.5, borderRadius: 'md' }}>
            <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
              Add at least one server where the bot is present to browse and target specific members.
            </Typography>
          </Sheet>
        )}

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
          <Button variant="outlined" color="neutral" disabled={!inviteUrl} onClick={() => void onCopyInvite()}>
            Copy fallback message
          </Button>
          {canShareInvite ? (
            <Button variant="outlined" color="neutral" disabled={!inviteUrl} onClick={() => void onShareInvite()}>
              Share fallback message
            </Button>
          ) : null}
        </Stack>

        {inviteSendSummary ? (
          <Card color={inviteSendSummary.failedCount > 0 ? 'warning' : 'success'} variant="soft">
            <Stack spacing={1.25}>
              <Typography level="title-sm">
                Delivery summary: {inviteSendSummary.sentCount} sent, {inviteSendSummary.failedCount} failed
              </Typography>
              <Stack spacing={1}>
                {inviteSendSummary.results.map((result) => (
                  <Sheet
                    key={result.memberId}
                    variant="outlined"
                    sx={{
                      p: 1.25,
                      borderRadius: 'md',
                      backgroundColor: 'rgba(255, 255, 255, 0.02)'
                    }}
                  >
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
                      <Stack direction="row" spacing={1.25} alignItems="center">
                        <Avatar
                          src={inviteMemberAvatarById.get(result.memberId) ?? undefined}
                          alt={result.displayName}
                          size="md"
                          variant="soft"
                        />
                        <Box>
                          <Typography level="title-sm">{result.displayName}</Typography>
                          <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
                            @{result.username}
                          </Typography>
                          {result.error ? (
                            <Typography level="body-sm" sx={{ color: 'warning.300', mt: 0.5 }}>
                              {result.error}
                            </Typography>
                          ) : null}
                        </Box>
                      </Stack>
                      <Chip size="sm" color={result.status === 'sent' ? 'success' : 'warning'} variant={result.status === 'sent' ? 'soft' : 'outlined'}>
                        {result.status === 'sent' ? 'Sent' : 'Failed'}
                      </Chip>
                    </Stack>
                  </Sheet>
                ))}
              </Stack>
            </Stack>
          </Card>
        ) : null}
      </DialogContent>
      <DashboardModalActionBar
        cancelAction={(
          <Button size="lg" variant="outlined" color="neutral" onClick={onClose} sx={{ minHeight: 52 }}>
            Close
          </Button>
        )}
        primaryAction={(
          <Button
            size="lg"
            color="primary"
            disabled={!inviteUrl || selectedInviteUserIds.length === 0 || inviteSending}
            onClick={() => void onSendBotInvites()}
            sx={{ flex: 1, minHeight: 52, fontWeight: 700 }}
          >
            {inviteSending ? 'Sending bot invites...' : 'Send bot invites'}
          </Button>
        )}
      />
    </>
  )
}

function InviteUsersLauncherCard({
  discordBotInstallUrl,
  onOpen
}: {
  discordBotInstallUrl: string | null;
  onOpen: () => void;
}) {
  return (
    <Card variant="soft" sx={{ p: 3 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
        <Box sx={{ width: { xs: '100%', sm: 'auto' } }}>
          <Button color="primary" onClick={onOpen} sx={{ width: { xs: '100%', sm: 'auto' } }}>
            Invite from selected servers
          </Button>
        </Box>
        {discordBotInstallUrl ? (
          <Box sx={{ width: { xs: '100%', sm: 'auto' } }}>
            <Button
              component="a"
              href={discordBotInstallUrl}
              target="_blank"
              rel="noreferrer"
              variant="outlined"
              color="neutral"
              sx={{ width: { xs: '100%', sm: 'auto' } }}
            >
              Invite bot to a server
            </Button>
          </Box>
        ) : null}
      </Stack>
    </Card>
  )
}

function OverviewViewContent({
  session,
  discordEnabled,
  hasDiscordScopeWarning,
  isSignedIn,
  discordBotInstallUrl,
  availableDiscoveryServers,
  hasSyncedDiscordServers,
  serverPreferencePendingId,
  onLogout,
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
  onCopyInvite,
  canShareInvite,
  onShareInvite,
  inviteSendSummary
}: {
  session: AuthSessionResponse | null;
  discordEnabled: boolean;
  hasDiscordScopeWarning: boolean;
  isSignedIn: boolean;
  discordBotInstallUrl: string | null;
  availableDiscoveryServers: DiscoveryServer[];
  hasSyncedDiscordServers: boolean;
  serverPreferencePendingId: string | null;
  onLogout: () => Promise<void>;
  onDiscordLogin: () => Promise<void>;
  onToggleDiscordServer: (serverId: string, nextSelected: boolean) => Promise<void>;
  inviteUrl: string | null;
  selectedDiscoveryServers: DiscoveryServer[];
  activeInviteServer: DiscoveryServer | null;
  onSelectInviteServer: (serverId: string) => void;
  inviteMemberQuery: string;
  onInviteMemberQueryChange: (value: string) => void;
  inviteMembersLoading: boolean;
  inviteMembersNotice: Notice | null;
  inviteMembers: InviteMember[];
  filteredInviteMembers: InviteMember[];
  selectedInviteUserIds: string[];
  onToggleInviteUser: (userId: string) => void;
  onRetryInviteMembers: () => void;
  inviteSending: boolean;
  onSendBotInvites: () => Promise<void>;
  onCopyInvite: () => Promise<void>;
  canShareInvite: boolean;
  onShareInvite: () => Promise<void>;
  inviteSendSummary: SendDiscordServerInvitesResponse | null;
}) {
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)

  return (
    <>
      <Stack spacing={3}>
        <AccountCard
          session={session}
          discordEnabled={discordEnabled}
          hasGatedScopeWarning={hasDiscordScopeWarning}
          onLogout={onLogout}
          onDiscordLogin={onDiscordLogin}
        />
        <QuickStartCard />

        {isSignedIn ? (
          <DiscoveryServersSection
            availableDiscoveryServers={availableDiscoveryServers}
            hasSyncedServers={hasSyncedDiscordServers}
            serverPreferencePendingId={serverPreferencePendingId}
            onToggleDiscordServer={onToggleDiscordServer}
          />
        ) : null}

        {isSignedIn ? (
          <InviteUsersLauncherCard
            discordBotInstallUrl={discordBotInstallUrl}
            onOpen={() => setIsInviteModalOpen(true)}
          />
        ) : null}
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
            onCopyInvite={onCopyInvite}
            canShareInvite={canShareInvite}
            onShareInvite={onShareInvite}
            inviteSendSummary={inviteSendSummary}
          />
        </DashboardModal>
      ) : null}
    </>
  )
}

export function OverviewView() {
  const { overviewViewProps } = useDashboardContext()

  return <OverviewViewContent {...overviewViewProps} />
}