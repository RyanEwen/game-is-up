ALTER TABLE "UserIdentity"
DROP COLUMN "lastDiscordRelationshipsSyncAt",
DROP COLUMN "discordRelationshipSyncStatus",
DROP COLUMN "discordRelationshipSyncError";

DROP TABLE "DiscordRelationship";

DROP TABLE "DiscordAccountInstall";

DROP TYPE "DiscordRelationshipType";

DROP TYPE "DiscordRelationshipSyncStatus";