-- CreateEnum
CREATE TYPE "ServiceRequestType" AS ENUM ('CALL_STAFF', 'CHECKOUT', 'OTHER');

-- CreateEnum
CREATE TYPE "ServiceRequestStatus" AS ENUM ('PENDING', 'RESOLVED', 'CANCELLED');

-- AlterTable: move payments from order-level to table-session-level.
ALTER TABLE "payments" ADD COLUMN "tableSessionId" TEXT;

-- Backfill old payments by creating a closed table session for paid orders that do not have one.
INSERT INTO "table_sessions" ("id", "token", "status", "openedAt", "closedAt", "tableId")
SELECT
    'migrated-payment-' || p."id",
    'migrated-payment-' || p."id",
    'CLOSED',
    o."createdAt",
    p."paidAt",
    o."tableId"
FROM "payments" p
JOIN "orders" o ON o."id" = p."orderId"
WHERE o."tableSessionId" IS NULL
ON CONFLICT ("token") DO NOTHING;

UPDATE "orders" o
SET "tableSessionId" = 'migrated-payment-' || p."id"
FROM "payments" p
WHERE p."orderId" = o."id"
  AND o."tableSessionId" IS NULL;

UPDATE "payments" p
SET "tableSessionId" = o."tableSessionId"
FROM "orders" o
WHERE p."orderId" = o."id";

ALTER TABLE "payments" ALTER COLUMN "tableSessionId" SET NOT NULL;

ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_orderId_fkey";
DROP INDEX IF EXISTS "payments_orderId_key";
ALTER TABLE "payments" DROP COLUMN IF EXISTS "orderId";

-- CreateTable
CREATE TABLE "service_requests" (
    "id" TEXT NOT NULL,
    "type" "ServiceRequestType" NOT NULL,
    "status" "ServiceRequestStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "tableId" TEXT NOT NULL,
    "tableSessionId" TEXT,
    "orderId" TEXT,

    CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentId" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "tableSessionId" TEXT NOT NULL,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_items" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "optionTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(10,2) NOT NULL,
    "note" TEXT,
    "orderId" TEXT,
    "receiptId" TEXT NOT NULL,

    CONSTRAINT "receipt_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_requests_tableId_status_idx" ON "service_requests"("tableId", "status");

-- CreateIndex
CREATE INDEX "service_requests_tableSessionId_status_idx" ON "service_requests"("tableSessionId", "status");

-- CreateIndex
CREATE INDEX "service_requests_orderId_idx" ON "service_requests"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tableSessionId_key" ON "payments"("tableSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_number_key" ON "receipts"("number");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_paymentId_key" ON "receipts"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_tableSessionId_key" ON "receipts"("tableSessionId");

-- CreateIndex
CREATE INDEX "receipts_tableId_idx" ON "receipts"("tableId");

-- CreateIndex
CREATE INDEX "receipts_tableSessionId_idx" ON "receipts"("tableSessionId");

-- CreateIndex
CREATE INDEX "receipt_items_receiptId_idx" ON "receipt_items"("receiptId");

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "restaurant_tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_tableSessionId_fkey" FOREIGN KEY ("tableSessionId") REFERENCES "table_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tableSessionId_fkey" FOREIGN KEY ("tableSessionId") REFERENCES "table_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "restaurant_tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_tableSessionId_fkey" FOREIGN KEY ("tableSessionId") REFERENCES "table_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_items" ADD CONSTRAINT "receipt_items_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
