-- แยกบิล 2 แบบ
-- 1) เลือกรายการ: รายการที่คนหนึ่งจ่ายถูกย้ายไปออเดอร์ใหม่ (splitFromId ชี้ออเดอร์ต้นทาง)
-- 2) หารเท่ากัน: bill_splits ล็อกยอดไว้ รับเงินทีละคน (payments.splitPart) ส่วนสุดท้ายผูกออเดอร์

CREATE TYPE "BillSplitStatus" AS ENUM ('OPEN', 'DONE');

CREATE TABLE "bill_splits" (
    "id" TEXT NOT NULL,
    "parts" INTEGER NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "discountPercent" INTEGER,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL,
    "status" "BillSplitStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tableSessionId" TEXT NOT NULL,

    CONSTRAINT "bill_splits_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "bill_splits_tableSessionId_status_idx" ON "bill_splits"("tableSessionId", "status");
ALTER TABLE "bill_splits" ADD CONSTRAINT "bill_splits_tableSessionId_fkey" FOREIGN KEY ("tableSessionId") REFERENCES "table_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "orders" ADD COLUMN "splitFromId" TEXT;
ALTER TABLE "orders" ADD COLUMN "billSplitId" TEXT;
CREATE INDEX "orders_billSplitId_idx" ON "orders"("billSplitId");
ALTER TABLE "orders" ADD CONSTRAINT "orders_billSplitId_fkey" FOREIGN KEY ("billSplitId") REFERENCES "bill_splits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payments" ADD COLUMN "billSplitId" TEXT;
ALTER TABLE "payments" ADD COLUMN "splitPart" INTEGER;
CREATE INDEX "payments_billSplitId_idx" ON "payments"("billSplitId");
ALTER TABLE "payments" ADD CONSTRAINT "payments_billSplitId_fkey" FOREIGN KEY ("billSplitId") REFERENCES "bill_splits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "receipts" ADD COLUMN "splitPart" INTEGER;
ALTER TABLE "receipts" ADD COLUMN "splitParts" INTEGER;
