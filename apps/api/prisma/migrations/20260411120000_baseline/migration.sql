-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."AuthProvider" AS ENUM ('DISCORD');

-- CreateEnum
CREATE TYPE "public"."DiscordActivityType" AS ENUM ('PLAYING', 'COMPETING');

-- CreateEnum
CREATE TYPE "public"."DiscordRelationshipSyncStatus" AS ENUM ('APPROVAL_REQUIRED', 'SCOPE_MISSING', 'READY', 'SYNCED', 'ERROR');

-- CreateEnum
CREATE TYPE "public"."GameIntentType" AS ENUM ('WISHLIST', 'INTERESTED', 'PLAYING_NOW', 'COMPLETED');

-- CreateEnum
CREATE TYPE "public"."NotificationType" AS ENUM ('FRIEND_PLAYING', 'MUTUAL_FRIEND', 'SYSTEM');

-- CreateEnum
CREATE TYPE "public"."PlayIntentScope" AS ENUM ('FRIENDS_ONLY', 'MUTUAL_FRIENDS');

-- CreateEnum
CREATE TYPE "public"."PlayIntentSelectionMode" AS ENUM ('ENTIRE_LIBRARY', 'SELECTED_GAMES');

-- CreateEnum
CREATE TYPE "public"."ProfileVisibility" AS ENUM ('FRIENDS_ONLY', 'SIGNED_IN_USERS', 'PRIVATE');

-- CreateEnum
CREATE TYPE "public"."ReportReason" AS ENUM ('ABUSE', 'SPAM', 'INAPPROPRIATE_PROFILE');

