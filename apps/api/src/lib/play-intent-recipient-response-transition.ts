import { NotificationResponseChoice, PlayIntentScope } from '@prisma/client'

export type PlayIntentRecipientResponse = 'JOIN' | 'DECLINE'

export type RecipientResponseAcknowledgementKind =
  | 'interested'
  | 'pass-initial'
  | 'pass-repeat'
  | 'pass-from-join'

export type RecipientResponseTransition = {
  nextChoice: NotificationResponseChoice;
  shouldCreateCreatorSystemNotification: boolean;
  acknowledgementKind: RecipientResponseAcknowledgementKind;
}

export function resolveRecipientResponseTransition(options: {
  previousChoice: NotificationResponseChoice | null;
  response: PlayIntentRecipientResponse;
  scope: PlayIntentScope | null | undefined;
}): RecipientResponseTransition {
  if (options.response === NotificationResponseChoice.DECLINE) {
    return {
      nextChoice: NotificationResponseChoice.DECLINE,
      shouldCreateCreatorSystemNotification: options.previousChoice !== NotificationResponseChoice.DECLINE
        && (options.scope === PlayIntentScope.SPECIFIC_FRIENDS || options.previousChoice === NotificationResponseChoice.JOIN),
      acknowledgementKind: options.previousChoice === NotificationResponseChoice.JOIN
        ? 'pass-from-join'
        : options.previousChoice === NotificationResponseChoice.DECLINE
          ? 'pass-repeat'
          : 'pass-initial'
    }
  }

  return {
    nextChoice: NotificationResponseChoice.JOIN,
    shouldCreateCreatorSystemNotification: options.previousChoice !== NotificationResponseChoice.JOIN,
    acknowledgementKind: 'interested'
  }
}