/** Validates and authorizes Discord delay estimates before using the shared response service. */
import { AuthProvider } from '@prisma/client'
import { parseRunningLateMinutes } from '@game-is-up/shared'
import { MessageFlags, type ModalSubmitInteraction } from 'discord.js'
import { prisma } from './prisma.js'
import {
  markRunningLateFromWeb,
  PlayIntentNotificationResponseError,
} from './play-intent-notification-responses.js'
import {
  runningLateMinutesFieldId,
  runningLateModalPrefix,
} from './play-intent-running-late-modal.js'
import { logger } from './logger.js'

/** Identifies this flow's modal submissions without intercepting other Discord forms. */
export function isRunningLateModalCustomId(customId: string) {
  return customId.startsWith(`${runningLateModalPrefix}:`)
}

/** Rechecks identity, ownership, interest, and expiry when the estimate is submitted. */
export async function handleRunningLateModalSubmit(
  interaction: ModalSubmitInteraction,
) {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })
    const notificationId = interaction.customId.slice(
      runningLateModalPrefix.length + 1,
    )
    const estimate = parseRunningLateMinutes(
      interaction.fields.getTextInputValue(runningLateMinutesFieldId),
    )

    if (!estimate.success) {
      await interaction.editReply(
        'Enter a whole number of minutes between 1 and 1440, or leave it blank if unsure.',
      )
      return
    }

    const identity = await prisma.userIdentity.findUnique({
      where: {
        provider_providerUserId: {
          provider: AuthProvider.DISCORD,
          providerUserId: interaction.user.id,
        },
      },
      select: { userId: true },
    })
    let notification: { playIntentId: string | null } | null = null

    if (identity) {
      notification = await prisma.notification.findFirst({
        where: { id: notificationId, userId: identity.userId },
        select: { playIntentId: true },
      })
    }

    if (!identity || !notification?.playIntentId) {
      await interaction.editReply(
        'This prompt is not available for your account anymore.',
      )
      return
    }

    const result = await markRunningLateFromWeb({
      userId: identity.userId,
      playIntentId: notification.playIntentId,
      runningLateMinutes: estimate.data,
    })
    await interaction.editReply(result.message)
  } catch (error) {
    if (!(error instanceof PlayIntentNotificationResponseError)) {
      logger.error('Discord running-late modal submission failed', { error })
    }

    await interaction.editReply(
      error instanceof PlayIntentNotificationResponseError
        ? error.message
        : 'Unable to update your delay right now. Please try again.',
    )
  }
}
