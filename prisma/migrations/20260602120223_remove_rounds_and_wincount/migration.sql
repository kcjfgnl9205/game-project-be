/*
  Warnings:

  - You are about to drop the column `rounds` on the `SketchPicConfig` table. All the data in the column will be lost.
  - You are about to drop the column `winCount` on the `SketchPicStat` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `SketchPicConfig` DROP COLUMN `rounds`;

-- AlterTable
ALTER TABLE `SketchPicStat` DROP COLUMN `winCount`;
