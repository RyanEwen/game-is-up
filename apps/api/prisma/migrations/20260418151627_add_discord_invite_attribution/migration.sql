-- CreateEnum
CREATE TYPE "DiscordInviteAttributionKind" AS ENUM ('DIRECT', 'SERVER');

-- CreateTable
CREATE TABLE "DiscordInviteAttribution" (
    "id" TEXT NOT NULL,
    "acceptedUserId" TEXT NOT NULL,
    "inviterUserId" TEXT,
    "inviterDiscordUserId" TEXT,
    "inviterLabel" TEXT,
    "serverId" TEXT,
    "serverName" TEXT,
    "hintedMemberCount" INTEGER,
    "kind" "DiscordInviteAttributionKind" NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscordInviteAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiscordInviteAttribution_acceptedUserId_acceptedAt_idx" ON "DiscordInviteAttribution"("acceptedUserId", "acceptedAt");

-- CreateIndex
CREATE INDEX "DiscordInviteAttribution_inviterUserId_acceptedAt_idx" ON "DiscordInviteAttribution"("inviterUserId", "acceptedAt");

-- CreateIndex
CREATE INDEX "DiscordInviteAttribution_serverId_acceptedAt_idx" ON "DiscordInviteAttribution"("serverId", "acceptedAt");

-- AddForeignKey
ALTER TABLE "DiscordInviteAttribution" ADD CONSTRAINT "DiscordInviteAttribution_acceptedUserId_fkey" FOREIGN KEY ("acceptedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscordInviteAttribution" ADD CONSTRAINT "DiscordInviteAttribution_inviterUserId_fkey" FOREIGN KEY ("inviterUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscordInviteAttribution" ADD CONSTRAINT "DiscordInviteAttribution_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "DiscordServer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
