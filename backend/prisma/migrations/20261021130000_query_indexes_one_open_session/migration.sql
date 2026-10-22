/*
  index ที่ query หลักใช้แต่ยังไม่มี + กันโต๊ะเดียวเปิด QR session ซ้อนกัน
  - order_items.orderId: Postgres ไม่สร้าง index ให้ foreign key เอง ทุก include: { items } วิ่งผ่านคอลัมน์นี้
  - payments.paidAt / receipts.issuedAt / orders.createdAt: รายงาน ปิดยอด และออกเลขใบเสร็จกรองตามช่วงเวลา
  - orders.status: GET /orders ค่า default ดึงออเดอร์ที่ยังไม่จบ (บอร์ดครัว)
*/

-- CreateIndex
CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId");

-- CreateIndex
CREATE INDEX "order_items_menuItemId_idx" ON "order_items"("menuItemId");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_createdAt_idx" ON "orders"("createdAt");

-- CreateIndex
CREATE INDEX "payments_paidAt_idx" ON "payments"("paidAt");

-- CreateIndex
CREATE INDEX "receipts_issuedAt_idx" ON "receipts"("issuedAt");

-- โต๊ะหนึ่งมี session OPEN ได้ทีละใบ — โค้ดเช็ค findFirst ก่อน create อยู่แล้ว แต่สองเครื่องกดพร้อมกัน
-- (หรือยกเลิกบิลแล้วเปิด session เก่ากลับ) ผ่านเช็คได้ทั้งคู่ใน READ COMMITTED ให้ DB เป็นคนกันแทน
-- ถ้า migration นี้ล้มเพราะข้อมูลเดิมมีโต๊ะที่เปิดซ้อนอยู่แล้ว ให้ปิด/เก็บเงิน session ที่เกินก่อนแล้วรันใหม่
CREATE UNIQUE INDEX "table_sessions_one_open_per_table" ON "table_sessions"("tableId") WHERE "status" = 'OPEN';
