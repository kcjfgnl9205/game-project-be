-- AlterTable
ALTER TABLE `Inquiry` ADD COLUMN `processedAt` DATETIME(3) NULL,
    MODIFY `email` VARCHAR(255) NULL;

