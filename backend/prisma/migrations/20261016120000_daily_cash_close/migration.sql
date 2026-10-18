/*
  ปิดยอดเงินสดประจำวัน (ร้านมีแคชเชียร์คนเดียว ไม่ต้องแยกกะ)
  - expenses.paidFromDrawer: รายจ่ายที่หยิบเงินจากลิ้นชัก นับเป็นเงินออกตอนปิดยอด
  - daily_cash_closes: วันละ 1 แถว เก็บ snapshot ยอดที่คาดไว้กับยอดที่นับได้
*/

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN "paidFromDrawer" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "daily_cash_closes" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "openingFloat" DECIMAL(10,2) NOT NULL,
    "cashSales" DECIMAL(10,2) NOT NULL,
    "drawerExpenses" DECIMAL(10,2) NOT NULL,
    "expectedCash" DECIMAL(10,2) NOT NULL,
    "countedCash" DECIMAL(10,2) NOT NULL,
    "difference" DECIMAL(10,2) NOT NULL,
    "promptpaySales" DECIMAL(10,2) NOT NULL,
    "note" TEXT,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedById" TEXT,
    "closedByName" TEXT NOT NULL,

    CONSTRAINT "daily_cash_closes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_cash_closes_date_key" ON "daily_cash_closes"("date");

-- AddForeignKey
ALTER TABLE "daily_cash_closes" ADD CONSTRAINT "daily_cash_closes_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
