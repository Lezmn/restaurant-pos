-- ตรวจสลิป PromptPay ด้วย SlipOK — เพิ่มแต่คอลัมน์ที่เป็น null ได้ บิลเก่าไม่กระทบ
-- (slipStatus = null คือบิลเงินสด หรือ PromptPay ที่บันทึกก่อนมีระบบตรวจสลิป)

-- CreateEnum
CREATE TYPE "SlipStatus" AS ENUM ('VERIFIED', 'PENDING', 'FAILED', 'MANUAL');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "slipAmount" DECIMAL(10,2),
ADD COLUMN     "slipAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "slipCheckedAt" TIMESTAMP(3),
ADD COLUMN     "slipMessage" TEXT,
ADD COLUMN     "slipOverrideByName" TEXT,
ADD COLUMN     "slipOverrideReason" TEXT,
ADD COLUMN     "slipPayload" TEXT,
ADD COLUMN     "slipSendingBank" TEXT,
ADD COLUMN     "slipStatus" "SlipStatus",
ADD COLUMN     "slipTransAt" TIMESTAMP(3),
ADD COLUMN     "slipTransRef" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "payments_slipTransRef_key" ON "payments"("slipTransRef");

-- CreateIndex
CREATE INDEX "payments_slipStatus_idx" ON "payments"("slipStatus");

