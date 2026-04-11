-- CreateEnum
CREATE TYPE "DiscordAutoPlayPromptStatus" AS ENUM ('SENT', 'SKIPPED', 'FAILED', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "discordAutoPromptPlayIntent" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "DiscordAutoPlayPrompt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "observationId" TEXT NOT NULL,
    "sourceServerId" TEXT,
    "status" "DiscordAutoPlayPromptStatus" NOT NULL,
    "statusDetail" TEXT,
    "dmError" TEXT,
    "friendRecipientCount" INTEGER NOT NULL DEFAULT 0,
    "networkRecipientCount" INTEGER NOT NULL DEFAULT 0,
    "durationMinutes" INTEGER,
    "notifyScope" "PlayIntentScope",
    "deliveredAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "createdPlayIntentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscordAutoPlayPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscordAutoPlayPrompt_observationId_key" ON "DiscordAutoPlayPrompt"("observationId");

-- CreateIndex
CREATE INDEX "DiscordAutoPlayPrompt_userId_createdAt_idx" ON "DiscordAutoPlayPrompt"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "DiscordAutoPlayPrompt_status_createdAt_idx" ON "DiscordAutoPlayPrompt"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DiscordAutoPlayPrompt_createdPlayIntentId_idx" ON "DiscordAutoPlayPrompt"("createdPlayIntentId");

-- AddForeignKey
ALTER TABLE "DiscordAutoPlayPrompt" ADD CONSTRAINT "DiscordAutoPlayPrompt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscordAutoPlayPrompt" ADD CONSTRAINT "DiscordAutoPlayPrompt_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscordAutoPlayPrompt" ADD CONSTRAINT "DiscordAutoPlayPrompt_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "DiscordActivityObservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscordAutoPlayPrompt" ADD CONSTRAINT "DiscordAutoPlayPrompt_sourceServerId_fkey" FOREIGN KEY ("sourceServerId") REFERENCES "DiscordServer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscordAutoPlayPrompt" ADD CONSTRAINT "DiscordAutoPlayPrompt_createdPlayIntentId_fkey" FOREIGN KEY ("createdPlayIntentId") REFERENCES "PlayIntent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
