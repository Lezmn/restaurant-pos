/**
 * ส่วนลดเป็น % — สูตรเดียวกับ backend (payments.service applyDiscountPercent)
 * คิดเป็นสตางค์ (จำนวนเต็ม) แล้วปัดครึ่งขึ้น ยอด QR PromptPay ต้องตรงกับที่ backend บันทึก
 * percent ต้องเป็นจำนวนเต็ม 1-100 (ไม่ใช่ = ไม่ลด)
 * cash = เงินสด: ปัดยอดเก็บเป็นบาทเต็ม (เศษสตางค์ทอนไม่ได้) แบบปัดครึ่งขึ้น — .50 ขึ้นไปปัดขึ้น
 */
export function applyDiscountPercent(amountDue: number, percent: number, cash = false) {
  const dueSatang = Math.round(amountDue * 100)
  if (!isValidDiscountPercent(percent)) return { discount: 0, charged: dueSatang / 100 }
  // dueSatang × percent เป็นจำนวนเต็ม หาร 100 แล้วเศษเป็น .xx ปัดครึ่งขึ้นได้ตรง
  let chargedSatang = dueSatang - Math.round((dueSatang * percent) / 100)
  if (cash) chargedSatang = Math.round(chargedSatang / 100) * 100
  return {
    discount: (dueSatang - chargedSatang) / 100,
    charged: chargedSatang / 100,
  }
}

export function isValidDiscountPercent(percent: number) {
  return Number.isInteger(percent) && percent >= 1 && percent <= 100
}
