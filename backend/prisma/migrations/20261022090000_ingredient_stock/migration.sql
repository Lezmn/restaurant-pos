/*
  สต็อกวัตถุดิบอัตโนมัติ
  - ingredients.stockQty: null = ไม่นับ (ปิดด้วยมือแบบเดิม) / นับอยู่ = ออเดอร์ตัดยอด เหลือ 0 ปิดเอง
  - menu_options.usageQty: ตัวเลือกนี้ใช้วัตถุดิบกี่หน่วย (0 = ผูกไว้ให้หมดตามอย่างเดียว ไม่ตัดเพิ่ม)
  - order_items.stockUsed: ยอดที่ตัดไปตอนสั่ง ไว้คืนตอนยกเลิก
*/

-- AlterTable
ALTER TABLE "ingredients" ADD COLUMN     "lowStockAt" INTEGER,
ADD COLUMN     "stockQty" INTEGER;

-- AlterTable
ALTER TABLE "menu_options" ADD COLUMN     "usageQty" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "stockUsed" JSONB;

-- กันยอดติดลบ ถ้าโค้ดตรงไหนพลาดให้ DB ปฏิเสธ ดีกว่าขายของที่ไม่มีจริง
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_stockQty_check" CHECK ("stockQty" IS NULL OR "stockQty" >= 0);
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_lowStockAt_check" CHECK ("lowStockAt" IS NULL OR "lowStockAt" >= 0);
ALTER TABLE "menu_options" ADD CONSTRAINT "menu_options_usageQty_check" CHECK ("usageQty" >= 0);

-- ข้าวไข่เจียวตัดไข่ 1 ฟองที่ตัวเมนูแล้ว ตัวเลือก "ไข่ 1 ฟอง" จึงไม่ต้องตัดซ้ำ ("ไข่ 2 ฟอง" = เพิ่มอีก 1)
UPDATE "menu_options" o SET "usageQty" = 0
WHERE o."name" = 'ไข่ 1 ฟอง'
  AND o."ingredientId" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "menu_item_ingredients" mi
    WHERE mi."menuItemId" = o."menuItemId" AND mi."ingredientId" = o."ingredientId"
  );
