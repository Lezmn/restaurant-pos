-- จำนวนลูกค้าต่อโต๊ะ — Dashboard รวมเป็น "ลูกค้าเข้าใช้บริการ" (null = ไม่ได้ระบุ)
-- AlterTable
ALTER TABLE "table_sessions" ADD COLUMN     "guestCount" INTEGER;
