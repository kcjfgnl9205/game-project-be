-- AlterTable
ALTER TABLE `Inquiry` ADD COLUMN `privacyConsent` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `privacyConsentAt` DATETIME(3) NULL;

