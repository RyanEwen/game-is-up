-- Per-person observed games are kept only for signed-up users, keyed by account and deleted
-- with it. Members who never signed up are kept only as anonymous per-game, per-server,
-- per-day counts. This migration converts the existing rows and is not reversible: the deploy
-- script takes a verified database dump before it runs.

-- CreateEnum
CREATE TYPE "DiscordGameActivityCountKind" AS ENUM ('OBSERVATIONS', 'DISTINCT_PEOPLE');

-- CreateTable
CREATE TABLE "DiscordGameActivityDaily" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "countKind" "DiscordGameActivityCountKind" NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscordGameActivityDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiscordGameActivityDaily_serverId_day_idx" ON "DiscordGameActivityDaily"("serverId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "DiscordGameActivityDaily_gameId_serverId_day_countKind_key" ON "DiscordGameActivityDaily"("gameId", "serverId", "day", "countKind");

-- AddForeignKey
ALTER TABLE "DiscordGameActivityDaily" ADD CONSTRAINT "DiscordGameActivityDaily_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscordGameActivityDaily" ADD CONSTRAINT "DiscordGameActivityDaily_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "DiscordServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data: attach each row to the account that owns its Discord id, where there is one.
ALTER TABLE "DiscordObservedGame" ADD COLUMN "userId" TEXT;

UPDATE "DiscordObservedGame" AS observed
SET "userId" = identity."userId"
FROM "UserIdentity" AS identity
WHERE identity."provider" = 'DISCORD'
  AND identity."providerUserId" = observed."discordUserId";

-- Data: rows with no account become anonymous counts of distinct people, by the game, the
-- server and the UTC day each person was last seen playing it (Prisma stores UTC in a timestamp
-- without zone, so a plain ::DATE is the UTC day). Rows with no server cannot be
-- placed in a server count and are dropped.
INSERT INTO "DiscordGameActivityDaily" ("id", "gameId", "serverId", "day", "countKind", "count", "updatedAt")
SELECT
    gen_random_uuid()::TEXT,
    observed."gameId",
    observed."sourceServerId",
    observed."lastObservedAt"::DATE,
    'DISTINCT_PEOPLE',
    COUNT(DISTINCT observed."discordUserId"),
    CURRENT_TIMESTAMP
FROM "DiscordObservedGame" AS observed
WHERE observed."userId" IS NULL
  AND observed."sourceServerId" IS NOT NULL
GROUP BY observed."gameId", observed."sourceServerId", observed."lastObservedAt"::DATE;

-- Data: then remove every identified row that has no account.
DELETE FROM "DiscordObservedGame" WHERE "userId" IS NULL;

-- Data: an account linked to more than one Discord id could now hold two rows for one game;
-- keep the most recently observed one.
DELETE FROM "DiscordObservedGame" AS older
USING "DiscordObservedGame" AS newer
WHERE older."userId" = newer."userId"
  AND older."gameId" = newer."gameId"
  AND (older."lastObservedAt", older."id") < (newer."lastObservedAt", newer."id");

-- DropIndex
DROP INDEX "DiscordObservedGame_discordUserId_lastObservedAt_idx";

-- DropIndex
DROP INDEX "DiscordObservedGame_discordUserId_gameId_key";

-- AlterTable
ALTER TABLE "DiscordObservedGame" DROP COLUMN "discordUserId",
ALTER COLUMN "userId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "DiscordObservedGame_userId_lastObservedAt_idx" ON "DiscordObservedGame"("userId", "lastObservedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DiscordObservedGame_userId_gameId_key" ON "DiscordObservedGame"("userId", "gameId");

-- AddForeignKey
ALTER TABLE "DiscordObservedGame" ADD CONSTRAINT "DiscordObservedGame_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
