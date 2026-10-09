-- Record substantive-edit resets so later legacy answers cannot revive prior acceptance.
ALTER TABLE "Notification" ADD COLUMN "responseResetAt" TIMESTAMP(3);

-- Normalize unambiguous legacy web answers. An explicitly answered anchor has
-- not been reset; a later explicit answer on a go-time message supersedes it.
-- Unanswered anchors require acceptance again rather than reviving an ambiguous answer.
WITH anchors AS (
  SELECT DISTINCT ON ("playIntentId", "userId") *
  FROM "Notification"
  WHERE "type" = 'FRIEND_PLAYING' AND "playIntentId" IS NOT NULL
  ORDER BY "playIntentId", "userId", "createdAt" DESC, "id" DESC
), current_answers AS (
  SELECT anchor."id" AS anchor_id, answer.*
  FROM anchors anchor
  CROSS JOIN LATERAL (
    SELECT * FROM "Notification" candidate
    WHERE candidate."playIntentId" = anchor."playIntentId"
      AND candidate."userId" = anchor."userId"
      AND candidate."type" IN ('FRIEND_PLAYING', 'SCHEDULED_PLAY_INTENT_REMINDER', 'SCHEDULED_PLAY_INTENT_CONFIRMED')
      AND candidate."responseChoice" IN ('JOIN', 'DECLINE')
      AND candidate."respondedAt" IS NOT NULL
    ORDER BY candidate."respondedAt" DESC, candidate."createdAt" DESC, candidate."id" DESC
    LIMIT 1
  ) answer
  WHERE anchor."responseChoice" IN ('JOIN', 'DECLINE')
    AND anchor."respondedAt" IS NOT NULL
    AND answer."respondedAt" > anchor."respondedAt"
)
UPDATE "Notification" anchor
SET "responseChoice" = answer."responseChoice",
    "respondedAt" = answer."respondedAt",
    "runningLateAt" = answer."runningLateAt",
    "runningLateMinutes" = answer."runningLateMinutes"
FROM current_answers answer
WHERE anchor."id" = answer.anchor_id;

-- An unanswered invitation plus an accepted go-time message may represent a
-- later organizer reset. Preserve the unanswered invitation and record the
-- upgrade boundary instead of copying that historical acceptance back to it.
WITH anchors AS (
  SELECT DISTINCT ON ("playIntentId", "userId") "id"
  FROM "Notification"
  WHERE "type" = 'FRIEND_PLAYING' AND "playIntentId" IS NOT NULL
  ORDER BY "playIntentId", "userId", "createdAt" DESC, "id" DESC
)
UPDATE "Notification" anchor
SET "responseResetAt" = CURRENT_TIMESTAMP,
    "respondedAt" = NULL,
    "runningLateAt" = NULL,
    "runningLateMinutes" = NULL
FROM anchors
WHERE anchor."id" = anchors."id"
  AND anchor."responseChoice" IS NULL
  AND anchor."responseResetAt" IS NULL
  AND EXISTS (
    SELECT 1 FROM "Notification" legacy_answer
    WHERE legacy_answer."playIntentId" = anchor."playIntentId"
      AND legacy_answer."userId" = anchor."userId"
      AND legacy_answer."type" IN ('SCHEDULED_PLAY_INTENT_REMINDER', 'SCHEDULED_PLAY_INTENT_CONFIRMED')
      AND legacy_answer."responseChoice" = 'JOIN'
      AND legacy_answer."respondedAt" IS NOT NULL
  );
