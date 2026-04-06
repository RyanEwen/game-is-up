import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.gameisup.app',
  appName: 'Game Is Up',
  webDir: '../web/dist',
  server: {
    androidScheme: 'http',
    cleartext: true
  }
}

export default config