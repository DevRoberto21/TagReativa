-- AlterTable
ALTER TABLE "User" ADD COLUMN     "twoFactorFailedAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "twoFactorLockedUntil" TIMESTAMP(3);
