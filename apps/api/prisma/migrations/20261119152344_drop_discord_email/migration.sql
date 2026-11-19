-- Game's Up never used the Discord email address (D-017 privacy review, 2026-11-19): sign-in no
-- longer requests the `email` scope, and the stored addresses are deleted with their columns.

-- DropIndex
DROP INDEX "User_email_key";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "email";

-- AlterTable
ALTER TABLE "UserIdentity" DROP COLUMN "email";
