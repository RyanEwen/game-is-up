ALTER TABLE "UserIdentity"
ADD COLUMN "discordAccessToken" TEXT,
ADD COLUMN "discordRefreshToken" TEXT,
ADD COLUMN "discordAccessTokenExpiresAt" TIMESTAMP(3);