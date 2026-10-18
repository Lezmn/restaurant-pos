/*
  วัตถุดิบกลางของร้าน — ผูกกับตัวเลือกเมนูได้หลายอัน
  ของหมดปิดที่เดียว ตัวเลือกที่ผูกไว้หมดตามทุกเมนู ไม่ต้องไล่ปิดทีละเมนู
*/

-- CreateTable
CREATE TABLE "ingredients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ingredients_name_key" ON "ingredients"("name");

-- AlterTable
ALTER TABLE "menu_options" ADD COLUMN "ingredientId" TEXT;

-- CreateIndex
CREATE INDEX "menu_options_ingredientId_idx" ON "menu_options"("ingredientId");

-- AddForeignKey
ALTER TABLE "menu_options" ADD CONSTRAINT "menu_options_ingredientId_fkey"
  FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
