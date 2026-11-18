export function buildDiscordChannelUrl(
  serverId: string,
  channelId: string | null | undefined,
) {
  if (!channelId) {
    return null
  }

  return `https://discord.com/channels/${serverId}/${channelId}`
}
