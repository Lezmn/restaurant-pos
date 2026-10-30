import { Prisma } from '@prisma/client';

type Money = Prisma.Decimal | number;

const baht = (v: Money) =>
  `฿${Number(v).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "2026-10-26" → "26/10/2569" (วันที่แบบไทยที่ร้านคุ้น) */
const thaiDate = (dateKey: string) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  return `${d}/${m}/${y + 543}`;
};

/**
 * ข้อความสรุปยอดตอนปิดยอดวัน — ส่งเข้า LINE เจ้าของร้าน
 * เน้นสิ่งที่เจ้าของต้องรู้ทันที: ขายได้เท่าไร และเงินในลิ้นชักขาด/เกินไหม
 */
export function formatCashCloseSummary(input: {
  /** ชื่อร้าน (RESTAURANT_NAME ใน .env) — ไม่ตั้ง = ไม่ใส่ */
  restaurantName?: string;
  date: string;
  cashSales: Money;
  promptpaySales: Money;
  drawerExpenses: Money;
  openingFloat: Money;
  expectedCash: Money;
  countedCash: Money;
  difference: Money;
  paymentCount: number;
  closedByName: string;
  note?: string | null;
}) {
  const total = Number(input.cashSales) + Number(input.promptpaySales);
  const diff = Number(input.difference);
  let diffLine = '✅ เงินตรงพอดี';
  if (diff < 0) diffLine = `⚠️ เงินขาด ${baht(-diff)}`;
  else if (diff > 0) diffLine = `⚠️ เงินเกิน ${baht(diff)}`;
  const restaurantSuffix = input.restaurantName ? ` ${input.restaurantName}` : '';

  return [
    `📊 สรุปยอดปิดร้าน${restaurantSuffix}`,
    `วันที่ ${thaiDate(input.date)}`,
    '',
    `ยอดขายรวม ${baht(total)} (${input.paymentCount} บิล)`,
    `• เงินสด ${baht(input.cashSales)}`,
    `• PromptPay ${baht(input.promptpaySales)}`,
    '',
    `💵 ลิ้นชัก`,
    `เงินทอนตั้งต้น ${baht(input.openingFloat)}`,
    `จ่ายออกจากลิ้นชัก ${baht(input.drawerExpenses)}`,
    `ควรมี ${baht(input.expectedCash)} · นับได้ ${baht(input.countedCash)}`,
    diffLine,
    '',
    `ปิดยอดโดย ${input.closedByName}`,
    ...(input.note ? [`หมายเหตุ: ${input.note}`] : []),
  ].join('\n');
}
