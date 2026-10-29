import { PaymentStatus, SlipStatus } from '@/types/enums'
import type { Payment } from '@/types/models'

/** ค่าในช่องสแกนสลิป (SlipScanField) — แยกไฟล์ให้ไฟล์ component export แค่ component (fast refresh) */
export interface SlipInput {
  /** ข้อความใน QR มุมขวาล่างของสลิป */
  payload: string
  /** ADMIN: ไม่มีสลิป ยืนยันเอง */
  override: boolean
  overrideReason: string
}

export const emptySlipInput: SlipInput = { payload: '', override: false, overrideReason: '' }

/** พร้อมบันทึกไหม — มีข้อความ QR หรือ ADMIN ยืนยันเองพร้อมเหตุผล */
export const isSlipReady = (slip: SlipInput) =>
  slip.override ? slip.overrideReason.trim() !== '' : slip.payload.trim() !== ''

/** บิล PromptPay ที่ยังไม่มีสลิปที่ใช้ได้ — รอสลิป (พิมพ์ใบเสร็จ QR ไปแล้ว) หรือสลิปเดิมไม่ผ่าน */
export const needsSlip = (p: Payment) =>
  p.status !== PaymentStatus.VOIDED &&
  (p.slip?.status === SlipStatus.AWAITING || p.slip?.status === SlipStatus.FAILED)
