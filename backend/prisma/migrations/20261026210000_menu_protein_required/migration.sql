-- ต่อเมนู: บังคับเลือกเนื้อสัตว์ไหม (ค่าเดิมของทุกเมนู = บังคับ) — ปิดได้ที่ฟอร์มแก้เมนู
ALTER TABLE "menu_items" ADD COLUMN "proteinRequired" BOOLEAN NOT NULL DEFAULT true;

-- ข้าวไข่เจียวสั่งเปล่า ๆ ได้ เนื้อ (หมูสับ/หมูกรอบ ฯลฯ) เป็นของเพิ่ม
UPDATE "menu_items" SET "proteinRequired" = false WHERE "name" = 'ข้าวไข่เจียว';
