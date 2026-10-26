-- ออเดอร์กลับบ้าน: ใช้โต๊ะเสมือน 1 ตัว (isTakeaway) แต่ละบิลเป็น table_session ของตัวเอง
ALTER TABLE "restaurant_tables" ADD COLUMN "isTakeaway" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "table_sessions" ADD COLUMN "isTakeaway" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "takeawayNo" INTEGER,
ADD COLUMN "customerName" TEXT;

CREATE INDEX "table_sessions_isTakeaway_openedAt_idx" ON "table_sessions"("isTakeaway", "openedAt");

-- โต๊ะจริงยังเปิด session ได้ทีละใบเหมือนเดิม — ยกเว้นบิลกลับบ้านที่เปิดพร้อมกันหลายใบบนโต๊ะเสมือน
DROP INDEX "table_sessions_one_open_per_table";
CREATE UNIQUE INDEX "table_sessions_one_open_per_table" ON "table_sessions"("tableId") WHERE "status" = 'OPEN' AND "isTakeaway" = false;
