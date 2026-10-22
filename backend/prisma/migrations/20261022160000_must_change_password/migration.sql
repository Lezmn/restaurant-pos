-- รหัสชั่วคราวของ ADMIN (ส่งมอบระบบ / ADMIN ตั้งรหัสให้กัน) ต้องเปลี่ยนก่อนใช้งาน
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
