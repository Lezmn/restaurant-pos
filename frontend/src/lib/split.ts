/**
 * หารเท่ากัน — สูตรเดียวกับ backend (payments/bill-split.ts splitShare)
 * ปัดลงเป็นสตางค์ คนสุดท้ายจ่ายส่วนที่เหลือ ยอด QR PromptPay ต้องตรงกับที่ backend จะบันทึก
 */
export function splitShare(total: number, parts: number, paidCount = 0, paidSum = 0) {
  const totalSatang = Math.round(total * 100)
  const paidSatang = Math.round(paidSum * 100)
  if (paidCount >= parts - 1) return (totalSatang - paidSatang) / 100
  return Math.floor(totalSatang / parts) / 100
}

export const MIN_SPLIT_PARTS = 2
export const MAX_SPLIT_PARTS = 20
