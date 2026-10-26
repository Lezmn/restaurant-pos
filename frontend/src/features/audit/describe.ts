import type { BadgeTone } from '@/components/ui/Badge'
import { formatBaht } from '@/lib/format'
import type { AuditAction, AuditLog } from './api'

/** ชื่อรายการ + สี — แดง = เงินหายจากยอดขาย/ลิ้นชัก (ต้องดูเป็นพิเศษ) */
export const auditActionMeta: Record<AuditAction, { label: string; tone: BadgeTone }> = {
  PAYMENT_DISCOUNT: { label: 'ลดราคา', tone: 'red' },
  PAYMENT_VOID: { label: 'ยกเลิกบิล', tone: 'red' },
  ORDER_CANCEL: { label: 'ยกเลิกออเดอร์', tone: 'red' },
  ORDER_ITEM_REMOVE: { label: 'ลบรายการอาหาร', tone: 'red' },
  ORDER_CUSTOM_ITEM: { label: 'รายการราคาเปิด', tone: 'amber' },
  EXPENSE_DRAWER: { label: 'เงินออกจากลิ้นชัก', tone: 'red' },
  CASH_CLOSE_DELETE: { label: 'ลบการปิดยอด', tone: 'red' },
  PAYMENT_SLIP_OVERRIDE: { label: 'รับ PromptPay ไม่มีสลิป', tone: 'amber' },
  PAYMENT_SLIP_CONFIRM: { label: 'ยืนยันสลิปเอง', tone: 'amber' },
  CASH_CLOSE_CREATE: { label: 'ปิดยอดเงินสด', tone: 'blue' },
  EXPENSE_CREATE: { label: 'เพิ่มรายจ่าย', tone: 'gray' },
  EXPENSE_UPDATE: { label: 'แก้รายจ่าย', tone: 'amber' },
  EXPENSE_DELETE: { label: 'ลบรายจ่าย', tone: 'amber' },
  MENU_UPDATE: { label: 'แก้เมนู', tone: 'gray' },
  MENU_DELETE: { label: 'ลบเมนู', tone: 'gray' },
  USER_CREATE: { label: 'เพิ่มบัญชี', tone: 'gray' },
  USER_UPDATE: { label: 'แก้บัญชี', tone: 'gray' },
  USER_DELETE: { label: 'ลบบัญชี', tone: 'gray' },
}

/** ลำดับในตัวกรอง — เรื่องเงิน (แดง) ขึ้นก่อน */
export const auditActionOrder = Object.keys(auditActionMeta) as AuditAction[]

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {})
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v))
const baht = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : formatBaht(num(v)))
const table = (d: Obj) => (d.tableNumber ? ` โต๊ะ ${String(d.tableNumber)}` : '')
const receipt = (d: Obj) => (d.receiptNumber ? ` บิล ${String(d.receiptNumber)}` : '')
const signed = (v: unknown) => {
  const n = num(v)
  if (!Number.isFinite(n) || n === 0) return 'ตรง'
  return `${n > 0 ? 'เกิน' : 'ขาด'} ${formatBaht(Math.abs(n))}`
}

const roleLabel: Record<string, string> = { ADMIN: 'เจ้าของ', STAFF: 'หน้าร้าน', KITCHEN: 'ครัว' }

/** เทียบค่าเก่ากับที่ส่งมาแก้ — โชว์เฉพาะ field ที่เปลี่ยนจริง */
function changeList(before: Obj, changes: Obj, labels: Record<string, string>) {
  const parts: string[] = []
  for (const [key, label] of Object.entries(labels)) {
    if (!(key in changes)) continue
    const from = before[key]
    const to = changes[key]
    if (from === to || num(from) === num(to)) continue
    if (key === 'price' || key === 'amount') parts.push(`${label} ${baht(from)} → ${baht(to)}`)
    else if (typeof to === 'boolean') parts.push(`${label}: ${to ? 'เปิด' : 'ปิด'}`)
    else parts.push(`${label}: ${roleLabel[String(to)] ?? String(to)}`)
  }
  if (changes.passwordChanged) parts.push('ตั้งรหัสผ่านใหม่')
  if (changes.logoutEverywhere) parts.push('สั่งออกจากระบบทุกเครื่อง')
  return parts.join(' · ')
}

/**
 * แปลงรายละเอียดของแต่ละรายการเป็นประโยคอ่านง่าย 1 บรรทัด + เหตุผล (ถ้ามี)
 * ประวัติเก่าอาจมี field ไม่ครบ — ต้องไม่พังและยังอ่านออก
 */
