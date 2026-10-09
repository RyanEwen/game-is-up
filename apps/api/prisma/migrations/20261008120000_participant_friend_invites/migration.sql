ALTER TABLE "PlayIntent" ADD COLUMN "allowParticipantInvites" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "DiscordCtpComposerDraft" ADD COLUMN "allowParticipantInvites" BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE "PlayIntentParticipantInvite" (
  "id" TEXT NOT NULL,
  "playIntentId" TEXT NOT NULL,
  "inviterUserId" TEXT NOT NULL,
  "inviteeUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlayIntentParticipantInvite_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlayIntentParticipantInvite_playIntentId_inviteeUserId_key" ON "PlayIntentParticipantInvite"("playIntentId", "inviteeUserId");
CREATE INDEX "PlayIntentParticipantInvite_inviterUserId_idx" ON "PlayIntentParticipantInvite"("inviterUserId");
CREATE INDEX "PlayIntentParticipantInvite_inviteeUserId_idx" ON "PlayIntentParticipantInvite"("inviteeUserId");
ALTER TABLE "PlayIntentParticipantInvite" ADD CONSTRAINT "PlayIntentParticipantInvite_playIntentId_fkey" FOREIGN KEY ("playIntentId") REFERENCES "PlayIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlayIntentParticipantInvite" ADD CONSTRAINT "PlayIntentParticipantInvite_inviterUserId_fkey" FOREIGN KEY ("inviterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlayIntentParticipantInvite" ADD CONSTRAINT "PlayIntentParticipantInvite_inviteeUserId_fkey" FOREIGN KEY ("inviteeUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
