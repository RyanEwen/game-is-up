import { env } from './env.js'

export function buildClientPlayUrl(): string {
  try {
    return new URL('/play', env.CLIENT_ORIGIN).toString()
  } catch {
    return env.CLIENT_ORIGIN
  }
}

export function buildClientPlayIntentUrl(playIntentId: string): string {
  try {
    return new URL(`/play/${playIntentId}`, env.CLIENT_ORIGIN).toString()
  } catch {
    return buildClientPlayUrl()
  }
}
