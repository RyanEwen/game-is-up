-- CreateEnum
CREATE TYPE "NotificationResponseChoice" AS ENUM ('JOIN', 'DECLINE');

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "playIntentId" TEXT,
ADD COLUMN     "respondedAt" TIMESTAMP(3),
ADD COLUMN     "responseChoice" "NotificationResponseChoice";

-- CreateIndex
CREATE INDEX "Notification_playIntentId_idx" ON "Notification"("playIntentId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_playIntentId_fkey" FOREIGN KEY ("playIntentId") REFERENCES "PlayIntent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
