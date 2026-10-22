/**
 * ค่าที่ต่างกันตามแต่ละร้าน/แต่ละที่ deploy — ตั้งผ่าน .env ไม่ต้องแก้โค้ด
 * ดูตัวอย่างที่ .env.example
 */

/** ชื่อร้านที่แสดงบนหัวจอและใบเสร็จ */
export const RESTAURANT_NAME =
  import.meta.env.VITE_RESTAURANT_NAME ?? 'ร้านอาหารตามใจ ไม่ตามสั่ง'

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
  import.meta.env.VITE_LOGIN_EMAIL_DOMAIN ?? 'restaurant.local'

/** ตรงกับ @Max ของ quantity ฝั่ง backend (order-item-input.dto.ts) — เกินนี้ backend ตอบ 400 */
export const MAX_ITEM_QUANTITY = 99
