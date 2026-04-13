import type { CapacitorConfig } from '@capacitor/cli'

function normalizeServerUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim()

  if (!trimmed) {
    return undefined
  }

  return trimmed.replace(/\/$/, '')
}

const serverUrl = normalizeServerUrl(process.env.CAPACITOR_SERVER_URL)

const config: CapacitorConfig = {
  appId: 'com.gameisup.app',
  appName: "Game's Up",
  webDir: '../web/dist',
  server: serverUrl
    ? {
        url: serverUrl,
        cleartext: serverUrl.startsWith('http://')
      }
    : {
        androidScheme: 'http',
        cleartext: true
      }
}

export default config
