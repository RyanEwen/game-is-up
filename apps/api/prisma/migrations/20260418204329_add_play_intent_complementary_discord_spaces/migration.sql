-- CreateEnum
CREATE TYPE "PlayIntentDiscordSpaceStatus" AS ENUM ('REQUESTED', 'PROVISIONING', 'ACTIVE', 'RETAINED', 'DELETE_REQUESTED', 'DELETED', 'PROVISION_FAILED');

-- CreateEnum
CREATE TYPE "PlayIntentDiscordSpaceAccessSource" AS ENUM ('CREATOR', 'AUDIENCE_SYNC', 'INTERESTED_RESPONSE', 'MANUAL_SHARE');

-- CreateTable
CREATE TABLE "PlayIntentDiscordSpace" (
    "id" TEXT NOT NULL,
    "playIntentId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "status" "PlayIntentDiscordSpaceStatus" NOT NULL DEFAULT 'REQUESTED',
    "categoryChannelId" TEXT,
    "categoryChannelName" TEXT,
    "textChannelId" TEXT,
    "textChannelName" TEXT,
    "voiceChannelId" TEXT,
    "voiceChannelName" TEXT,
    "inviteCode" TEXT,
    "inviteUrl" TEXT,
    "provisionedAt" TIMESTAMP(3),
    "deleteAfter" TIMESTAMP(3),
    "deleteRequestedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayIntentDiscordSpace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayIntentDiscordSpaceAccessGrant" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "PlayIntentDiscordSpaceAccessSource" NOT NULL DEFAULT 'AUDIENCE_SYNC',
    "inServer" BOOLEAN NOT NULL DEFAULT false,
    "inviteSentAt" TIMESTAMP(3),
    "roleGrantedAt" TIMESTAMP(3),
    "joinedViaInviteAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayIntentDiscordSpaceAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayIntentDiscordSpace_playIntentId_key" ON "PlayIntentDiscordSpace"("playIntentId");

-- CreateIndex
CREATE INDEX "PlayIntentDiscordSpace_serverId_status_idx" ON "PlayIntentDiscordSpace"("serverId", "status");

-- CreateIndex
CREATE INDEX "PlayIntentDiscordSpace_status_deleteAfter_idx" ON "PlayIntentDiscordSpace"("status", "deleteAfter");

-- CreateIndex
CREATE INDEX "PlayIntentDiscordSpaceAccessGrant_userId_revokedAt_idx" ON "PlayIntentDiscordSpaceAccessGrant"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "PlayIntentDiscordSpaceAccessGrant_spaceId_inServer_revokedA_idx" ON "PlayIntentDiscordSpaceAccessGrant"("spaceId", "inServer", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlayIntentDiscordSpaceAccessGrant_spaceId_userId_key" ON "PlayIntentDiscordSpaceAccessGrant"("spaceId", "userId");

-- AddForeignKey
ALTER TABLE "PlayIntentDiscordSpace" ADD CONSTRAINT "PlayIntentDiscordSpace_playIntentId_fkey" FOREIGN KEY ("playIntentId") REFERENCES "PlayIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayIntentDiscordSpaceAccessGrant" ADD CONSTRAINT "PlayIntentDiscordSpaceAccessGrant_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "PlayIntentDiscordSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayIntentDiscordSpaceAccessGrant" ADD CONSTRAINT "PlayIntentDiscordSpaceAccessGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
