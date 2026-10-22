-- "ออกจากระบบทุกเครื่อง" สำหรับบัญชีกลางตามตำแหน่ง — token ที่ tv ไม่ตรงกับค่านี้ใช้ไม่ได้
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;

