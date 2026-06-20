-- AlterTable
ALTER TABLE `Room` MODIFY `gameType` ENUM('SKETCH_PIC', 'WHO_DREW', 'WORD_CHAIN') NOT NULL;

-- CreateTable
CREATE TABLE `WordChainConfig` (
    `roomId` VARCHAR(191) NOT NULL,
    `mode` ENUM('ROUND', 'TOURNAMENT') NOT NULL DEFAULT 'ROUND',
    `roundCount` INTEGER NOT NULL DEFAULT 3,
    `turnTimeSec` INTEGER NOT NULL DEFAULT 15,
    `allowKillerWord` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`roomId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WordChainWord` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `word` VARCHAR(40) NOT NULL,
    `firstChar` CHAR(1) NOT NULL,
    `lastChar` CHAR(1) NOT NULL,
    `length` INTEGER NOT NULL,
    `pos` VARCHAR(10) NOT NULL,
    `wordType` VARCHAR(10) NULL,
    `definition` TEXT NOT NULL,
    `example` TEXT NULL,

    UNIQUE INDEX `WordChainWord_word_key`(`word`),
    INDEX `WordChainWord_firstChar_idx`(`firstChar`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `WordChainConfig` ADD CONSTRAINT `WordChainConfig_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `Room`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

