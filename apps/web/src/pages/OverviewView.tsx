import { Box, Button, Card, Chip, Input, Link, Sheet, Stack, Typography } from '@mui/joy'
import type {
  AuthSessionResponse,
  DiscordServerMembersResponse,
  DiscordServerPreferencesResponse,
  SendDiscordServerInvitesResponse
} from '@game-is-up/shared'
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
          <Typography level="body-md">
            Signed in as {signedInUser.displayName} ({signedInUser.handle})
          </Typography>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            <Chip color="success">{signedInUser.authProvider}</Chip>
            {signedInUser.email ? <Chip variant="outlined">{signedInUser.email}</Chip> : null}
          </Stack>
          <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
            Your account is ready to sync discovery servers, build your library, and share play plans.
          </Typography>
          <Button variant="outlined" color="neutral" onClick={() => void onLogout()}>
            Sign out
          </Button>
        </Stack>
      ) : (
        <Stack spacing={1.5}>
          <Typography level="body-md">
            Sign in with Discord to connect your account, choose shared servers, and start finding people to play with.
          </Typography>
          <Button color="primary" disabled={!discordEnabled} onClick={() => void onDiscordLogin()}>
            Sign in with Discord
          </Button>
          {hasGatedScopeWarning ? (
            <Typography level="body-sm" sx={{ color: 'warning.300' }}>
              Direct Discord friend import is still waiting on Discord approval, so discovery currently starts from shared servers and in-app friends.
            </Typography>
          ) : null}
        </Stack>
      )}
    </Card>
  )
}

function DiscoveryGuideCard({ isSignedIn }: { isSignedIn: boolean }) {
  return (
    <Card variant="soft" sx={{ p: 3 }}>
      <Stack spacing={1.25}>
        <Typography level="title-lg">How discovery works</Typography>
        <Typography level="body-md" sx={{ color: 'neutral.300' }}>
          Discovery currently runs on selected mutual Discord servers plus in-app friends. Direct Discord friend import is designed in, but it cannot be activated until Discord approves relationships.read.
        </Typography>
        <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
          Shared Discord servers do not reveal everyone in those servers. You only see people who also signed into Game Is Up.
        </Typography>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
          <Chip color="primary" variant="soft">
            Mutual servers active
          </Chip>
          <Chip color="success" variant="soft">
            In-app friends active
          </Chip>
          <Chip color="warning" variant="outlined">
            Discord friends pending approval
          </Chip>
        </Stack>
        {isSignedIn ? (
          <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
            Pick the communities you want to use for discovery below. Only people who also joined Game Is Up will appear.
          </Typography>
        ) : (
          <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
            Sign in with Discord to sync mutual servers and start discovery.
          </Typography>
        )}
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
      <Typography level="h2">Discovery servers</Typography>
      <Typography level="body-md" sx={{ color: 'neutral.300' }}>
        Choose which Discord servers should count for mutual-user discovery. Only servers where the bot is present can be used for discovery and invite browsing.
      </Typography>
      <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
        Server counts only include other Game Is Up users. People in Discord who have never opened the app will not appear here yet.
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
                      ? `${server.knownUserCount} other app user${server.knownUserCount === 1 ? '' : 's'} currently share this server.`
                      : 'No other app users from this server are known yet.'}
                  </Typography>
                </Stack>
                <Button
                  size="sm"
                  variant={server.selected ? 'solid' : 'outlined'}
                  color={server.selected ? 'primary' : 'neutral'}
                  disabled={serverPreferencePendingId === server.id}
                  onClick={() => void onToggleDiscordServer(server.id, !server.selected)}
                >
                  {serverPreferencePendingId === server.id
                    ? 'Saving...'
                    : server.selected
                      ? 'Used to find players'
                      : 'Use to find players'}
                </Button>
              </Stack>
            </Card>
          ))}
        </Stack>
      ) : hasSyncedServers ? (
        <EmptyStateCard
          title="No bot-enabled servers available"
          body="Your Discord servers are synced, but none currently have the Game Is Up bot installed. Install the bot in one shared server to use server-based player finding and member invites."
          chips={['Bot required for discovery', 'Synced memberships found', 'Install bot in a shared server']}
        />
      ) : (
        <EmptyStateCard
          title="No Discord servers synced yet"
          body="Your current session does not have any synced Discord server memberships yet. Sign out and sign back in with Discord to grant server access and refresh the list."
          chips={['Discord OAuth', 'Guild sync on sign-in', 'Discovery filters by selected servers']}
        />
      )}
    </Stack>
  )
}

