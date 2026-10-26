import { apiClient } from '@/lib/api-client'

/** GET /settings/line @Roles(ADMIN) — ไม่มี token เต็ม มีแค่ 4 ตัวท้าย */
export interface LineSettings {
  enabled: boolean
  to: string
  hasToken: boolean
  tokenHint: string | null
  /** database = ตั้งจากหน้านี้ · env = ตั้งไว้ในไฟล์ .env ของเซิร์ฟเวอร์ · none = ยังไม่ตั้ง */
  source: 'database' | 'env' | 'none'
  /** token ที่บันทึกไว้ถอดรหัสไม่ได้ (กุญแจเซิร์ฟเวอร์เปลี่ยน) — ต้องวางใหม่ */
  tokenUnreadable: boolean
  /** เปิดอยู่ และมีครบทั้ง token กับ User ID */
  ready: boolean
}

export const getLineSettings = () => apiClient<LineSettings>('/settings/line')

/** PUT /settings/line — token ไม่ส่ง = ใช้ตัวเดิม */
export const saveLineSettings = (vars: { enabled: boolean; to: string; token?: string }) =>
  apiClient<LineSettings>('/settings/line', {
    method: 'PUT',
    body: JSON.stringify({
      enabled: vars.enabled,
      to: vars.to.trim(),
      ...(vars.token?.trim() ? { token: vars.token.trim() } : {}),
    }),
  })

/** POST /settings/line/test — ส่งค่าที่กรอกอยู่ (ยังไม่บันทึกก็ทดสอบได้) ไม่ส่ง = ใช้ค่าที่บันทึกไว้ */
export const testLineSettings = (vars: { to?: string; token?: string }) =>
  apiClient<{ ok: boolean; message: string }>('/settings/line/test', {
    method: 'POST',
    body: JSON.stringify({
      ...(vars.to?.trim() ? { to: vars.to.trim() } : {}),
      ...(vars.token?.trim() ? { token: vars.token.trim() } : {}),
    }),
  })
