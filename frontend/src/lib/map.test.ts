import { describe, expect, it } from 'vitest'
import { MenuOptionGroupKind, OrderStatus, PaymentMethod, PaymentStatus, SlipStatus } from '@/types/enums'
import type { ApiMenuItem, ApiOrder, ApiPayment } from '@/types/api'
import { mapMenuItem, mapOrder, mapPayment } from './map'
import { orderTotal } from '@/features/orders/order-total'

describe('mapMenuItem', () => {
  const api = {
    id: 'm1',
    name: 'กะเพรา',
    price: 60,
    imageUrl: null,
    isAvailable: true,
    categoryId: 'c1',
    options: [
      { id: 'x1', name: 'ไข่ดาว', price: 10, group: MenuOptionGroupKind.EXTRA, isAvailable: true },
      { id: 'p1', name: 'หมู', price: 0, group: MenuOptionGroupKind.PROTEIN, isAvailable: true },
      { id: 'x2', name: 'ไม่มี group', price: 5, isAvailable: true },
      {
        id: 'p2', name: 'ไก่', price: 0, group: MenuOptionGroupKind.PROTEIN, isAvailable: true,
        ingredientId: 'ing-chicken', ingredient: { id: 'ing-chicken', name: 'ไก่', isAvailable: false },
      },
    ],
    ingredients: [{ ingredient: { id: 'i-rice', name: 'ข้าว', isAvailable: false } }],
  } as unknown as ApiMenuItem

  it('จัดกลุ่ม PROTEIN (เลือกได้อันเดียว บังคับ) มาก่อน EXTRA เสมอ; ไม่มี group = EXTRA', () => {
    const m = mapMenuItem(api)
    expect(m.optionGroups.map((g) => [g.name, g.selectType, g.required])).toEqual([
      ['เนื้อสัตว์', 'single', true],
      ['เพิ่มเติม', 'multiple', false],
    ])
    expect(m.optionGroups[1].options.map((o) => o.id)).toEqual(['x1', 'x2'])
  })

  it('บอกวัตถุดิบที่หมด ทั้งของเมนูและของตัวเลือก', () => {
    const m = mapMenuItem(api)
    expect(m.ingredientsOutOfStock).toEqual(['ข้าว'])
    const chicken = m.optionGroups[0].options.find((o) => o.id === 'p2')!
    expect(chicken.ingredientOutOfStock).toBe(true)
    expect(chicken.ingredientName).toBe('ไก่')
  })

  it('เมนูที่ไม่มีตัวเลือก → ไม่มีกลุ่ม', () => {
    expect(mapMenuItem({ ...api, options: [] }).optionGroups).toEqual([])
  })
})

describe('mapOrder + orderTotal', () => {
  it('ทรง /orders (menuItem/selectedOptions ซ้อน) และทรง /public (name/options แบน) ได้ยอดเท่ากัน', () => {
    const staffShape = {
      id: 'abcdef12-0000', status: OrderStatus.SERVED, createdAt: 'x', table: { number: 4 },
      items: [{ id: 'i', menuItemId: 'm', quantity: 2, unitPrice: 60, note: null,
        menuItem: { name: 'กะเพรา', imageUrl: null }, selectedOptions: [{ name: 'ไข่ดาว', price: 10 }] }],
    } as unknown as ApiOrder
    const publicShape = {
      id: 'abcdef12-0000', status: OrderStatus.SERVED, createdAt: 'x', table: { number: 4 },
      items: [{ id: 'i', quantity: 2, unitPrice: 60, note: null, name: 'กะเพรา', options: [{ name: 'ไข่ดาว', price: 10 }] }],
    } as unknown as ApiOrder
    const a = mapOrder(staffShape)
    const b = mapOrder(publicShape)
    expect(a.orderRef).toBe('ABCDEF')
    expect(a.tableName).toBe('4')
    expect(orderTotal(a)).toBe(140)
    expect(orderTotal(b)).toBe(140)
    expect(b.items[0].menuItemName).toBe('กะเพรา')
  })
})

describe('mapPayment', () => {
  it('ใช้ชื่อโต๊ะสำรองเมื่อ API ไม่ส่ง tableSession และ map ข้อมูลสลิป', () => {
    const p = mapPayment(
      {
        id: 'p1', tableSessionId: 's1', method: PaymentMethod.PROMPTPAY, status: PaymentStatus.COMPLETED,
        amount: 200, paidAt: 'x', slipStatus: SlipStatus.PENDING, slipAttempts: 2,
        receipt: { id: 'r', number: 'RCPT-1', subtotal: 220, discount: 20, total: 200, issuedAt: 'x', items: [] },
      } as unknown as ApiPayment,
      '7',
    )
    expect(p.tableName).toBe('7')
    expect(p.receipt?.tableName).toBe('7')
    expect(p.receipt?.discount).toBe(20)
    expect(p.slip).toMatchObject({ status: SlipStatus.PENDING, attempts: 2, transRef: null })
  })

  it('เงินสดไม่มีข้อมูลสลิป → slip = null', () => {
    const p = mapPayment({
      id: 'p1', tableSessionId: 's1', method: PaymentMethod.CASH, status: PaymentStatus.COMPLETED,
      amount: 1, paidAt: 'x', slipStatus: null,
    } as unknown as ApiPayment)
    expect(p.slip).toBeNull()
    expect(p.tableName).toBe('-')
  })
})
