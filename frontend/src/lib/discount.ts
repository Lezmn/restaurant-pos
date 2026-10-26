/**
 * ส่วนลดเป็น % — สูตรเดียวกับ backend (payments.service applyDiscountPercent)
 * คิดเป็นสตางค์ (จำนวนเต็ม) แล้วปัดครึ่งขึ้น ยอด QR PromptPay ต้องตรงกับที่ backend บันทึก
 * percent ต้องเป็นจำนวนเต็ม 1-100 (ไม่ใช่ = ไม่ลด)
 */
export function applyDiscountPercent(amountDue: number, percent: number) {
  const dueSatang = Math.round(amountDue * 100)
  // dueSatang × percent เป็นจำนวนเต็ม หาร 100 แล้วเศษเป็น .xx ปัดครึ่งขึ้นได้ตรง
  const discountSatang = isValidDiscountPercent(percent)
    ? Math.round((dueSatang * percent) / 100)
    : 0
  return {
    discount: discountSatang / 100,
    charged: (dueSatang - discountSatang) / 100,
  }
}

export function isValidDiscountPercent(percent: number) {
  return Number.isInteger(percent) && percent >= 1 && percent <= 100
}
