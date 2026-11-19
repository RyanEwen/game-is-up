import { app } from './app.js'
import { repairNormalizedDuplicateGames } from './lib/game-catalog-maintenance.js'
import { env } from './lib/env.js'
import { startPlayIntentCleanupLoop } from './lib/play-intent-cleanup.js'
import { startDiscordPresenceBot } from './lib/discord-presence-bot.js'
import { logger } from './lib/logger.js'

app.listen(env.API_PORT, () => {
  logger.info(`Game's Up API listening on http://localhost:${env.API_PORT}`)
  void (async () => {
    try {
      const repairResult = await repairNormalizedDuplicateGames()

      if (repairResult.mergedGameCount > 0) {
        logger.info(
          `Merged ${repairResult.mergedGameCount} duplicate game rows across ${repairResult.mergedGroupCount} normalized title groups.`,
        )
      }
    } catch (error) {
      logger.error('Failed to repair normalized duplicate games', { error })
    }

    startPlayIntentCleanupLoop()
    await startDiscordPresenceBot()
  })()
})
