import { describe, expect, it } from 'vitest'
import type { ApiOrder, ApiTableSession } from '@/types/api'
import { mapOrder, mapPayment, mapSession } from '@/lib/map'

const session = (overrides: Partial<ApiTableSession> = {}): ApiTableSession => ({
  id: 's1',
  token: 't',
  status: 'OPEN',
  openedAt: '2026-10-26T10:00:00Z',
  closedAt: null,
  expiresAt: null,
  tableId: 'tb',
  table: { id: 'tb', number: 5, status: 'OCCUPIED' } as ApiTableSession['table'],
  ...overrides,
})

describe('ป้ายโต๊ะ / กลับบ้าน', () => {
  it('โต๊ะจริง: "โต๊ะ 5"', () => {
    const s = mapSession(session())
    expect(s.tableName).toBe('5')
    expect(s.placeLabel).toBe('โต๊ะ 5')
    expect(s.isTakeaway).toBe(false)
  })

  it('กลับบ้าน: ใช้เลขคิวแทนเลขโต๊ะเสมือน และต่อชื่อลูกค้า', () => {
    const s = mapSession(
      session({ isTakeaway: true, takeawayNo: 3, customerName: 'คุณเอ', table: { id: 'tk', number: 0 } as never }),
    )
    expect(s.tableName).toBe('กลับบ้าน #3')
    expect(s.placeLabel).toBe('กลับบ้าน #3 · คุณเอ')
    expect(s.isTakeaway).toBe(true)
  })

  it('ออเดอร์กลับบ้านที่จ่ายก่อนทำ: paid = true ทั้งที่สถานะยังเป็นของครัว', () => {
    const o = mapOrder({
      id: 'o1',
      status: 'PREPARING',
      createdAt: '2026-10-26T10:00:00Z',
      paymentId: 'pay-1',
      table: { id: 'tk', number: 0 } as never,
      tableSession: { isTakeaway: true, takeawayNo: 7, customerName: null },
      items: [],
    } as ApiOrder)
    expect(o.paid).toBe(true)
    expect(o.placeLabel).toBe('กลับบ้าน #7')
  })

  it('ใบเสร็จตอนเพิ่งรับเงิน (ไม่มี tableSession) ใช้ชื่อที่ส่งมา และรู้ว่าเป็นกลับบ้าน', () => {
    const p = mapPayment(
      {
        id: 'p1',
        amount: 80,
        method: 'CASH',
        status: 'COMPLETED',
        paidAt: '2026-10-26T10:00:00Z',
        tableSessionId: 's1',
        receipt: { id: 'r', number: 'RCPT-1', subtotal: 80, discount: 0, total: 80, issuedAt: '', items: [] },
      } as never,
      'กลับบ้าน #3',
      true,
    )
    expect(p.placeLabel).toBe('กลับบ้าน #3')
    expect(p.receipt?.isTakeaway).toBe(true)
  })
})
