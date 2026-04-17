-- CreateTable
CREATE TABLE "PlayIntentTargetDiscordServer" (
    "id" TEXT NOT NULL,
    "playIntentId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayIntentTargetDiscordServer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayIntentTargetDiscordServer_serverId_idx" ON "PlayIntentTargetDiscordServer"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayIntentTargetDiscordServer_playIntentId_serverId_key" ON "PlayIntentTargetDiscordServer"("playIntentId", "serverId");

-- AddForeignKey
ALTER TABLE "PlayIntentTargetDiscordServer" ADD CONSTRAINT "PlayIntentTargetDiscordServer_playIntentId_fkey" FOREIGN KEY ("playIntentId") REFERENCES "PlayIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayIntentTargetDiscordServer" ADD CONSTRAINT "PlayIntentTargetDiscordServer_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "DiscordServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