function InviteUsersCard({
  inviteUrl,
  selectedDiscoveryServers,
  activeInviteServer,
  onSelectInviteServer,
  inviteMemberQuery,
  onInviteMemberQueryChange,
  inviteMembersLoading,
  inviteMembersNotice,
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
  inviteUrl: string | null;
  selectedDiscoveryServers: DiscoveryServer[];
  activeInviteServer: DiscoveryServer | null;
  onSelectInviteServer: (serverId: string) => void;
  inviteMemberQuery: string;
  onInviteMemberQueryChange: (value: string) => void;
  inviteMembersLoading: boolean;
  inviteMembersNotice: Notice | null;
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
  return (
    <Card variant="soft" sx={{ p: 3 }}>
      <Stack spacing={2}>
        <Box>
          <Typography level="title-lg">Invite users from your servers</Typography>
          <Typography level="body-md" sx={{ color: 'neutral.300', mt: 0.75 }}>
            Choose one of your selected bot-enabled player-finding servers, browse its Discord members, and have the bot DM the people you want.
          </Typography>
        </Box>
        {inviteUrl ? (
          <Input
            value={inviteUrl}
            readOnly
            endDecorator={(
              <Link href={inviteUrl} target="_blank" rel="noreferrer">
                Open
              </Link>
            )}
          />
        ) : (
          <Card color="warning" variant="soft">
            <Typography level="body-sm">
              This build does not have a public invite link configured yet.
            </Typography>
          </Card>
        )}
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
                            <Box>
                              <Typography level="title-sm">{member.displayName}</Typography>
                              <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
                                @{member.username}
                                {member.isAppUser && member.appHandle ? ` • Game Is Up: @${member.appHandle}` : ''}
                              </Typography>
                            </Box>
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
                              <Chip size="sm" color={member.isAppUser ? 'success' : 'neutral'} variant={member.isAppUser ? 'soft' : 'outlined'}>
                                {member.isAppUser ? 'On Game Is Up' : 'Discord only'}
                              </Chip>
                              <Button
                                size="sm"
                                variant={isSelected ? 'solid' : 'outlined'}
                                color={isSelected ? 'primary' : 'neutral'}
                                onClick={() => onToggleInviteUser(member.id)}
                              >
                                {isSelected ? 'Selected' : 'Select'}
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
          <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
            Turn on at least one server where the bot is present to browse and target specific members.
          </Typography>
        )}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
          <Button
            color="primary"
            disabled={!inviteUrl || selectedInviteUserIds.length === 0 || inviteSending}
            onClick={() => void onSendBotInvites()}
          >
            {inviteSending ? 'Sending bot invites...' : 'Send bot invites'}
          </Button>
          <Button variant="outlined" color="neutral" disabled={!inviteUrl} onClick={() => void onCopyInvite()}>
            Copy fallback message
          </Button>
          {canShareInvite ? (
            <Button variant="outlined" color="neutral" disabled={!inviteUrl} onClick={() => void onShareInvite()}>
              Share fallback message
            </Button>
          ) : null}
        </Stack>
        <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
          The bot will DM the selected Discord members directly. If a DM fails because the user blocks bot DMs, you can still use the fallback copy/share actions.
        </Typography>
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
      </Stack>
    </Card>
  )
}

function OverviewViewContent({
  session,
  discordEnabled,
  hasDiscordScopeWarning,
  isSignedIn,
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
  return (
    <Stack spacing={3}>
      <AccountCard
        session={session}
        discordEnabled={discordEnabled}
        hasGatedScopeWarning={hasDiscordScopeWarning}
        onLogout={onLogout}
        onDiscordLogin={onDiscordLogin}
      />
      <DiscoveryGuideCard isSignedIn={isSignedIn} />

      {isSignedIn ? (
        <DiscoveryServersSection
          availableDiscoveryServers={availableDiscoveryServers}
          hasSyncedServers={hasSyncedDiscordServers}
          serverPreferencePendingId={serverPreferencePendingId}
          onToggleDiscordServer={onToggleDiscordServer}
        />
      ) : null}

      {isSignedIn ? (
        <InviteUsersCard
          inviteUrl={inviteUrl}
          selectedDiscoveryServers={selectedDiscoveryServers}
          activeInviteServer={activeInviteServer}
          onSelectInviteServer={onSelectInviteServer}
          inviteMemberQuery={inviteMemberQuery}
          onInviteMemberQueryChange={onInviteMemberQueryChange}
          inviteMembersLoading={inviteMembersLoading}
          inviteMembersNotice={inviteMembersNotice}
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
      ) : null}
    </Stack>
  )
}

export function OverviewView() {
  const { overviewViewProps } = useDashboardContext()

  return <OverviewViewContent {...overviewViewProps} />
}