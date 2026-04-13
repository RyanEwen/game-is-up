-- AlterTable
ALTER TABLE "DiscordAutoPlayPrompt" ADD COLUMN     "discordDmChannelId" TEXT,
ADD COLUMN     "discordDmMessageId" TEXT;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "discordDmChannelId" TEXT,
ADD COLUMN     "discordDmMessageId" TEXT;
