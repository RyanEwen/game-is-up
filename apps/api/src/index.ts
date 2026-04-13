import { app } from './app.js'
import { env } from './lib/env.js'
import { startDiscordPresenceBot } from './lib/discord-presence-bot.js'

app.listen(env.API_PORT, () => {
  console.log(`Game's Up API listening on http://localhost:${env.API_PORT}`)
  void startDiscordPresenceBot()
})