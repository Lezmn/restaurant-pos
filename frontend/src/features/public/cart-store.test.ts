import { beforeEach, describe, expect, it } from 'vitest'
import { MAX_ITEM_QUANTITY } from '@/lib/config'
import type { MenuItem } from '@/types/models'
import { cartCount, cartTotal, lineTotal, lineUnitPrice, repriceLines, useCart } from './cart-store'

const kaprao = {
  menuItemId: 'm1',
  name: 'กะเพรา',
  imageUrl: null,
  basePrice: 60,
  options: [
    { id: 'pork', name: 'หมู', price: 0 },
    { id: 'egg', name: 'ไข่ดาว', price: 10 },
  ],
  quantity: 1,
  note: '',
}

const state = () => useCart.getState()

describe('cart-store', () => {
  beforeEach(() => {
    useCart.setState({ token: null, lines: [] })
  })

  it('ราคา/บรรทัด = (ราคาเมนู + ตัวเลือก) × จำนวน และยอดรวม/จำนวนรวม', () => {
    state().add({ ...kaprao, quantity: 2 })
    state().add({ ...kaprao, menuItemId: 'm2', name: 'น้ำ', basePrice: 15.5, options: [], quantity: 3 })
    const [a, b] = state().lines
    expect(lineUnitPrice(a)).toBe(70)
    expect(lineTotal(a)).toBe(140)
    expect(lineTotal(b)).toBe(46.5)
    expect(cartTotal(state().lines)).toBe(186.5)
    expect(cartCount(state().lines)).toBe(5)
  })

  it('เมนูเดิม ตัวเลือกชุดเดิม (คนละลำดับ) โน้ตเดิม → รวมบรรทัดเดียว', () => {
    state().add(kaprao)
    state().add({ ...kaprao, options: [...kaprao.options].reverse() })
    expect(state().lines).toHaveLength(1)
    expect(state().lines[0].quantity).toBe(2)
  })

  it('ตัวเลือกต่างกัน หรือโน้ตต่างกัน → แยกบรรทัด', () => {
    state().add(kaprao)
    state().add({ ...kaprao, options: [kaprao.options[0]] })
    state().add({ ...kaprao, note: 'ไม่เผ็ด' })
    expect(state().lines).toHaveLength(3)
  })

  it('เพิ่มซ้ำจนเกินเพดาน backend → ค้างที่ MAX_ITEM_QUANTITY', () => {
    state().add({ ...kaprao, quantity: 98 })
    state().add({ ...kaprao, quantity: 5 })
    expect(state().lines[0].quantity).toBe(MAX_ITEM_QUANTITY)
  })

  it('setQuantity เกินเพดานก็ต้องไม่เกิน MAX_ITEM_QUANTITY', () => {
    state().add(kaprao)
    state().setQuantity(state().lines[0].lineId, 500)
    expect(state().lines[0].quantity).toBeLessThanOrEqual(MAX_ITEM_QUANTITY)
  })

  it('setQuantity 0 หรือติดลบ → ลบบรรทัด', () => {
    state().add(kaprao)
    state().setQuantity(state().lines[0].lineId, 0)
    expect(state().lines).toHaveLength(0)
    state().add(kaprao)
    state().setQuantity(state().lines[0].lineId, -3)
    expect(state().lines).toHaveLength(0)
  })

  it('bindToken: โต๊ะเดิมไม่ล้าง, โต๊ะใหม่ล้างตะกร้า', () => {
    state().bindToken('t1')
    state().add(kaprao)
    state().bindToken('t1')
    expect(state().lines).toHaveLength(1)
    state().bindToken('t2')
    expect(state().lines).toHaveLength(0)
    expect(state().token).toBe('t2')
  })

  it('persist ลง localStorage (refresh แล้วตะกร้ายังอยู่)', () => {
    state().bindToken('t1')
    state().add(kaprao)
    const saved = JSON.parse(localStorage.getItem('restaurant.cart') ?? '{}')
    expect(saved.state.lines).toHaveLength(1)
    expect(saved.state.token).toBe('t1')
  })

  describe('syncPrices (ราคาเมนูเปลี่ยนระหว่างอยู่ในตะกร้า)', () => {
    const option = (id: string, name: string, price: number) => ({
      id,
      name,
      price,
      group: 'EXTRA' as MenuItem['optionGroups'][number]['options'][number]['group'],
      isAvailable: true,
      ingredientId: null,
      ingredientName: null,
      ingredientOutOfStock: false,
    })
    const menu = (price: number, eggPrice: number): MenuItem[] => [
      {
        id: 'm1',
        categoryId: 'c1',
        name: 'กะเพรา',
        price,
        imageUrl: null,
        isAvailable: true,
        optionGroups: [
          {
            id: 'g',
            name: 'เพิ่มเติม',
            selectType: 'multiple',
            required: false,
            options: [option('pork', 'หมู', 0), option('egg', 'ไข่ดาว', eggPrice)],
          },
        ],
        ingredients: [],
        ingredientsOutOfStock: [],
      },
    ]

    it('ราคาเมนู/ตัวเลือกเปลี่ยน → ตะกร้าใช้ราคาใหม่ และบอกชื่อเมนูที่เปลี่ยน', () => {
      state().add({ ...kaprao, quantity: 2 })
      expect(state().syncPrices(menu(65, 15))).toEqual(['กะเพรา'])
      expect(lineUnitPrice(state().lines[0])).toBe(80)
      expect(cartTotal(state().lines)).toBe(160)
    })

    it('ราคาเท่าเดิม → ไม่เปลี่ยนอะไร (กัน effect วนลูป)', () => {
      state().add(kaprao)
      const before = state().lines
      expect(state().syncPrices(menu(60, 10))).toEqual([])
      expect(state().lines).toBe(before)
    })

    it('เมนูหายจากเมนูลูกค้า → คงบรรทัดเดิมไว้', () => {
      const lines = [{ ...kaprao, lineId: 'x' }]
      expect(repriceLines(lines, []).lines).toBe(lines)
    })
  })
})
