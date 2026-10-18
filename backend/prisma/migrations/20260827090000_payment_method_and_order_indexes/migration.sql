-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'PROMPTPAY');

-- Preserve existing lowercase values while converting the payment method to an enum.
ALTER TABLE "payments"
  ALTER COLUMN "method" TYPE "PaymentMethod"
  USING UPPER("method")::"PaymentMethod";

-- CreateIndex
CREATE INDEX "menu_items_categoryId_idx" ON "menu_items"("categoryId");
CREATE INDEX "orders_tableId_status_idx" ON "orders"("tableId", "status");
CREATE INDEX "orders_waiterId_idx" ON "orders"("waiterId");
