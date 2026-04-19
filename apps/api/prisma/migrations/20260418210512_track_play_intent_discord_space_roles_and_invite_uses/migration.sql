-- AlterTable
ALTER TABLE "PlayIntentDiscordSpace" ADD COLUMN     "inviteUseCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "roleId" TEXT,
ADD COLUMN     "roleName" TEXT;