export function describeAudit(log: AuditLog): { summary: string; reason: string | null } {
  const d = obj(log.details)
  const reason = (key: string) => (typeof d[key] === 'string' && d[key] ? (d[key] as string) : null)

  switch (log.action) {
    case 'PAYMENT_DISCOUNT':
      return {
        summary: `ลด ${d.discountPercent ?? '?'}% (${baht(d.discount)})${receipt(d)}${table(d)} · จาก ${baht(d.subtotal)} เก็บจริง ${baht(d.total)}`,
        reason: reason('note'),
      }
    case 'PAYMENT_SLIP_OVERRIDE':
      return { summary: `รับเงิน ${baht(d.total)}${receipt(d)}${table(d)}`, reason: reason('slipOverrideReason') }
    case 'PAYMENT_VOID':
      return { summary: `ยกเลิก${receipt(d) || 'บิล'}${table(d)} ยอด ${baht(d.amount)}`, reason: reason('reason') }
    case 'PAYMENT_SLIP_CONFIRM':
      return { summary: `ยืนยันรับเงิน ${baht(d.amount)}${receipt(d)}${table(d)}`, reason: reason('reason') }
    case 'ORDER_CANCEL': {
      const items = Array.isArray(d.items) ? (d.items as Obj[]) : []
      const total = items.reduce((s, i) => s + num(i.unitPrice) * num(i.quantity), 0)
      const names = items.map((i) => `${String(i.name)} ×${String(i.quantity)}`).join(', ')
      return { summary: `ยกเลิกออเดอร์${table(d)}${names ? `: ${names}` : ''} (${baht(total)})`, reason: null }
    }
    case 'ORDER_ITEM_REMOVE': {
      const options = Array.isArray(d.options) && d.options.length ? ` (${(d.options as string[]).join(', ')})` : ''
      return {
        summary: `ลบ ${String(d.name ?? 'รายการ')}${options} ×${String(d.quantity ?? '?')}${table(d)} · ${baht(num(d.unitPrice) * num(d.quantity))}`,
        reason: null,
      }
    }
    case 'ORDER_CUSTOM_ITEM': {
      const items = Array.isArray(d.customItems) ? (d.customItems as Obj[]) : []
      const names = items.map((i) => `${String(i.name)} ${baht(num(i.price))} ×${String(i.quantity)}`).join(', ')
      const total = items.reduce((s, i) => s + num(i.price) * num(i.quantity), 0)
      return { summary: `รายการราคาเปิด: ${names || '—'} (รวม ${baht(total)})`, reason: null }
    }
    case 'CASH_CLOSE_CREATE':
      return {
        summary: `ปิดยอดวันที่ ${String(d.date ?? '—')} นับได้ ${baht(d.countedCash)} (ควรมี ${baht(d.expectedCash)}) · ${signed(d.difference)}`,
        reason: reason('note'),
      }
    case 'CASH_CLOSE_DELETE':
      return {
        summary: `ลบการปิดยอดวันที่ ${String(d.date ?? '—')} (เดิมนับได้ ${baht(d.countedCash)} · ${signed(d.difference)})`,
        reason: null,
      }
    case 'EXPENSE_DRAWER':
    case 'EXPENSE_CREATE':
    case 'EXPENSE_DELETE':
      return { summary: `${String(d.title ?? 'รายจ่าย')} ${baht(d.amount)}`, reason: reason('note') }
    case 'EXPENSE_UPDATE': {
      const before = obj(d.before)
      const changes = changeList(before, obj(d.changes), { title: 'ชื่อ', amount: 'ยอด', category: 'หมวด' })
      return { summary: `${String(before.title ?? 'รายจ่าย')}${changes ? ` · ${changes}` : ''}`, reason: null }
    }
    case 'MENU_UPDATE': {
      const before = obj(d.before)
      const changes = changeList(before, obj(d.changes), { name: 'ชื่อ', price: 'ราคา', isAvailable: 'ขาย' })
      return { summary: `${String(before.name ?? 'เมนู')}${changes ? ` · ${changes}` : ''}`, reason: null }
    }
    case 'MENU_DELETE':
      return { summary: `${String(d.name ?? 'เมนู')} (${baht(d.price)})`, reason: null }
    case 'USER_CREATE':
      return { summary: `${String(d.name ?? '')} · ${roleLabel[String(d.role)] ?? String(d.role ?? '')}`, reason: null }
    case 'USER_UPDATE': {
      const before = obj(d.before)
      const changes = changeList(before, obj(d.changes), { name: 'ชื่อ', role: 'ตำแหน่ง', isActive: 'ใช้งาน' })
      return { summary: `${String(before.name ?? 'บัญชี')}${changes ? ` · ${changes}` : ''}`, reason: null }
    }
    case 'USER_DELETE':
      return { summary: `${String(d.name ?? 'บัญชี')} (${String(d.email ?? '')})`, reason: null }
    default:
      return { summary: String(log.action), reason: null }
  }
}

/** ชื่อเครื่องสำหรับแสดง — เครื่องที่ยังไม่ตั้งชื่อ โชว์ 4 ตัวท้ายของ id ไว้แยกกัน */
export function deviceLabel(deviceName: string | null, deviceId: string | null) {
  if (deviceName) return deviceName
  if (deviceId) return `เครื่องไม่มีชื่อ (${deviceId.slice(-4)})`
  return 'ไม่ทราบเครื่อง'
}
