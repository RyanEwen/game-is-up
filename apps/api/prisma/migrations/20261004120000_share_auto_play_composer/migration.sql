-- Preserve existing manual drafts while allowing one draft for each automatic prompt.
ALTER TABLE "DiscordCtpComposerDraft" ADD COLUMN "contextKey" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "DiscordCtpComposerDraft" ADD COLUMN "autoPlayPromptId" TEXT;
DROP INDEX "DiscordCtpComposerDraft_userId_key";
CREATE UNIQUE INDEX "DiscordCtpComposerDraft_userId_contextKey_key" ON "DiscordCtpComposerDraft"("userId", "contextKey");
CREATE UNIQUE INDEX "DiscordCtpComposerDraft_autoPlayPromptId_key" ON "DiscordCtpComposerDraft"("autoPlayPromptId");
ALTER TABLE "DiscordCtpComposerDraft" ADD CONSTRAINT "DiscordCtpComposerDraft_autoPlayPromptId_fkey" FOREIGN KEY ("autoPlayPromptId") REFERENCES "DiscordAutoPlayPrompt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
