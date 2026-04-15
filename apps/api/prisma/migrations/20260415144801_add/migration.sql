-- AlterEnum
ALTER TYPE "PlayIntentScope" ADD VALUE 'SPECIFIC_DISCORD_SERVER';

-- AlterTable
ALTER TABLE "PlayIntent" ADD COLUMN     "targetDiscordServerId" TEXT;

-- CreateIndex
CREATE INDEX "PlayIntent_targetDiscordServerId_expiresAt_idx" ON "PlayIntent"("targetDiscordServerId", "expiresAt");

-- AddForeignKey
ALTER TABLE "PlayIntent" ADD CONSTRAINT "PlayIntent_targetDiscordServerId_fkey" FOREIGN KEY ("targetDiscordServerId") REFERENCES "DiscordServer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
