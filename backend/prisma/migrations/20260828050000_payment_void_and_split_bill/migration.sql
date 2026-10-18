/*
  Payment ยกเลิกได้ (void) และแยกบิลได้:
  - เพิ่ม PaymentStatus + คอลัมน์ voidedAt/voidReason
  - เลิกบังคับ 1 payment / 1 session (แยกบิล = หลาย payment ต่อ session)
  - เลิกบังคับ 1 receipt / 1 session ด้วยเหตุผลเดียวกัน
  - orders.paymentId บอกว่าออเดอร์นั้นถูกจ่ายด้วยบิลใบไหน
*/

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('COMPLETED', 'VOIDED');

-- AlterTable: payments
ALTER TABLE "payments"
  ADD COLUMN "status" "PaymentStatus" NOT NULL DEFAULT 'COMPLETED',
  ADD COLUMN "voidedAt" TIMESTAMP(3),
  ADD COLUMN "voidReason" TEXT;

DROP INDEX IF EXISTS "payments_tableSessionId_key";
CREATE INDEX "payments_tableSessionId_status_idx" ON "payments"("tableSessionId", "status");

-- AlterTable: receipts
DROP INDEX IF EXISTS "receipts_tableSessionId_key";

-- AlterTable: orders
ALTER TABLE "orders" ADD COLUMN "paymentId" TEXT;
CREATE INDEX "orders_paymentId_idx" ON "orders"("paymentId");

ALTER TABLE "orders" ADD CONSTRAINT "orders_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: ออเดอร์ที่จ่ายไปแล้วให้ผูกกับ payment ของ session ตัวเอง
UPDATE "orders" o
SET "paymentId" = p."id"
FROM "payments" p
WHERE p."tableSessionId" = o."tableSessionId"
  AND o."status" = 'PAID';
