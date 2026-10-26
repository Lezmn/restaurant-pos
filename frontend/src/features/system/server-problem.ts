import { ApiError } from '@/lib/api-client'
import type { CheckState } from './api'

/**
 * แปลง error ตอนดึง /system/status เป็นสถานะที่คนอ่านเข้าใจ
 * - เน็ตหลุด/เซิร์ฟเวอร์ไม่ตอบ (ไม่ใช่ ApiError) → แดง ติดต่อไม่ได้จริง
 * - 404 → เหลือง เซิร์ฟเวอร์ทำงาน แต่เป็นเวอร์ชันเก่าที่ยังไม่มีหน้านี้ (สั่งอาหาร/รับเงินได้ปกติ)
 * - 429 → เหลือง ส่งคำขอถี่เกินไป
 * - รหัสอื่น (500/503 ...) → แดง เซิร์ฟเวอร์ตอบกลับผิดพลาด
 */
export function describeServerProblem(error: unknown): { state: CheckState; message: string } | null {
  if (!error) return null
  if (!(error instanceof ApiError)) {
    return { state: 'error', message: 'ติดต่อเซิร์ฟเวอร์ไม่ได้ — ถ้าเน็ตเครื่องนี้ปกติ ให้แจ้งผู้ดูแลระบบ' }
  }
  if (error.status === 404) {
    return {
      state: 'warn',
      message:
        'เซิร์ฟเวอร์ทำงานอยู่ แต่เป็นเวอร์ชันเก่าที่ยังไม่มีหน้าสถานะนี้ (สั่งอาหาร/รับเงินได้ปกติ) — อัปเดตเซิร์ฟเวอร์แล้วกดตรวจอีกครั้ง',
    }
  }
  if (error.status === 429) {
    return { state: 'warn', message: 'ส่งคำขอถี่เกินไป — รอสักครู่แล้วกดตรวจอีกครั้ง' }
  }
  return {
    state: 'error',
    message: `เซิร์ฟเวอร์ตอบกลับผิดพลาด (รหัส ${error.status}) — แจ้งผู้ดูแลระบบ`,
  }
}
