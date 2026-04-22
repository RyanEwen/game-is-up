import { NotificationResponseChoice, NotificationType } from '@prisma/client'

export type NotificationDirectMessageRenderState =
  | { kind: 'scheduled-check-in'; variant: 'canceled' | 'confirmed' | 'expired' | 'prompt' }
  | { kind: 'audience-play-intent'; variant: 'joined' | 'declined' | 'expired' | 'prompt' }
  | { kind: 'other' }

export function resolveNotificationDirectMessageRenderState(options: {
  notificationType: NotificationType;
  responseChoice?: NotificationResponseChoice | null;
  playIntentIsActive?: boolean;
  renderSurface?: 'notification' | 'response';
}): NotificationDirectMessageRenderState {
  if (options.notificationType === NotificationType.SCHEDULED_PLAY_INTENT_CHECK_IN) {
    if (options.responseChoice === NotificationResponseChoice.CANCELED) {
      return { kind: 'scheduled-check-in', variant: 'canceled' }
    }

    if (options.responseChoice === NotificationResponseChoice.CONFIRMED) {
      return { kind: 'scheduled-check-in', variant: 'confirmed' }
    }

    if (options.responseChoice === NotificationResponseChoice.EXPIRED || options.playIntentIsActive === false) {
      return { kind: 'scheduled-check-in', variant: 'expired' }
    }

    return { kind: 'scheduled-check-in', variant: 'prompt' }
  }

  if (
    options.notificationType === NotificationType.FRIEND_PLAYING
    || options.notificationType === NotificationType.SCHEDULED_PLAY_INTENT_CONFIRMED
    || options.notificationType === NotificationType.SCHEDULED_PLAY_INTENT_REMINDER
  ) {
    if (options.renderSurface !== 'response') {
      if (options.responseChoice === NotificationResponseChoice.EXPIRED || options.playIntentIsActive === false) {
        return { kind: 'audience-play-intent', variant: 'expired' }
      }

      return { kind: 'audience-play-intent', variant: 'prompt' }
    }

    if (options.responseChoice === NotificationResponseChoice.JOIN) {
      return { kind: 'audience-play-intent', variant: 'joined' }
    }

    if (options.responseChoice === NotificationResponseChoice.DECLINE) {
      return { kind: 'audience-play-intent', variant: 'declined' }
    }

    if (options.responseChoice === NotificationResponseChoice.EXPIRED || options.playIntentIsActive === false) {
      return { kind: 'audience-play-intent', variant: 'expired' }
    }

    return { kind: 'audience-play-intent', variant: 'prompt' }
  }

  return { kind: 'other' }
}