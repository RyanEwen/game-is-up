-- AlterEnum
ALTER TYPE "PlayIntentScope" ADD VALUE 'SPECIFIC_FRIENDS';

-- CreateTable
CREATE TABLE "PlayIntentTargetFriend" (
    "id" TEXT NOT NULL,
    "playIntentId" TEXT NOT NULL,
    "friendUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayIntentTargetFriend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayIntentTargetFriend_friendUserId_idx" ON "PlayIntentTargetFriend"("friendUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayIntentTargetFriend_playIntentId_friendUserId_key" ON "PlayIntentTargetFriend"("playIntentId", "friendUserId");

-- AddForeignKey
ALTER TABLE "PlayIntentTargetFriend" ADD CONSTRAINT "PlayIntentTargetFriend_playIntentId_fkey" FOREIGN KEY ("playIntentId") REFERENCES "PlayIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayIntentTargetFriend" ADD CONSTRAINT "PlayIntentTargetFriend_friendUserId_fkey" FOREIGN KEY ("friendUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
