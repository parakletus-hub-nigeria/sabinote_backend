-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN "notifyGenerationComplete" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "notifyWalletTopup" BOOLEAN NOT NULL DEFAULT true;
