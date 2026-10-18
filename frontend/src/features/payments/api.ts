import { apiClient } from '@/lib/api-client'
import { mapPayment } from '@/lib/map'
import type { ApiPayment } from '@/types/api'
import type { PaymentMethod } from '@/types/enums'
import type { Id, Payment } from '@/types/models'

/**
 * POST /payments @Roles(ADMIN, STAFF)
 * backend ทำในทรานแซกชันเดียว: สร้าง Payment + Receipt → ออเดอร์เป็น PAID
 * → ปิด session → คืนโต๊ะเป็นว่าง → เคลียร์คำขอที่ค้าง
 * และมี guard ว่าต้องเสิร์ฟครบทุกออเดอร์ก่อนถึงจะจ่ายได้
 */
export async function createPayment(vars: {
  tableSessionId: Id
  method: PaymentMethod
  /** ยอดบิลที่หน้าจอแสดงอยู่ (ก่อนส่วนลด) — backend ตอบ 409 ถ้ายอดจริงเปลี่ยนไประหว่างเปิดหน้ารับเงิน */
  expectedTotal: number
  /** ยอดที่เก็บจริง — ไม่ส่ง = เต็มบิล ส่วนต่างบันทึกเป็นส่วนลดในใบเสร็จ */
  amount?: number
  /** POST /payments ไม่ได้ส่ง tableSession กลับมา จึงต้องส่งชื่อโต๊ะมาเติมในใบเสร็จเอง */
  tableName: string
  /** หมายเหตุตอนรับเงิน — backend เก็บลง payment + receipt */
  note?: string
  /** PromptPay: ข้อความใน QR ของสลิป — backend ส่งไปตรวจกับ SlipOK */
  slipPayload?: string
  /** PromptPay ไม่มีสลิป — เฉพาะ ADMIN ยืนยันเองพร้อมเหตุผล */
  slipOverrideReason?: string
}): Promise<Payment> {
  const data = await apiClient<ApiPayment>('/payments', {
    method: 'POST',
    body: JSON.stringify({
      tableSessionId: vars.tableSessionId,
      method: vars.method,
      expectedTotal: vars.expectedTotal,
      ...(vars.amount === undefined ? {} : { amount: vars.amount }),
      ...(vars.note ? { note: vars.note } : {}),
      ...(vars.slipPayload ? { slipPayload: vars.slipPayload } : {}),
      ...(vars.slipOverrideReason ? { slipOverrideReason: vars.slipOverrideReason } : {}),
    }),
  })
  return mapPayment(data, vars.tableName)
}

/** GET /payments @Roles(ADMIN, STAFF) — รายการบิลทั้งหมด ล่าสุดก่อน (ไม่มี items ของใบเสร็จ) */
export async function getPayments(range?: {
  from: Date
  to: Date
}): Promise<Payment[]> {
  // ส่งช่วงเวลาไปให้ backend กรอง — ไม่งั้นได้บิลทั้งประวัติร้านมาทุกครั้งที่หน้าจอรีเฟรช
  const query = range
    ? `?from=${encodeURIComponent(range.from.toISOString())}&to=${encodeURIComponent(range.to.toISOString())}`
    : ''
  const data = await apiClient<ApiPayment[]>(`/payments${query}`)
  return data.map((p) => mapPayment(p))
}

/** GET /payments/:id — ตัวเดียวที่ส่ง receipt.items มาด้วย ใช้ตอนเปิดดู/พิมพ์ใบเสร็จย้อนหลัง */
export async function getPayment(id: Id): Promise<Payment> {
  const data = await apiClient<ApiPayment>(`/payments/${id}`)
  return mapPayment(data)
}

/**
 * PATCH /payments/:id/void @Roles(ADMIN, STAFF)
 * backend: payment → VOIDED, ออเดอร์กลับเป็น SERVED + paymentId null,
 * และเปิด session/โต๊ะกลับให้ถ้าปิดไปแล้ว → เก็บเงินใหม่ได้เลย
 */
export async function voidPayment(vars: {
  id: Id
  /** บังคับ — backend ตอบ 400 ถ้าว่าง */
  reason: string
}): Promise<Payment> {
  const reason = vars.reason.trim()
  if (!reason) throw new Error('ต้องระบุเหตุผลที่ยกเลิกบิล')
  const data = await apiClient<ApiPayment>(`/payments/${vars.id}/void`, {
    method: 'PATCH',
    body: JSON.stringify({ reason }),
  })
  return mapPayment(data)
}

/** GET /payments?slipIssues=true — บิล PromptPay ที่สลิปรอตรวจ/ตรวจไม่ผ่าน (ทุกวัน) */
export async function getSlipIssuePayments(): Promise<Payment[]> {
  const data = await apiClient<ApiPayment[]>('/payments?slipIssues=true')
  return data.map((p) => mapPayment(p))
}

/** POST /payments/:id/slip/recheck @Roles(ADMIN, STAFF) — ตรวจสลิปที่รอตรวจอีกครั้งทันที */
export async function recheckSlip(id: Id): Promise<Payment> {
  const data = await apiClient<ApiPayment>(`/payments/${id}/slip/recheck`, { method: 'POST' })
  return mapPayment(data)
}

/** PATCH /payments/:id/slip/confirm @Roles(ADMIN) — ยืนยันรับเงินเอง (ต้องมีเหตุผล) */
export async function confirmSlip(vars: { id: Id; reason: string }): Promise<Payment> {
  const reason = vars.reason.trim()
  if (!reason) throw new Error('ต้องระบุเหตุผลที่ยืนยันเอง')
  const data = await apiClient<ApiPayment>(`/payments/${vars.id}/slip/confirm`, {
    method: 'PATCH',
    body: JSON.stringify({ reason }),
  })
  return mapPayment(data)
}
