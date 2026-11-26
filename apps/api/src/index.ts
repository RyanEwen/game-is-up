import { app } from './app.js'
import { repairNormalizedDuplicateGames } from './lib/game-catalog-maintenance.js'
import { encryptStoredDiscordTokens } from './lib/discord-token-storage.js'
import { env } from './lib/env.js'
import { startPlayIntentCleanupLoop } from './lib/play-intent-cleanup.js'
import { startDiscordPresenceBot } from './lib/discord-presence-bot.js'
import { logger } from './lib/logger.js'

/**
 * Encrypt any plaintext Discord tokens before the first request can read one. A failure is
 * logged and startup continues: an unconverted token reads as "sign in with Discord again",
 * and the next start retries the pass.
 */
async function prepareStoredDiscordTokens(): Promise<void> {
  try {
    await encryptStoredDiscordTokens()
  } catch (error) {
    logger.error('Failed to encrypt stored Discord tokens', { error })
  }
}

await prepareStoredDiscordTokens()

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
