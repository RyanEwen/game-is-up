-- CreateEnum
CREATE TYPE "DiscordCtpComposerStep" AS ENUM ('BASICS', 'AUDIENCE', 'TIMING', 'DETAILS', 'REVIEW');

-- CreateEnum
CREATE TYPE "DiscordCtpComposerStartMode" AS ENUM ('NOW', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "DiscordCtpComposerVoiceMode" AS ENUM ('NONE', 'EXISTING_CHANNEL', 'TEMPORARY_SPACE');

-- AlterTable
ALTER TABLE "DiscordServer" ADD COLUMN     "ctpComposerChannelId" TEXT,
ADD COLUMN     "ctpComposerMessageId" TEXT,
ADD COLUMN     "ctpComposerPostedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DiscordCtpComposerDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "step" "DiscordCtpComposerStep" NOT NULL DEFAULT 'BASICS',
    "title" TEXT NOT NULL DEFAULT '',
    "gameIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "gamePage" INTEGER NOT NULL DEFAULT 0,
    "notifyScope" "PlayIntentScope" NOT NULL DEFAULT 'FRIENDS_ONLY',
    "targetUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetPage" INTEGER NOT NULL DEFAULT 0,
    "targetFriendsListId" TEXT,
    "targetDiscordServerIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startMode" "DiscordCtpComposerStartMode" NOT NULL DEFAULT 'NOW',
    "startAt" TIMESTAMP(3),
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "note" TEXT NOT NULL DEFAULT '',
    "voiceMode" "DiscordCtpComposerVoiceMode" NOT NULL DEFAULT 'NONE',
    "voiceChannelId" TEXT,
    "voiceChannelName" TEXT,
    "sourceServerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscordCtpComposerDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscordCtpComposerDraft_userId_key" ON "DiscordCtpComposerDraft"("userId");

-- CreateIndex
CREATE INDEX "DiscordCtpComposerDraft_expiresAt_idx" ON "DiscordCtpComposerDraft"("expiresAt");

-- AddForeignKey
ALTER TABLE "DiscordCtpComposerDraft" ADD CONSTRAINT "DiscordCtpComposerDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscordCtpComposerDraft" ADD CONSTRAINT "DiscordCtpComposerDraft_sourceServerId_fkey" FOREIGN KEY ("sourceServerId") REFERENCES "DiscordServer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
