-- AlterTable
ALTER TABLE `Room` MODIFY `gameType` ENUM('SKETCH_PIC', 'WHO_DREW') NOT NULL;

-- CreateTable
CREATE TABLE `WhoDrewConfig` (
    `roomId` VARCHAR(191) NOT NULL,
    `rounds` INTEGER NOT NULL DEFAULT 5,
    `turnTimeSec` INTEGER NOT NULL DEFAULT 20,
    `allowMidVote` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`roomId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WhoDrewWordPair` (
    `id` VARCHAR(191) NOT NULL,
    `civilianWord` VARCHAR(30) NOT NULL,
    `mafiaWord` VARCHAR(30) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `WhoDrewWordPair_civilianWord_mafiaWord_key`(`civilianWord`, `mafiaWord`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `WhoDrewConfig` ADD CONSTRAINT `WhoDrewConfig_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `Room`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
