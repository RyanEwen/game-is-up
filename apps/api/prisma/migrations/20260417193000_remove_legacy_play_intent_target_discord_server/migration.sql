INSERT INTO "PlayIntentTargetDiscordServer" ("id", "playIntentId", "serverId", "createdAt")
SELECT md5("id" || ':' || "targetDiscordServerId"), "id", "targetDiscordServerId", CURRENT_TIMESTAMP
FROM "PlayIntent"
WHERE "targetDiscordServerId" IS NOT NULL
ON CONFLICT ("playIntentId", "serverId") DO NOTHING;

ALTER TABLE "PlayIntent" DROP CONSTRAINT "PlayIntent_targetDiscordServerId_fkey";

DROP INDEX "PlayIntent_targetDiscordServerId_expiresAt_idx";

ALTER TABLE "PlayIntent" DROP COLUMN "targetDiscordServerId";