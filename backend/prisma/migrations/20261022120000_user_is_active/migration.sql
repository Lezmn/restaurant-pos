-- ปิดใช้งานบัญชีพนักงานแทนการลบ (ประวัติปิดยอด/เบิกเงินยังผูกกับคนเดิม)
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;
