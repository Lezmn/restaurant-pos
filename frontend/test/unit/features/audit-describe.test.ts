import { describe, expect, it } from 'vitest'
import type { AuditLog } from '@/features/audit/api'
import { describeAudit } from '@/features/audit/describe'

const log = (action: AuditLog['action'], details: Record<string, unknown> | null): AuditLog => ({
  id: '1',
  action,
  targetId: null,
  details,
  userId: 'u',
  userName: 'หน้าร้าน',
  userRole: 'STAFF',
  deviceName: null,
  deviceId: null,
  ip: null,
  userAgent: null,
  createdAt: '2026-10-26T10:00:00.000Z',
})

describe('describeAudit', () => {
  it('ลดราคา: บอก % ยอดลด บิล โต๊ะ และเหตุผล', () => {
    const { summary, reason } = describeAudit(
      log('PAYMENT_DISCOUNT', {
        discountPercent: 10,
        discount: 23.55,
        subtotal: 235.5,
        total: 211.95,
        receiptNumber: 'R-001',
        tableNumber: 5,
        note: 'ส่วนลด 10% (฿23.55): ลูกค้าประจำ',
      }),
    )
    expect(summary).toContain('ลด 10%')
    expect(summary).toContain('บิล R-001')
    expect(summary).toContain('โต๊ะ 5')
    expect(reason).toContain('ลูกค้าประจำ')
  })

  it('แก้เมนู: โชว์เฉพาะราคาที่เปลี่ยน', () => {
    const { summary } = describeAudit(
      log('MENU_UPDATE', {
        before: { name: 'ผัดกะเพรา', price: 60, isAvailable: true },
        changes: { name: 'ผัดกะเพรา', price: 50 },
      }),
    )
    expect(summary).toMatch(/^ผัดกะเพรา · ราคา .*60.* → .*50/)
    expect(summary).not.toContain('ชื่อ:')
  })

  it('ยกเลิกออเดอร์: รวมชื่อรายการและยอด / ไม่มีรายการก็ไม่ต่อ ": " ท้ายประโยค', () => {
    const withItems = describeAudit(
      log('ORDER_CANCEL', {
        tableNumber: 3,
        items: [
          { name: 'ต้มยำ', quantity: 2, unitPrice: 100 },
          { name: 'ข้าว', quantity: 1, unitPrice: 20 },
        ],
      }),
    )
    expect(withItems.summary).toContain('โต๊ะ 3: ต้มยำ ×2, ข้าว ×1')
    expect(withItems.summary).toContain('220')

    const empty = describeAudit(log('ORDER_CANCEL', { tableNumber: 3 }))
    expect(empty.summary).not.toContain(':')
  })

  it('ลบรายการอาหาร: โชว์ตัวเลือกเมื่อมี และไม่โชว์เมื่อไม่มี', () => {
    const base = { name: 'ก๋วยเตี๋ยว', quantity: 2, unitPrice: 50, tableNumber: 7 }
    expect(describeAudit(log('ORDER_ITEM_REMOVE', { ...base, options: ['เส้นเล็ก', 'ไม่ผัก'] })).summary).toContain(
      'ก๋วยเตี๋ยว (เส้นเล็ก, ไม่ผัก) ×2',
    )
    expect(describeAudit(log('ORDER_ITEM_REMOVE', base)).summary).toContain('ลบ ก๋วยเตี๋ยว ×2')
  })

  it('รายการราคาเปิด: รวมยอด / ไม่มีรายการขึ้น —', () => {
    const { summary } = describeAudit(
      log('ORDER_CUSTOM_ITEM', { customItems: [{ name: 'ค่าเปิดขวด', price: 30, quantity: 2 }] }),
    )
    expect(summary).toContain('ค่าเปิดขวด')
    expect(summary).toContain('60')
    expect(describeAudit(log('ORDER_CUSTOM_ITEM', {})).summary).toContain('—')
  })

  it('ปิดยอด/ลบการปิดยอด: บอกเงินเกิน เงินขาด หรือตรง', () => {
    const close = (difference: number) =>
      describeAudit(log('CASH_CLOSE_CREATE', { date: '2026-10-26', countedCash: 1000, expectedCash: 1000, difference })).summary
    expect(close(50)).toContain('เกิน')
    expect(close(-50)).toContain('ขาด')
    expect(close(0)).toContain('ตรง')

    const del = describeAudit(log('CASH_CLOSE_DELETE', { date: '2026-10-26', countedCash: 900, difference: -100 }))
    expect(del.summary).toContain('ลบการปิดยอดวันที่ 2026-10-26')
    expect(del.summary).toContain('ขาด')
  })

  it('ยกเลิกบิล/ยืนยันสลิป/รับ PromptPay ไม่มีสลิป: ใส่เหตุผลและเลขบิล', () => {
    expect(describeAudit(log('PAYMENT_VOID', { receiptNumber: 'R-9', amount: 100, reason: 'คิดเงินผิด' }))).toMatchObject({
      reason: 'คิดเงินผิด',
    })
    expect(describeAudit(log('PAYMENT_SLIP_CONFIRM', { receiptNumber: 'R-9', amount: 100, reason: 'สลิปช้า' })).summary).toContain('บิล R-9')
    expect(describeAudit(log('PAYMENT_SLIP_OVERRIDE', { total: 100, slipOverrideReason: 'ระบบล่ม' })).reason).toBe('ระบบล่ม')
  })

  it('รายจ่าย: เพิ่ม/ลบ แสดงชื่อและยอด, แก้ไขแสดงเฉพาะที่เปลี่ยน', () => {
    expect(describeAudit(log('EXPENSE_CREATE', { title: 'ค่าน้ำแข็ง', amount: 120, note: 'ซื้อเพิ่ม' }))).toMatchObject({
      reason: 'ซื้อเพิ่ม',
    })
    expect(describeAudit(log('EXPENSE_DELETE', { title: 'ค่าน้ำแข็ง', amount: 120 })).summary).toContain('ค่าน้ำแข็ง')

    const upd = describeAudit(
      log('EXPENSE_UPDATE', { before: { title: 'ค่าน้ำแข็ง', amount: 120 }, changes: { amount: 150, category: 'วัตถุดิบ' } }),
    )
    expect(upd.summary).toMatch(/^ค่าน้ำแข็ง · ยอด .*120.* → .*150 · หมวด: วัตถุดิบ/)

    expect(describeAudit(log('EXPENSE_UPDATE', { before: { title: 'ค่าน้ำแข็ง' }, changes: {} })).summary).toBe('ค่าน้ำแข็ง')
  })

  it('เมนู: ลบ / เปิด-ปิดขาย', () => {
    expect(describeAudit(log('MENU_DELETE', { name: 'ส้มตำ', price: 60 })).summary).toContain('ส้มตำ')
    const { summary } = describeAudit(
      log('MENU_UPDATE', { before: { name: 'ส้มตำ', isAvailable: true }, changes: { isAvailable: false } }),
    )
    expect(summary).toBe('ส้มตำ · ขาย: ปิด')
  })

  it('บัญชีผู้ใช้: สร้าง/แก้ตำแหน่ง/ตั้งรหัสใหม่/ลบ', () => {
    expect(describeAudit(log('USER_CREATE', { name: 'สมชาย', role: 'KITCHEN' })).summary).toBe('สมชาย · ครัว')
    const upd = describeAudit(
      log('USER_UPDATE', {
        before: { name: 'สมชาย', role: 'STAFF' },
        changes: { role: 'ADMIN', passwordChanged: true, logoutEverywhere: true },
      }),
    )
    expect(upd.summary).toBe('สมชาย · ตำแหน่ง: เจ้าของ · ตั้งรหัสผ่านใหม่ · สั่งออกจากระบบทุกเครื่อง')
    expect(describeAudit(log('USER_DELETE', { name: 'สมชาย', email: 'a@b.c' })).summary).toBe('สมชาย (a@b.c)')
  })

  it('ตั้งค่า LINE และ action ที่ไม่รู้จัก', () => {
    expect(describeAudit(log('SETTINGS_LINE_UPDATE', { enabled: true, to: 'U123', tokenChanged: true })).summary).toBe(
      'เปิดการส่งสรุปยอด · ส่งถึง U123 · เปลี่ยน token',
    )
    expect(describeAudit(log('SETTINGS_LINE_UPDATE', { enabled: false })).summary).toBe('ปิดการส่งสรุปยอด · ส่งถึง —')
    expect(describeAudit(log('SOMETHING_NEW' as AuditLog['action'], null)).summary).toBe('SOMETHING_NEW')
  })

  it('ประวัติไม่มีรายละเอียด ไม่พัง', () => {
    for (const action of ['PAYMENT_VOID', 'ORDER_ITEM_REMOVE', 'USER_UPDATE', 'CASH_CLOSE_CREATE'] as const) {
      expect(() => describeAudit(log(action, null))).not.toThrow()
    }
  })
})
