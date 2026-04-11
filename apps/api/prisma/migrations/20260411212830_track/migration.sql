-- CreateTable
CREATE TABLE "DiscordObservedGame" (
    "id" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "sourceServerId" TEXT,
    "activityName" TEXT NOT NULL,
    "applicationId" TEXT,
    "activityType" "DiscordActivityType" NOT NULL,
    "firstObservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastObservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscordObservedGame_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiscordObservedGame_discordUserId_lastObservedAt_idx" ON "DiscordObservedGame"("discordUserId", "lastObservedAt");

-- CreateIndex
CREATE INDEX "DiscordObservedGame_sourceServerId_lastObservedAt_idx" ON "DiscordObservedGame"("sourceServerId", "lastObservedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DiscordObservedGame_discordUserId_gameId_key" ON "DiscordObservedGame"("discordUserId", "gameId");

-- AddForeignKey
ALTER TABLE "DiscordObservedGame" ADD CONSTRAINT "DiscordObservedGame_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscordObservedGame" ADD CONSTRAINT "DiscordObservedGame_sourceServerId_fkey" FOREIGN KEY ("sourceServerId") REFERENCES "DiscordServer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
