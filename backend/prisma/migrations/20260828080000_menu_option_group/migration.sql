/*
  แยกตัวเลือกเมนูเป็น 2 กลุ่ม: เนื้อสัตว์ (PROTEIN) กับ เพิ่มเติมอื่น ๆ (EXTRA)
  ของเดิมทั้งหมดตั้งเป็น EXTRA ก่อน แล้ว backfill ตัวที่ชื่อเป็นเนื้อสัตว์ให้เป็น PROTEIN
*/

-- CreateEnum
CREATE TYPE "MenuOptionGroup" AS ENUM ('PROTEIN', 'EXTRA');

-- AlterTable
ALTER TABLE "menu_options"
  ADD COLUMN "group" "MenuOptionGroup" NOT NULL DEFAULT 'EXTRA';

-- Backfill: ตัวเลือกที่เป็นเนื้อสัตว์ตามข้อมูลที่มีอยู่
UPDATE "menu_options"
SET "group" = 'PROTEIN'
WHERE "name" IN ('หมู', 'ไก่', 'หมูกรอบ', 'กุ้ง', 'หมูสับ', 'เนื้อ', 'ทะเล');

-- CreateIndex
CREATE INDEX "menu_options_menuItemId_group_idx" ON "menu_options"("menuItemId", "group");
