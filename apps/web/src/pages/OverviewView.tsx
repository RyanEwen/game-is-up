import { Avatar, Box, Button, Card, Chip, DialogContent, DialogTitle, Input, Sheet, Stack, Switch, Typography } from '@mui/joy'
import type {
  AuthSessionResponse,
  DiscordServerMembersResponse,
  DiscordServerPreferencesResponse,
  SendDiscordServerInvitesResponse
} from '@game-is-up/shared'
import { Link } from 'react-router-dom'
import { DiscordServerPicker } from '../components/dashboard/DiscordServerPicker'
import { DashboardModalActionBar } from '../components/dashboard/DashboardModalActionBar'
import { EmptyStateCard } from '../components/dashboard/EmptyStateCard'
import { SectionNav } from '../components/dashboard/SectionNav'
import { sectionScrollMarginTop } from '../components/dashboard/SectionNav.constants'
import { dashboardTabPaths, nestedInsetSurfaceSx } from '../components/dashboard/dashboardUtils'
import { useDashboardContext } from '../contexts/useDashboardContext'
import type { Notice } from '../components/dashboard/types'

type DiscoveryServer = DiscordServerPreferencesResponse['servers'][number]
type InviteMember = DiscordServerMembersResponse['members'][number]

function ServerAvatar({
  server,
  size = 'md'
}: {
  server: DiscoveryServer;
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <Avatar
      src={server.iconUrl ?? undefined}
      alt={server.name}
      size={size}
      variant="soft"
      sx={{
        bgcolor: server.iconUrl ? undefined : 'neutral.softBg',
        color: 'neutral.200',
        fontWeight: 700
      }}
    >
      {server.name.slice(0, 1).toUpperCase()}
    </Avatar>
  )
}

function normalizeInviteMemberName(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? ''
}

function hasDistinctInviteMemberName(left: string | null | undefined, right: string | null | undefined) {
  const normalizedLeft = normalizeInviteMemberName(left)
  const normalizedRight = normalizeInviteMemberName(right)

  return normalizedLeft.length > 0 && normalizedRight.length > 0 && normalizedLeft !== normalizedRight
}

function buildInviteMemberDetail(member: InviteMember) {
  const details: string[] = []

  if (hasDistinctInviteMemberName(member.displayName, member.profileDisplayName)) {
    details.push(`AKA ${member.profileDisplayName}`)
  }

  if (
    member.isAppUser
    && member.appDisplayName
    && hasDistinctInviteMemberName(member.displayName, member.appDisplayName)
    && !hasDistinctInviteMemberName(member.profileDisplayName, member.appDisplayName)
  ) {
    return details.join(' • ')
  }

  if (
    member.isAppUser
    && member.appDisplayName
    && hasDistinctInviteMemberName(member.displayName, member.appDisplayName)
    && hasDistinctInviteMemberName(member.profileDisplayName, member.appDisplayName)
  ) {
    details.push(`Game's Up: ${member.appDisplayName}`)
  }

  return details.join(' • ')
}

function AccountCard({
  session,
  discordEnabled,
  onLogout,
  onDiscordLogin
}: {
  session: AuthSessionResponse | null;
  discordEnabled: boolean;
  onLogout: () => Promise<void>;
  onDiscordLogin: () => Promise<void>;
}) {
  const signedInUser = session?.authenticated ? session.user : null

  return (
    <Card variant="soft" sx={{ p: 3 }}>
      {signedInUser ? (
        <Stack spacing={1.25}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={{ xs: 1.5, sm: 2 }}
            justifyContent="space-between"
            alignItems={{ xs: 'stretch', sm: 'center' }}
          >
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
              <Avatar
                src={signedInUser.avatarUrl ?? undefined}
                alt={signedInUser.displayName}
                size="lg"
                variant="soft"
              />
              <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                <Typography level="title-md">{signedInUser.displayName}</Typography>
                <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                  @{signedInUser.handle}
                </Typography>
              </Stack>
            </Stack>
            <Button
              variant="outlined"
              color="neutral"
              onClick={() => void onLogout()}
              sx={{ alignSelf: { xs: 'stretch', sm: 'auto' }, flexShrink: 0 }}
            >
              Sign out
            </Button>
          </Stack>
        </Stack>
      ) : (
        <Stack spacing={1.5}>
          <Typography level="body-md">
            Sign in with Discord to form your network from shared servers and keep it current.
          </Typography>
          <Button
            color="primary"
            disabled={!discordEnabled}
            onClick={() => void onDiscordLogin()}
            sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' } }}
          >
            Sign in with Discord
          </Button>
        </Stack>
      )}
    </Card>
  )
}

