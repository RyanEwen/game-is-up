import { app } from './app.js'
import { repairNormalizedDuplicateGames } from './lib/game-catalog-maintenance.js'
import { env } from './lib/env.js'
import { startPlayIntentCleanupLoop } from './lib/play-intent-cleanup.js'
import { startDiscordPresenceBot } from './lib/discord-presence-bot.js'

app.listen(env.API_PORT, () => {
  console.log(`Game's Up API listening on http://localhost:${env.API_PORT}`)
  void (async () => {
    try {
      const repairResult = await repairNormalizedDuplicateGames()

      if (repairResult.mergedGameCount > 0) {
        console.log(
          `Merged ${repairResult.mergedGameCount} duplicate game rows across ${repairResult.mergedGroupCount} normalized title groups.`,
        )
      }
    } catch (error) {
      console.error('Failed to repair normalized duplicate games', error)
    }

    startPlayIntentCleanupLoop()
    await startDiscordPresenceBot()
  })()
})
