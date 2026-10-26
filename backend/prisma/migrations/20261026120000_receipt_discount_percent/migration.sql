-- ส่วนลดเปลี่ยนจาก "พิมพ์ราคาที่เก็บจริง" เป็น "ลดกี่ %" — เก็บ % ไว้พิมพ์ในใบเสร็จ
-- บิลเก่าเป็น null (มีแค่ยอดส่วนลดเป็นบาท)
ALTER TABLE "receipts" ADD COLUMN "discountPercent" INTEGER;