function QuickStartStepCard({
  title,
  body,
  tabLabel,
  to
}: {
  title: string;
  body: string;
  tabLabel?: string;
  to?: string;
}) {
  return (
    <Card variant="soft" sx={{ p: 3 }}>
      <Stack spacing={0.75} alignItems="flex-start">
        <Typography level="title-sm">{title}</Typography>
        <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
          {body}
        </Typography>
        {tabLabel && to ? (
          <Typography
            component={Link}
            to={to}
            level="body-xs"
            sx={{
              color: 'primary.200',
              textDecoration: 'none',
              '&:hover': { color: 'primary.100', textDecoration: 'underline' }
            }}
          >
            Open {tabLabel}
          </Typography>
        ) : null}
      </Stack>
    </Card>
  )
}

function QuickStartCard() {
  return (
    <Stack spacing={1}>
      <QuickStartStepCard
        title="1. Sign in"
        body="Sign in using your Discord account."
      />
      <QuickStartStepCard
        title="2. Form your network"
        body="Select the Discord servers where your friends and other players are active. If one isn't shown, invite the bot there first."
        tabLabel="Network"
        to={dashboardTabPaths.network}
      />
      <QuickStartStepCard
        title="3. Add friends"
        body="Add the friends you want to keep track of most from your network."
        tabLabel="Friends"
        to={dashboardTabPaths.friends}
      />
      <QuickStartStepCard
        title="4. Build your library"
        body="Add games to your library so that you can be matched with other players in your network."
        tabLabel="Library"
        to={dashboardTabPaths.library}
      />
      <QuickStartStepCard
        title="5. Discover shared games"
        body="Browse Discovery to find the people in your network who play the same games you do and see where your libraries overlap."
        tabLabel="Discovery"
        to={dashboardTabPaths.discovery}
      />
      <QuickStartStepCard
        title="6. Send a call to play"
        body="Choose what you want to play and let matching friends or other players in your network know you want to play, then invite them to join."
        tabLabel="Play"
        to={dashboardTabPaths.play}
      />
    </Stack>
  )
}

function WhatIsGamesUpCard() {
  return (
    <Card variant="soft" sx={{ p: 3 }}>
      <Stack spacing={2}>
        <Typography level="body-md" sx={{ color: 'neutral.200' }}>
          Game's Up is a web app that helps you find people who are interested in the same games as you.
        </Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
          <Sheet variant="outlined" sx={{ p: 2, borderRadius: 'lg', flex: 1, ...nestedInsetSurfaceSx }}>
            <Stack spacing={0.75}>
              <Typography level="title-sm">Shared-interest web app</Typography>
              <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
                Build your game library, form a network of friends and other players from your favorite Discord servers, then discover who is interested in the same games as you.
              </Typography>
            </Stack>
          </Sheet>
          <Sheet variant="outlined" sx={{ p: 2, borderRadius: 'lg', flex: 1, ...nestedInsetSurfaceSx }}>
            <Stack spacing={0.75}>
              <Typography level="title-sm">Discord coordination bot</Typography>
              <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
                The Discord bot helps coordinate sessions by delivering calls to play, surfacing shared interest, and following up with the right people when plans evolve.
              </Typography>
            </Stack>
          </Sheet>
        </Stack>
      </Stack>
    </Card>
  )
}

