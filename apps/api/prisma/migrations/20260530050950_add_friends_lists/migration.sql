-- AlterEnum
ALTER TYPE "PlayIntentScope" ADD VALUE 'SPECIFIC_FRIENDS_LIST';

-- AlterTable
ALTER TABLE "PlayIntent" ADD COLUMN     "targetFriendsListId" TEXT;

-- CreateTable
CREATE TABLE "FriendsList" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FriendsList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FriendsListMember" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "friendUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FriendsListMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FriendsList_userId_idx" ON "FriendsList"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FriendsList_userId_name_key" ON "FriendsList"("userId", "name");

-- CreateIndex
CREATE INDEX "FriendsListMember_friendUserId_idx" ON "FriendsListMember"("friendUserId");

-- CreateIndex
CREATE UNIQUE INDEX "FriendsListMember_listId_friendUserId_key" ON "FriendsListMember"("listId", "friendUserId");

-- AddForeignKey
ALTER TABLE "FriendsList" ADD CONSTRAINT "FriendsList_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendsListMember" ADD CONSTRAINT "FriendsListMember_listId_fkey" FOREIGN KEY ("listId") REFERENCES "FriendsList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendsListMember" ADD CONSTRAINT "FriendsListMember_friendUserId_fkey" FOREIGN KEY ("friendUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayIntent" ADD CONSTRAINT "PlayIntent_targetFriendsListId_fkey" FOREIGN KEY ("targetFriendsListId") REFERENCES "FriendsList"("id") ON DELETE SET NULL ON UPDATE CASCADE;
