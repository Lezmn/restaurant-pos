/**
 * ค่าที่ต่างกันตามแต่ละร้าน/แต่ละที่ deploy — ตั้งผ่าน .env ไม่ต้องแก้โค้ด
 * ดูตัวอย่างที่ .env.example
 */

/** ชื่อร้านที่แสดงบนหัวจอและใบเสร็จ */
// ใช้ || ไม่ใช่ ?? — build ใน Docker ส่ง ARG ที่ไม่ได้ตั้งมาเป็นสตริงว่าง ต้องตกไปใช้ค่าเริ่มต้นด้วย
export const RESTAURANT_NAME =
  import.meta.env.VITE_RESTAURANT_NAME || 'ร้านอาหารตามใจ ไม่ตามสั่ง'

/**
 * เบอร์พร้อมเพย์ หรือเลขประจำตัว 13 หลักของร้าน สำหรับสร้าง QR รับเงิน
 * ไม่ได้ตั้ง: ตอน dev ใช้เบอร์ตัวอย่าง · build จริงเป็น null = ไม่สร้าง QR เลย
 * (เบอร์ตัวอย่างอาจเป็นเบอร์ของคนจริง ลูกค้าสแกนแล้วเงินเข้าคนอื่น)
 */
export const PROMPTPAY_ID: string | null =
  import.meta.env.VITE_PROMPTPAY_ID || (import.meta.env.DEV ? '0812345678' : null)

/** true = ยังไม่ได้ตั้งค่าจริง (ใช้เบอร์ตัวอย่าง หรือไม่มี QR) ให้ UI เตือนไว้ */
export const IS_DEMO_PROMPTPAY = !import.meta.env.VITE_PROMPTPAY_ID

/**
 * โดเมนที่เติมท้ายชื่อผู้ใช้ตอน login — backend รับเฉพาะอีเมล
 * แต่พนักงานจำแค่ "admin" / "cashier" จึงเติม @โดเมน ให้เอง (ตรงกับ prisma/seed.ts)
 */
export const LOGIN_EMAIL_DOMAIN =
  import.meta.env.VITE_LOGIN_EMAIL_DOMAIN || 'restaurant.local'

/**
 * ชั่วโมงที่ร้านเปิด เรียงตามเวลาจริง — ใช้ตัดคอลัมน์ heatmap หน้ายอดขาย
 * open = ชั่วโมงแรก, close = ชั่วโมงสุดท้ายที่ยังรับออเดอร์ (22 = คอลัมน์ 22:00–23:00)
 * เปิดข้ามเที่ยงคืนได้ เช่น 17 ถึง 2 → [17, 18, …, 23, 0, 1, 2]
 * ค่าว่าง/ผิดรูป → null = ไม่ล็อก ให้ heatmap ตัดตามข้อมูลเอง
 */
export function parseBusinessHours(open?: string, close?: string): number[] | null {
  const isHour = (s?: string) => !!s && /^\d{1,2}$/.test(s.trim()) && Number(s) <= 23
  if (!isHour(open) || !isHour(close)) return null
  const first = Number(open)
  const length = ((Number(close) - first + 24) % 24) + 1
  return Array.from({ length }, (_, i) => (first + i) % 24)
}

export const BUSINESS_HOURS = parseBusinessHours(
  import.meta.env.VITE_OPEN_HOUR,
  import.meta.env.VITE_CLOSE_HOUR,
)

/** ตรงกับ @Max ของ quantity ฝั่ง backend (order-item-input.dto.ts) — เกินนี้ backend ตอบ 400 */
export const MAX_ITEM_QUANTITY = 99
