-- Add new DiscordAutoPlayPromptStatus values
ALTER TYPE "DiscordAutoPlayPromptStatus" ADD VALUE IF NOT EXISTS 'SETTLE_SENT';
ALTER TYPE "DiscordAutoPlayPromptStatus" ADD VALUE IF NOT EXISTS 'SETTLE_CONFIRMED';
ALTER TYPE "DiscordAutoPlayPromptStatus" ADD VALUE IF NOT EXISTS 'SETTLE_DECLINED';

-- Add voice channel fields to PlayIntent
ALTER TABLE "PlayIntent" ADD COLUMN "voiceChannelId" TEXT;
ALTER TABLE "PlayIntent" ADD COLUMN "voiceChannelName" TEXT;

-- Add settlePlayIntentId to DiscordAutoPlayPrompt
ALTER TABLE "DiscordAutoPlayPrompt" ADD COLUMN "settlePlayIntentId" TEXT;

-- CreateTable UserPlatformAlias
CREATE TABLE "UserPlatformAlias" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "aliasValue" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPlatformAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable UserGameAlias
CREATE TABLE "UserGameAlias" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "aliasValue" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserGameAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable PlayIntentMute
CREATE TABLE "PlayIntentMute" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mutedUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayIntentMute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserPlatformAlias_userId_idx" ON "UserPlatformAlias"("userId");
CREATE UNIQUE INDEX "UserPlatformAlias_userId_platform_key" ON "UserPlatformAlias"("userId", "platform");

CREATE INDEX "UserGameAlias_userId_idx" ON "UserGameAlias"("userId");
CREATE UNIQUE INDEX "UserGameAlias_userId_gameId_key" ON "UserGameAlias"("userId", "gameId");

CREATE INDEX "PlayIntentMute_userId_idx" ON "PlayIntentMute"("userId");
CREATE UNIQUE INDEX "PlayIntentMute_userId_mutedUserId_key" ON "PlayIntentMute"("userId", "mutedUserId");

-- AddForeignKey
ALTER TABLE "UserPlatformAlias" ADD CONSTRAINT "UserPlatformAlias_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserGameAlias" ADD CONSTRAINT "UserGameAlias_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserGameAlias" ADD CONSTRAINT "UserGameAlias_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlayIntentMute" ADD CONSTRAINT "PlayIntentMute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlayIntentMute" ADD CONSTRAINT "PlayIntentMute_mutedUserId_fkey" FOREIGN KEY ("mutedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DiscordAutoPlayPrompt" ADD CONSTRAINT "DiscordAutoPlayPrompt_settlePlayIntentId_fkey" FOREIGN KEY ("settlePlayIntentId") REFERENCES "PlayIntent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
