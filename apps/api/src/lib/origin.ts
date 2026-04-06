import { env } from './env.js'

export const mobileAuthRedirectUrl = 'gameisup://auth'

const mobileClientOrigins = [
  'http://localhost',
  'https://localhost',
  'http://127.0.0.1',
  'https://127.0.0.1',
  'capacitor://localhost'
] as const

export function getApiOrigin(): string {
  if (env.DISCORD_CALLBACK_URL) {
    return new URL(env.DISCORD_CALLBACK_URL).origin
  }

  return `http://localhost:${env.API_PORT}`
}

export function getAllowedClientOrigins(): string[] {
  return [...new Set([env.CLIENT_ORIGIN, ...mobileClientOrigins])]
}

export function resolveAuthRedirectTarget(candidate: string | undefined): string {
  if (!candidate) {
    return env.CLIENT_ORIGIN
  }

  if (candidate === mobileAuthRedirectUrl) {
    return candidate
  }

  return candidate === env.CLIENT_ORIGIN ? candidate : env.CLIENT_ORIGIN
}

export function isMobileAuthRedirectTarget(target: string): boolean {
  return target === mobileAuthRedirectUrl
}