function InstallAppCard({
  installPrompt
}: {
  installPrompt: {
    label: string;
    pending: boolean;
    onInstall: () => void | Promise<void>;
  };
}) {
  return (
    <Card
      variant="soft"
      color="primary"
      sx={{
        p: { xs: 2, md: 2.5 },
        borderRadius: 'xl',
        border: '1px solid #245f74',
        background: 'linear-gradient(135deg, #173048, #16273a)',
        boxShadow: 'none'
      }}
    >
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        sx={{ alignItems: { xs: 'stretch', sm: 'center' }, justifyContent: 'space-between' }}
      >
        <Box>
          <Typography level="title-md" sx={{ color: 'primary.100', mb: 0.5 }}>
            Keep Game's Up on your home screen.
          </Typography>
          <Typography level="body-sm" sx={{ color: 'neutral.200' }}>
            Install it for faster launches and an app-like shell in supported browsers.
          </Typography>
        </Box>
        <Button
          size="md"
          color="primary"
          onClick={installPrompt.onInstall}
          loading={installPrompt.pending}
          sx={{ flexShrink: 0, minWidth: { sm: 150 } }}
        >
          {installPrompt.label}
        </Button>
      </Stack>
    </Card>
  )
}

export function DiscoveryServersSection({
  discordBotInstallUrl,
  availableDiscoveryServers,
  hasSyncedServers,
  serverPreferencePendingId,
  onToggleDiscordServer,
  onOpenInviteServer
}: {
  discordBotInstallUrl: string | null;
  availableDiscoveryServers: DiscoveryServer[];
  hasSyncedServers: boolean;
  serverPreferencePendingId: string | null;
  onToggleDiscordServer: (serverId: string, nextSelected: boolean) => Promise<void>;
  onOpenInviteServer: (serverId: string) => void;
}) {
  return (
    <Stack spacing={2}>
      <Typography level="h2">Your network</Typography>
      <Typography level="body-md" sx={{ color: 'neutral.300' }}>
        Select the Discord servers where your friends and other players are active to form your network.
      </Typography>
      {availableDiscoveryServers.length > 0 ? (
        <Stack spacing={1.5}>
          {availableDiscoveryServers.map((server) => {
            const toggleSwitch = (
              <Switch
                checked={server.selected}
                disabled={serverPreferencePendingId === server.id}
                onChange={(event) => void onToggleDiscordServer(server.id, event.target.checked)}
                slotProps={{
                  input: {
                    'aria-label': `${server.selected ? 'Deselect' : 'Select'} ${server.name} for your network`
                  }
                }}
                sx={{ flexShrink: 0, mt: { xs: 0.25, sm: 0 } }}
              />
            )

            const inviteButton = server.selected ? (
              <Button
                size="sm"
                color="primary"
                onClick={() => onOpenInviteServer(server.id)}
                sx={{ width: { xs: '100%', sm: 'auto' } }}
              >
                Invite members
              </Button>
            ) : null

            return (
              <Card key={server.id} variant="soft" sx={{ p: 2.5 }}>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={{ xs: 1.5, sm: 2 }}
                  justifyContent="space-between"
                  alignItems={{ xs: 'stretch', sm: 'center' }}
                >
                  <Stack direction="row" spacing={2} justifyContent="space-between" alignItems="flex-start" sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
                      <ServerAvatar server={server} />
                      <Stack spacing={0.5} sx={{ minWidth: 0, flex: 1 }}>
                        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }} alignItems="center">
                          <Typography level="title-md">{server.name}</Typography>
                          <Chip size="sm" color="success" variant="soft">
                            Bot present
                          </Chip>
                        </Stack>
                        <Typography level="body-sm" sx={{ color: 'neutral.400' }}>
                          {server.knownUserCount > 0
                            ? `${server.knownUserCount} member${server.knownUserCount === 1 ? '' : 's'} on Game's Up.`
                            : "No members on Game's Up yet."}
                        </Typography>
                      </Stack>
                    </Stack>
                    <Box sx={{ display: { xs: 'flex', sm: 'none' }, flexShrink: 0 }}>
                      {toggleSwitch}
                    </Box>
                  </Stack>

                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    justifyContent="flex-end"
                    sx={{ display: { xs: 'none', sm: 'flex' }, flexShrink: 0 }}
                  >
                    {inviteButton}
                    {toggleSwitch}
                  </Stack>

                  {server.selected ? (
                    <Box sx={{ display: { xs: 'block', sm: 'none' } }}>
                      {inviteButton}
                    </Box>
                  ) : null}
                </Stack>
              </Card>
            )
          })}
        </Stack>
      ) : hasSyncedServers ? (
        <EmptyStateCard
          title="No servers with the Game's Up bot available"
          body="You have selected Discord servers to form your network, but the bot is not running or is not installed on any of them."
        />
      ) : (
        <EmptyStateCard
          title="No Discord servers selected yet"
          body="You have not selected any Discord servers to form your network yet."
        />
      )}
      {discordBotInstallUrl ? (
        <Card variant="soft" sx={{ p: 2.5 }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={{ xs: 1.25, sm: 2 }}
            justifyContent="space-between"
            alignItems={{ xs: 'stretch', sm: 'center' }}
          >
            <Stack spacing={1.25} sx={{ flex: 1, minWidth: 0 }}>
              <Typography level="title-sm">Not seeing a server?</Typography>
              <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
                The Game's Up bot must be on the Discord servers you want to use for network discovery, member browsing, and invites.
              </Typography>
            </Stack>
            <Box sx={{ flexShrink: 0 }}>
              <Button
                component="a"
                href={discordBotInstallUrl}
                target="_blank"
                rel="noreferrer"
                variant="outlined"
                color="neutral"
                sx={{ width: { xs: '100%', sm: 'auto' } }}
              >
                Invite the bot to your server
              </Button>
            </Box>
          </Stack>
        </Card>
      ) : null}
    </Stack>
  )
}

