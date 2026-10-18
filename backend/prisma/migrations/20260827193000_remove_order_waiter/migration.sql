-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_waiterId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "orders_waiterId_idx";

-- AlterTable
ALTER TABLE "orders" DROP COLUMN IF EXISTS "waiterId";
