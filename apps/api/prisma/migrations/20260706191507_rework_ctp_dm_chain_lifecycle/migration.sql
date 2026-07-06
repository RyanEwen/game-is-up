/*
  Warnings:

  - You are about to drop the column `recipientResponseDiscordDmChannelId` on the `Notification` table. All the data in the column will be lost.
  - You are about to drop the column `recipientResponseDiscordDmMessageId` on the `Notification` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Notification" DROP COLUMN "recipientResponseDiscordDmChannelId",
DROP COLUMN "recipientResponseDiscordDmMessageId";

-- AlterTable
ALTER TABLE "PlayIntent" ADD COLUMN     "dmChainEndedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "PlayIntent_dmChainEndedAt_expiresAt_idx" ON "PlayIntent"("dmChainEndedAt", "expiresAt");