export function InviteUsersCard({
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
  inviteSendSummary: SendDiscordServerInvitesResponse | null;
}) {
  const inviteMemberAvatarById = new Map(inviteMembers.map((member) => [member.id, member.avatarUrl]))

  return (
    <>
      <DialogTitle sx={{ pr: 6 }}>Invite people to Game's Up</DialogTitle>
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
            Choose a server, then pick members to send an invite message to.
          </Typography>
        </Stack>
        {selectedDiscoveryServers.length > 0 ? (
          <Stack spacing={1.5}>
            <Box>
              <DiscordServerPicker
                options={selectedDiscoveryServers}
                value={activeInviteServer?.id ?? ''}
                placeholder="Pick a Discord server"
                onChange={onSelectInviteServer}
                getOptionDescription={(option) =>
                  option.knownUserCount > 0
                    ? `${option.knownUserCount} other member${option.knownUserCount === 1 ? '' : 's'} in your network`
                    : 'No other members in your network yet'
                }
              />
            </Box>
            {activeInviteServer ? (
              <Stack spacing={1.25}>
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
                      const memberDetail = buildInviteMemberDetail(member)

                      return (
                        <Sheet
                          key={member.id}
                          variant="outlined"
                          sx={{
                            p: { xs: 1, sm: 1.25 },
                            borderRadius: 'md',
                            backgroundColor: isSelected ? 'rgba(20, 136, 106, 0.14)' : 'transparent'
                          }}
                        >
                          <Stack direction="row" spacing={{ xs: 1, sm: 1.25 }} justifyContent="space-between" alignItems="center">
                            <Stack direction="row" spacing={{ xs: 1, sm: 1.25 }} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
                              <Avatar src={member.avatarUrl ?? undefined} alt={member.displayName} size="sm" variant="soft" />
                              <Box sx={{ minWidth: 0, flex: 1 }}>
                                <Typography level="title-sm">{member.displayName}</Typography>
                                {memberDetail ? (
                                  <Typography level="body-xs" sx={{ color: 'neutral.400' }}>
                                    {memberDetail}
                                  </Typography>
                                ) : null}
                              </Box>
                            </Stack>
                            <Box sx={{ flexShrink: 0, alignSelf: 'center' }}>
                              <Button
                                size="sm"
                                variant={canInviteMember && isSelected ? 'solid' : 'outlined'}
                                color={canInviteMember && isSelected ? 'primary' : 'neutral'}
                                disabled={!canInviteMember}
                                onClick={() => onToggleInviteUser(member.id)}
                                sx={{ minHeight: 32, px: 1.25 }}
                              >
                                {member.isAppUser ? "Already on Game's Up" : isSelected ? 'Selected' : 'Select'}
                              </Button>
                            </Box>
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
          <Sheet variant="soft" sx={{ p: 1.5, borderRadius: 'md', ...nestedInsetSurfaceSx }}>
            <Typography level="body-sm" sx={{ color: 'neutral.300' }}>
              Select at least one server where the bot is present to browse and target specific members.
            </Typography>
          </Sheet>
        )}

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
                      ...nestedInsetSurfaceSx
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
            {inviteSending ? 'Sending invites...' : 'Send invites'}
          </Button>
        )}
      />
    </>
  )
}

function OverviewViewContent({
  session,
  discordEnabled,
  onLogout,
  onDiscordLogin,
  installPrompt
}: {
  session: AuthSessionResponse | null;
  discordEnabled: boolean;
  onLogout: () => Promise<void>;
  onDiscordLogin: () => Promise<void>;
  installPrompt?: {
    label: string;
    pending: boolean;
    onInstall: () => void | Promise<void>;
  };
}) {
  return (
    <Stack spacing={3}>
      <SectionNav
        aria-label="Overview sections"
        mb={0}
        sections={[
          { id: 'account', label: 'Account', desktopLabel: 'Your Account' },
          { id: 'what-is-games-up', label: 'About', desktopLabel: "What Is Game's Up?" },
          { id: 'quick-start', label: 'Quick start', desktopLabel: 'Quick Start Guide', ariaLabel: 'Quick start' },
          ...(installPrompt
            ? [{ id: 'install-app', label: 'Install', desktopLabel: 'Install App', ariaLabel: 'Install app' }]
            : [])
        ]}
      />
      <Box id="account" sx={{ scrollMarginTop: sectionScrollMarginTop }}>
        <Stack spacing={1.5}>
          <Typography level="h2">Account</Typography>
          <AccountCard
            session={session}
            discordEnabled={discordEnabled}
            onLogout={onLogout}
            onDiscordLogin={onDiscordLogin}
          />
        </Stack>
      </Box>
      <Box id="what-is-games-up" sx={{ scrollMarginTop: sectionScrollMarginTop }}>
        <Stack spacing={1.5}>
          <Typography level="h2">What is Game's Up?</Typography>
          <WhatIsGamesUpCard />
        </Stack>
      </Box>
      <Box id="quick-start" sx={{ scrollMarginTop: sectionScrollMarginTop }}>
        <Stack spacing={1.5}>
          <Typography level="h2">Quick start</Typography>
          <QuickStartCard />
        </Stack>
      </Box>
      {installPrompt ? (
        <Box id="install-app" sx={{ scrollMarginTop: sectionScrollMarginTop }}>
          <Stack spacing={1.5}>
            <Typography level="h2">Install app</Typography>
            <InstallAppCard installPrompt={installPrompt} />
          </Stack>
        </Box>
      ) : null}
    </Stack>
  )
}

export function OverviewView() {
  const { overviewViewProps } = useDashboardContext()

  return <OverviewViewContent {...overviewViewProps} />
}