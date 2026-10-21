/*
  วัตถุดิบหลักของเมนู + รวมไข่เป็นวัตถุดิบเดียว
  - เมนูผูกวัตถุดิบได้หลายอัน (ข้าวไข่เจียว → ไข่) วัตถุดิบหมด = ทั้งเมนูสั่งไม่ได้
  - "ไข่ดาว" กับ "ไข่เจียว" เป็นวิธีทำ ไม่ใช่ของในครัว รวมเป็น "ไข่" ตัวเดียว ปิดไข่ทีเดียวหมดทุกอย่าง
  - ตัวเลือกที่ผูกวัตถุดิบแล้วเปิด/ปิดที่วัตถุดิบที่เดียว จึงเปิดตัวเลือกที่ปิดค้างไว้คืนให้หมด
    ไม่งั้นจะค้างปิดอยู่โดยไม่มีสวิตช์ให้เปิด
*/

-- CreateTable
CREATE TABLE "menu_item_ingredients" (
    "menuItemId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,

    CONSTRAINT "menu_item_ingredients_pkey" PRIMARY KEY ("menuItemId","ingredientId")
);

-- CreateIndex
CREATE INDEX "menu_item_ingredients_ingredientId_idx" ON "menu_item_ingredients"("ingredientId");

-- AddForeignKey
ALTER TABLE "menu_item_ingredients" ADD CONSTRAINT "menu_item_ingredients_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_ingredients" ADD CONSTRAINT "menu_item_ingredients_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- รวมไข่: สร้าง "ไข่" (ถ้ายังไม่มี) เฉพาะฐานที่มีวัตถุดิบหรือตัวเลือกไข่อยู่ ตัวไหนหมดอยู่ก็ถือว่าไข่หมด
INSERT INTO "ingredients" ("id", "name", "isAvailable", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'ไข่', bool_and(egg."isAvailable"), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
  SELECT "isAvailable" FROM "ingredients" WHERE "name" IN ('ไข่ดาว', 'ไข่เจียว')
  UNION ALL
  SELECT true FROM "menu_options" WHERE "name" IN ('ไข่ดาว', 'ไข่เจียว', 'ไข่ 1 ฟอง', 'ไข่ 2 ฟอง')
) egg
HAVING count(*) > 0
ON CONFLICT ("name") DO NOTHING;

-- ตัวเลือกที่ผูกไข่ดาว/ไข่เจียวอยู่ หรือเป็นตัวเลือกไข่ที่ยังไม่ได้ผูกอะไร → ผูกกับ "ไข่"
UPDATE "menu_options"
SET "ingredientId" = (SELECT "id" FROM "ingredients" WHERE "name" = 'ไข่')
WHERE "ingredientId" IN (SELECT "id" FROM "ingredients" WHERE "name" IN ('ไข่ดาว', 'ไข่เจียว'))
   OR ("ingredientId" IS NULL AND "name" IN ('ไข่ดาว', 'ไข่เจียว', 'ไข่ 1 ฟอง', 'ไข่ 2 ฟอง'));

DELETE FROM "ingredients" WHERE "name" IN ('ไข่ดาว', 'ไข่เจียว');

-- ข้าวไข่เจียวใช้ไข่เสมอ ไม่ว่าจะเลือกตัวเลือกอะไร
INSERT INTO "menu_item_ingredients" ("menuItemId", "ingredientId")
SELECT m."id", i."id"
FROM "menu_items" m
JOIN "ingredients" i ON i."name" = 'ไข่'
WHERE m."name" = 'ข้าวไข่เจียว'
ON CONFLICT DO NOTHING;

UPDATE "menu_options" SET "isAvailable" = true
WHERE "ingredientId" IS NOT NULL AND "isAvailable" = false;
