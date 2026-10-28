-- ลบเมนูแบบซ่อน: เมนูที่เคยถูกสั่งแล้วลบจริงไม่ได้ จึงตั้ง deletedAt แทน (null = ยังใช้อยู่)
ALTER TABLE "menu_items" ADD COLUMN "deletedAt" TIMESTAMP(3);
