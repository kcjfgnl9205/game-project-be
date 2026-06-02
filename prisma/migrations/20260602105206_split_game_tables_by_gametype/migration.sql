/*
  Warnings:

  - You are about to drop the column `drawTimeSec` on the `Room` table. All the data in the column will be lost.
  - You are about to drop the column `rounds` on the `Room` table. All the data in the column will be lost.
  - You are about to drop the `GameWord` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PlayerStat` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `gameType` to the `Room` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `PlayerStat` DROP FOREIGN KEY `PlayerStat_userId_fkey`;

-- DropIndex
DROP INDEX `Room_status_idx` ON `Room`;

-- AlterTable
ALTER TABLE `Room` DROP COLUMN `drawTimeSec`,
    DROP COLUMN `rounds`,
    ADD COLUMN `gameType` ENUM('SKETCH_PIC') NOT NULL;

-- DropTable
DROP TABLE `GameWord`;

-- DropTable
DROP TABLE `PlayerStat`;

-- CreateTable
CREATE TABLE `SketchPicConfig` (
    `roomId` VARCHAR(191) NOT NULL,
    `rounds` INTEGER NOT NULL DEFAULT 5,
    `drawTimeSec` INTEGER NOT NULL DEFAULT 60,

    PRIMARY KEY (`roomId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SketchPicWord` (
    `id` VARCHAR(191) NOT NULL,
    `word` VARCHAR(30) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SketchPicWord_word_key`(`word`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SketchPicStat` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `playCount` INTEGER NOT NULL DEFAULT 0,
    `winCount` INTEGER NOT NULL DEFAULT 0,
    `totalScore` INTEGER NOT NULL DEFAULT 0,
    `drawCount` INTEGER NOT NULL DEFAULT 0,
    `correctCount` INTEGER NOT NULL DEFAULT 0,
    `lastPlayedAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SketchPicStat_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Room_gameType_status_idx` ON `Room`(`gameType`, `status`);

-- AddForeignKey
ALTER TABLE `SketchPicConfig` ADD CONSTRAINT `SketchPicConfig_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `Room`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SketchPicStat` ADD CONSTRAINT `SketchPicStat_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
