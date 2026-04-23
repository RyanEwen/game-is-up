import { PlayIntentDiscordSpaceStatus, PlayIntentScope, PlayIntentSelectionMode } from '@prisma/client'
import { buildDiscordChannelUrl } from './discord-channel-urls.js'
import { buildDiscordServerIconUrl } from './discord-servers.js'
import { toClientAvatarUrl } from './game-media.js'

export function toSelectionMode(selectionMode: PlayIntentSelectionMode): 'library' | 'subset' {
  return selectionMode === PlayIntentSelectionMode.ENTIRE_LIBRARY ? 'library' : 'subset'
}

export function toNotifyScope(
  scope: PlayIntentScope
): 'friends-only' | 'network' | 'specific-friends' | 'specific-discord-server' {
  switch (scope) {
    case PlayIntentScope.SPECIFIC_DISCORD_SERVER:
      return 'specific-discord-server'
    case PlayIntentScope.SPECIFIC_FRIENDS:
      return 'specific-friends'
    case PlayIntentScope.MUTUAL_FRIENDS:
      return 'network'
    default:
      return 'friends-only'
  }
}

export function formatAvailabilityLabel(displayName: string, startsAt: Date, now: Date) {
  return startsAt.getTime() > now.getTime() + 60 * 1000
    ? `${displayName} is scheduled for ${startsAt.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      })}`
    : `${displayName} is available now`
}

type TargetDiscordServerInput = { id: string; name: string; iconHash: string | null } | null

export function serializeTargetDiscordServer(targetDiscordServer: TargetDiscordServerInput) {
  if (!targetDiscordServer) {
    return null
  }

  return {
    id: targetDiscordServer.id,
    name: targetDiscordServer.name,
    iconUrl: toClientAvatarUrl(buildDiscordServerIconUrl(targetDiscordServer.id, targetDiscordServer.iconHash))
  }
}

export type SerializedTargetDiscordServer = NonNullable<ReturnType<typeof serializeTargetDiscordServer>>

export function serializeTargetDiscordServers(
  targetDiscordServers: Array<{ server: { id: string; name: string; iconHash: string | null } }>
): SerializedTargetDiscordServer[] {
  return targetDiscordServers
    .map((entry) => serializeTargetDiscordServer(entry.server))
    .filter((server): server is SerializedTargetDiscordServer => server !== null)
}

export function toDiscordSpaceStatus(status: PlayIntentDiscordSpaceStatus) {
  switch (status) {
    case PlayIntentDiscordSpaceStatus.PROVISIONING:
      return 'provisioning'
    case PlayIntentDiscordSpaceStatus.ACTIVE:
      return 'active'
    case PlayIntentDiscordSpaceStatus.RETAINED:
      return 'retained'
    case PlayIntentDiscordSpaceStatus.DELETE_REQUESTED:
      return 'delete-requested'
    case PlayIntentDiscordSpaceStatus.DELETED:
      return 'deleted'
    case PlayIntentDiscordSpaceStatus.PROVISION_FAILED:
      return 'provision-failed'
    default:
      return 'requested'
  }
}

export type DiscordSpaceSummaryInput = {
  serverId: string;
  status: PlayIntentDiscordSpaceStatus;
  categoryChannelName: string | null;
  textChannelId: string | null;
  textChannelName: string | null;
  voiceChannelId: string | null;
  voiceChannelName: string | null;
  inviteUrl: string | null;
  deleteAfter: Date | null;
  lastSyncError: string | null;
}

export type SerializedDiscordSpaceSummary = {
  status: ReturnType<typeof toDiscordSpaceStatus>;
  serverId: string;
  categoryChannelName: string | null;
  textChannelName: string | null;
  textChannelUrl: string | null;
  voiceChannelName: string | null;
  voiceChannelUrl: string | null;
  inviteUrl: string | null;
  deleteAfter: string | null;
  lastSyncError: string | null;
}

export function serializeDiscordSpaceSummary(
  space: DiscordSpaceSummaryInput | null
): SerializedDiscordSpaceSummary | null {
  if (!space) {
    return null
  }

  return {
    status: toDiscordSpaceStatus(space.status),
    serverId: space.serverId,
    categoryChannelName: space.categoryChannelName,
    textChannelName: space.textChannelName,
    textChannelUrl: buildDiscordChannelUrl(space.serverId, space.textChannelId),
    voiceChannelName: space.voiceChannelName,
    voiceChannelUrl: buildDiscordChannelUrl(space.serverId, space.voiceChannelId),
    inviteUrl: space.inviteUrl,
    deleteAfter: space.deleteAfter?.toISOString() ?? null,
    lastSyncError: space.lastSyncError
  }
}

type AudienceVisibilityArgs = {
  isOwnIntent: boolean;
  hasDirectNotification?: boolean;
  scope: PlayIntentScope;
  isExplicitFriend: boolean;
  isInDiscoveryAudience: boolean;
  isTargetedFriend: boolean;
  isTargetedServer: boolean;
}

export function isViewerIncludedByPlayIntentAudience({
  isOwnIntent,
  hasDirectNotification = false,
  scope,
  isExplicitFriend,
  isInDiscoveryAudience,
  isTargetedFriend,
  isTargetedServer
}: AudienceVisibilityArgs) {
  if (isOwnIntent || hasDirectNotification) {
    return true
  }

  switch (scope) {
    case PlayIntentScope.SPECIFIC_FRIENDS:
      return isTargetedFriend
    case PlayIntentScope.SPECIFIC_DISCORD_SERVER:
      return isTargetedServer
    case PlayIntentScope.MUTUAL_FRIENDS:
      return isExplicitFriend || isInDiscoveryAudience
    default:
      return isExplicitFriend
  }
}

export function isPlayIntentVisibleToViewer({
  isOwnIntent,
  hasDirectNotification = false,
  scope,
  isExplicitFriend,
  isInDiscoveryAudience,
  isTargetedFriend,
  isTargetedServer
}: AudienceVisibilityArgs) {
  if (isOwnIntent || hasDirectNotification) {
    return true
  }

  switch (scope) {
    case PlayIntentScope.SPECIFIC_FRIENDS:
      return isExplicitFriend || isInDiscoveryAudience || isTargetedFriend
    case PlayIntentScope.SPECIFIC_DISCORD_SERVER:
      return isExplicitFriend || isInDiscoveryAudience || isTargetedServer
    case PlayIntentScope.MUTUAL_FRIENDS:
      return isExplicitFriend || isInDiscoveryAudience
    default:
      return isExplicitFriend
  }
}