-- CreateTable
CREATE TABLE "public"."Block" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "blockedUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DiscordActivityObservation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT,
    "sourceServerId" TEXT,
    "activityName" TEXT NOT NULL,
    "applicationId" TEXT,
    "activityType" "public"."DiscordActivityType" NOT NULL,
    "details" TEXT,
    "state" TEXT,
    "startedAt" TIMESTAMP(3),
    "firstObservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastObservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscordActivityObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DiscordServer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "iconHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscordServer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DiscordServerMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscordServerMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DiscordServerPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "includeInDiscovery" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscordServerPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Friend" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "friendedUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Friend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Game" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "coverUrl" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GameAlias" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GamePlatform" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "platformLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GamePlatform_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GameSource" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "canonical" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3),

    CONSTRAINT "GameSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "triggeredByUserId" TEXT,
    "gameId" TEXT,
    "type" "public"."NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PlayIntent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "selectionMode" "public"."PlayIntentSelectionMode" NOT NULL DEFAULT 'SELECTED_GAMES',
    "headline" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "windowStartsAt" TIMESTAMP(3) NOT NULL,
    "windowEndsAt" TIMESTAMP(3) NOT NULL,
    "scope" "public"."PlayIntentScope" NOT NULL DEFAULT 'MUTUAL_FRIENDS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PlayIntentGame" (
    "id" TEXT NOT NULL,
    "playIntentId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayIntentGame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PlayIntentPlatform" (
    "id" TEXT NOT NULL,
    "playIntentId" TEXT NOT NULL,
    "platformLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayIntentPlatform_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Report" (
    "id" TEXT NOT NULL,
    "reporterUserId" TEXT NOT NULL,
    "reportedUserId" TEXT NOT NULL,
    "reason" "public"."ReportReason" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "avatarUrl" TEXT,
    "bio" TEXT NOT NULL DEFAULT '',
    "timezoneLabel" TEXT NOT NULL DEFAULT 'UTC',
    "usualAvailability" TEXT,
    "visibility" "public"."ProfileVisibility" NOT NULL DEFAULT 'FRIENDS_ONLY',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserGameInterest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "intentType" "public"."GameIntentType" NOT NULL,
    "availability" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserGameInterest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserGameInterestPlatform" (
    "id" TEXT NOT NULL,
    "userGameInterestId" TEXT NOT NULL,
    "platformLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserGameInterestPlatform_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "public"."AuthProvider" NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "email" TEXT,
    "grantedScopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastDiscordGuildsSyncAt" TIMESTAMP(3),
    "lastDiscordRelationshipsSyncAt" TIMESTAMP(3),
    "discordRelationshipSyncStatus" "public"."DiscordRelationshipSyncStatus" NOT NULL DEFAULT 'APPROVAL_REQUIRED',
    "discordRelationshipSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Block_userId_blockedUserId_key" ON "public"."Block"("userId" ASC, "blockedUserId" ASC);

-- CreateIndex
CREATE INDEX "DiscordActivityObservation_gameId_isActive_lastObservedAt_idx" ON "public"."DiscordActivityObservation"("gameId" ASC, "isActive" ASC, "lastObservedAt" ASC);

-- CreateIndex
CREATE INDEX "DiscordActivityObservation_sourceServerId_isActive_idx" ON "public"."DiscordActivityObservation"("sourceServerId" ASC, "isActive" ASC);

-- CreateIndex
CREATE INDEX "DiscordActivityObservation_userId_isActive_lastObservedAt_idx" ON "public"."DiscordActivityObservation"("userId" ASC, "isActive" ASC, "lastObservedAt" ASC);

-- CreateIndex
CREATE INDEX "DiscordServerMembership_serverId_idx" ON "public"."DiscordServerMembership"("serverId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "DiscordServerMembership_userId_serverId_key" ON "public"."DiscordServerMembership"("userId" ASC, "serverId" ASC);

-- CreateIndex
CREATE INDEX "DiscordServerPreference_userId_includeInDiscovery_idx" ON "public"."DiscordServerPreference"("userId" ASC, "includeInDiscovery" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "DiscordServerPreference_userId_serverId_key" ON "public"."DiscordServerPreference"("userId" ASC, "serverId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Friend_userId_friendedUserId_key" ON "public"."Friend"("userId" ASC, "friendedUserId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Game_slug_key" ON "public"."Game"("slug" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "GameAlias_gameId_alias_key" ON "public"."GameAlias"("gameId" ASC, "alias" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "GamePlatform_gameId_platformLabel_key" ON "public"."GamePlatform"("gameId" ASC, "platformLabel" ASC);

-- CreateIndex
CREATE INDEX "GamePlatform_platformLabel_idx" ON "public"."GamePlatform"("platformLabel" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "GameSource_source_externalId_key" ON "public"."GameSource"("source" ASC, "externalId" ASC);

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "public"."Notification"("userId" ASC, "readAt" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "PlayIntent_selectionMode_expiresAt_idx" ON "public"."PlayIntent"("selectionMode" ASC, "expiresAt" ASC);

-- CreateIndex
CREATE INDEX "PlayIntent_userId_expiresAt_idx" ON "public"."PlayIntent"("userId" ASC, "expiresAt" ASC);

-- CreateIndex
CREATE INDEX "PlayIntentGame_gameId_idx" ON "public"."PlayIntentGame"("gameId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PlayIntentGame_playIntentId_gameId_key" ON "public"."PlayIntentGame"("playIntentId" ASC, "gameId" ASC);

-- CreateIndex
CREATE INDEX "PlayIntentPlatform_platformLabel_idx" ON "public"."PlayIntentPlatform"("platformLabel" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PlayIntentPlatform_playIntentId_platformLabel_key" ON "public"."PlayIntentPlatform"("playIntentId" ASC, "platformLabel" ASC);

-- CreateIndex
CREATE INDEX "Report_reportedUserId_createdAt_idx" ON "public"."Report"("reportedUserId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_handle_key" ON "public"."User"("handle" ASC);

-- CreateIndex
CREATE INDEX "UserGameInterest_gameId_intentType_idx" ON "public"."UserGameInterest"("gameId" ASC, "intentType" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "UserGameInterest_userId_gameId_key" ON "public"."UserGameInterest"("userId" ASC, "gameId" ASC);

-- CreateIndex
CREATE INDEX "UserGameInterestPlatform_platformLabel_idx" ON "public"."UserGameInterestPlatform"("platformLabel" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "UserGameInterestPlatform_userGameInterestId_platformLabel_key" ON "public"."UserGameInterestPlatform"("userGameInterestId" ASC, "platformLabel" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "UserIdentity_provider_providerUserId_key" ON "public"."UserIdentity"("provider" ASC, "providerUserId" ASC);

-- AddForeignKey
ALTER TABLE "public"."Block" ADD CONSTRAINT "Block_blockedUserId_fkey" FOREIGN KEY ("blockedUserId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Block" ADD CONSTRAINT "Block_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DiscordActivityObservation" ADD CONSTRAINT "DiscordActivityObservation_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "public"."Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DiscordActivityObservation" ADD CONSTRAINT "DiscordActivityObservation_sourceServerId_fkey" FOREIGN KEY ("sourceServerId") REFERENCES "public"."DiscordServer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DiscordActivityObservation" ADD CONSTRAINT "DiscordActivityObservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DiscordServerMembership" ADD CONSTRAINT "DiscordServerMembership_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "public"."DiscordServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DiscordServerMembership" ADD CONSTRAINT "DiscordServerMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DiscordServerPreference" ADD CONSTRAINT "DiscordServerPreference_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "public"."DiscordServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DiscordServerPreference" ADD CONSTRAINT "DiscordServerPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Friend" ADD CONSTRAINT "Friend_friendedUserId_fkey" FOREIGN KEY ("friendedUserId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Friend" ADD CONSTRAINT "Friend_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GameAlias" ADD CONSTRAINT "GameAlias_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "public"."Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GamePlatform" ADD CONSTRAINT "GamePlatform_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "public"."Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GameSource" ADD CONSTRAINT "GameSource_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "public"."Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "public"."Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlayIntent" ADD CONSTRAINT "PlayIntent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlayIntentGame" ADD CONSTRAINT "PlayIntentGame_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "public"."Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlayIntentGame" ADD CONSTRAINT "PlayIntentGame_playIntentId_fkey" FOREIGN KEY ("playIntentId") REFERENCES "public"."PlayIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlayIntentPlatform" ADD CONSTRAINT "PlayIntentPlatform_playIntentId_fkey" FOREIGN KEY ("playIntentId") REFERENCES "public"."PlayIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Report" ADD CONSTRAINT "Report_reportedUserId_fkey" FOREIGN KEY ("reportedUserId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Report" ADD CONSTRAINT "Report_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserGameInterest" ADD CONSTRAINT "UserGameInterest_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "public"."Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserGameInterest" ADD CONSTRAINT "UserGameInterest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserGameInterestPlatform" ADD CONSTRAINT "UserGameInterestPlatform_userGameInterestId_fkey" FOREIGN KEY ("userGameInterestId") REFERENCES "public"."UserGameInterest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserIdentity" ADD CONSTRAINT "UserIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

