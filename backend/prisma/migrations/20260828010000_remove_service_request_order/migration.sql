/*
  Warnings:

  - You are about to drop the column `orderId` on the `service_requests` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "receipts" DROP CONSTRAINT "receipts_tableSessionId_fkey";

-- DropForeignKey
ALTER TABLE "service_requests" DROP CONSTRAINT "service_requests_orderId_fkey";

-- DropIndex
DROP INDEX "service_requests_orderId_idx";

-- AlterTable
ALTER TABLE "service_requests" DROP COLUMN "orderId";

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_tableSessionId_fkey" FOREIGN KEY ("tableSessionId") REFERENCES "table_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
