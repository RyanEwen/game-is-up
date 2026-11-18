import { env } from './env.js'

export function getApiOrigin(): string {
  if (env.DISCORD_CALLBACK_URL) {
    return new URL(env.DISCORD_CALLBACK_URL).origin
  }

  if (env.STEAM_CALLBACK_URL) {
    return new URL(env.STEAM_CALLBACK_URL).origin
  }

  return `http://localhost:${env.API_PORT}`
}

export function getAllowedClientOrigins(): string[] {
  return [env.CLIENT_ORIGIN]
}

export function resolveAuthRedirectTarget(
  candidate: string | undefined,
): string {
  if (!candidate) {
    return env.CLIENT_ORIGIN
  }

  try {
    const candidateUrl = new URL(candidate)
    const clientUrl = new URL(env.CLIENT_ORIGIN)

    return candidateUrl.origin === clientUrl.origin
      ? candidateUrl.toString()
      : env.CLIENT_ORIGIN
  } catch {
    return env.CLIENT_ORIGIN
  }
}
