/*
  บันทึกว่าใครสร้างรายจ่าย — พนักงานบันทึกเงินที่หยิบจากลิ้นชักเองได้แล้ว
  รายการเก่าก่อน migration นี้ไม่รู้ผู้บันทึก ปล่อยเป็น null
*/

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN "createdById" TEXT,
ADD COLUMN "createdByName" TEXT;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
