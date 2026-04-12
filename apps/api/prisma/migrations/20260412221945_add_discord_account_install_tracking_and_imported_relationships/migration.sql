-- CreateEnum
CREATE TYPE "DiscordRelationshipType" AS ENUM ('FRIEND', 'BLOCKED', 'PENDING_INCOMING', 'PENDING_OUTGOING');

-- CreateTable
CREATE TABLE "DiscordAccountInstall" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "discordUserId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "installed" BOOLEAN NOT NULL DEFAULT true,
    "grantedScopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastAuthorizedAt" TIMESTAMP(3),
    "lastDeauthorizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscordAccountInstall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscordRelationship" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "relationshipType" "DiscordRelationshipType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscordRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscordAccountInstall_userId_key" ON "DiscordAccountInstall"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscordAccountInstall_discordUserId_key" ON "DiscordAccountInstall"("discordUserId");

-- CreateIndex
CREATE INDEX "DiscordAccountInstall_installed_idx" ON "DiscordAccountInstall"("installed");

-- CreateIndex
CREATE INDEX "DiscordRelationship_ownerUserId_relationshipType_idx" ON "DiscordRelationship"("ownerUserId", "relationshipType");

-- CreateIndex
CREATE UNIQUE INDEX "DiscordRelationship_ownerUserId_discordUserId_key" ON "DiscordRelationship"("ownerUserId", "discordUserId");

-- AddForeignKey
ALTER TABLE "DiscordAccountInstall" ADD CONSTRAINT "DiscordAccountInstall_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscordRelationship" ADD CONSTRAINT "DiscordRelationship_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
