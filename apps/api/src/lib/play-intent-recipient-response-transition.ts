/**
 * Decides what a recipient's interested/pass answer should trigger.
 *
 * A real change of answer always notifies: the creator and every other invited
 * recipient who has not passed hear about it, on every audience scope. Passes
 * are not anonymous and are not quiet on broad calls — knowing who dropped out
 * is worth the extra pings.
 *
 * Repeat answers of the same choice stay silent so re-tapping a button is
 * idempotent.
 */

import { NotificationResponseChoice } from '@prisma/client'

export type PlayIntentRecipientResponse = 'JOIN' | 'DECLINE'

export type RecipientResponseAcknowledgementKind =
  | 'interested'
  | 'pass-initial'
  | 'pass-repeat'
  | 'pass-from-join'

export type RecipientResponseTransition = {
  nextChoice: NotificationResponseChoice;
  /**
   * Whether this answer is a real change and should therefore raise the
   * creator's system notification and fan out to the rest of the audience.
   */
  shouldNotifyResponseChange: boolean;
  acknowledgementKind: RecipientResponseAcknowledgementKind;
}

export function resolveRecipientResponseTransition(options: {
  previousChoice: NotificationResponseChoice | null;
  response: PlayIntentRecipientResponse;
}): RecipientResponseTransition {
  if (options.response === NotificationResponseChoice.DECLINE) {
    return {
      nextChoice: NotificationResponseChoice.DECLINE,
      shouldNotifyResponseChange: options.previousChoice !== NotificationResponseChoice.DECLINE,
      acknowledgementKind: options.previousChoice === NotificationResponseChoice.JOIN
        ? 'pass-from-join'
        : options.previousChoice === NotificationResponseChoice.DECLINE
          ? 'pass-repeat'
          : 'pass-initial'
    }
  }

  return {
    nextChoice: NotificationResponseChoice.JOIN,
    shouldNotifyResponseChange: options.previousChoice !== NotificationResponseChoice.JOIN,
    acknowledgementKind: 'interested'
  }
}
