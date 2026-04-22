ALTER TABLE "PlayIntent"
ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "PlayIntent_deletedAt_idx" ON "PlayIntent"("deletedAt");