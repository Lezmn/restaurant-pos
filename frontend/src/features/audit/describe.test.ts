import { describe, expect, it } from 'vitest'
import type { AuditLog } from './api'
import { describeAudit } from './describe'

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

  it('ประวัติไม่มีรายละเอียด ไม่พัง', () => {
    for (const action of ['PAYMENT_VOID', 'ORDER_ITEM_REMOVE', 'USER_UPDATE', 'CASH_CLOSE_CREATE'] as const) {
      expect(() => describeAudit(log(action, null))).not.toThrow()
    }
  })
})
