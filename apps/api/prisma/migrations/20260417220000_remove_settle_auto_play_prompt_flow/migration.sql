-- Rewrite legacy settle rows before removing the settle-specific enum values.
UPDATE "DiscordAutoPlayPrompt"
SET
  "status" = 'EXPIRED',
  "respondedAt" = COALESCE("respondedAt", NOW()),
  "statusDetail" = CASE
    WHEN "status" = 'SETTLE_SENT' THEN COALESCE("statusDetail", 'This unfinished settle flow was turned off.')
    WHEN "status" = 'SETTLE_CONFIRMED' THEN COALESCE("statusDetail", 'This unfinished settle flow was turned off after it had already been confirmed.')
    WHEN "status" = 'SETTLE_DECLINED' THEN COALESCE("statusDetail", 'This unfinished settle flow was turned off after it had already been declined.')
    ELSE "statusDetail"
  END
WHERE "status" IN ('SETTLE_SENT', 'SETTLE_CONFIRMED', 'SETTLE_DECLINED');

ALTER TABLE "DiscordAutoPlayPrompt" DROP CONSTRAINT IF EXISTS "DiscordAutoPlayPrompt_settlePlayIntentId_fkey";
ALTER TABLE "DiscordAutoPlayPrompt" DROP COLUMN IF EXISTS "settlePlayIntentId";

CREATE TYPE "DiscordAutoPlayPromptStatus_new" AS ENUM (
  'SENT',
  'SKIPPED',
  'FAILED',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED'
);

ALTER TABLE "DiscordAutoPlayPrompt"
ALTER COLUMN "status" TYPE "DiscordAutoPlayPromptStatus_new"
USING ("status"::text::"DiscordAutoPlayPromptStatus_new");

DROP TYPE "DiscordAutoPlayPromptStatus";
ALTER TYPE "DiscordAutoPlayPromptStatus_new" RENAME TO "DiscordAutoPlayPromptStatus";
