/*
  หมายเหตุตอนรับเงิน (เช่น "ลูกค้าขอใบกำกับภาษี", "จ่ายแยก 2 คน")
  เก็บทั้งที่ payment (ต้นทาง) และ receipt (สำเนาสำหรับพิมพ์ย้อนหลัง)
  เดิมพิมพ์ลงกระดาษอย่างเดียว เปิดใบเสร็จย้อนหลังแล้วหมายเหตุหาย
*/

-- AlterTable
ALTER TABLE "payments" ADD COLUMN "note" TEXT;

-- AlterTable
ALTER TABLE "receipts" ADD COLUMN "note" TEXT;
