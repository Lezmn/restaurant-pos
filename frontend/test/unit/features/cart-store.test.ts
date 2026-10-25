import { beforeEach, describe, expect, it } from 'vitest'
import { MAX_ITEM_QUANTITY } from '@/lib/config'
import type { MenuItem } from '@/types/models'
import {
  cartCount,
  cartTotal,
  lineTotal,
  lineUnitPrice,
  repriceLines,
  unavailableLineIds,
  useCart,
} from '@/features/public/cart-store'

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
    useCart.setState({ token: null, lines: [], repriced: [] })
  })

  // ทดสอบ: คิดเงินในตะกร้าถูก: ราคาต่อบรรทัด = (ราคาเมนู + ตัวเลือก) × จำนวน และยอดรวม/จำนวนรวมถูก
  // วิธี: เพิ่มกะเพรา+ไข่ดาว 2 จาน และน้ำ 15.5 × 3 → เช็กราคาต่อหน่วย 70, บรรทัด 140 และ 46.5, รวม 186.5, จำนวน 5
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

  // ทดสอบ: สั่งเมนูเดิม ตัวเลือกชุดเดิม (แม้คนละลำดับ) และโน้ตเดิม ต้องรวมเป็นบรรทัดเดียว
  // วิธี: เพิ่มกะเพราสองครั้ง โดยครั้งที่สองสลับลำดับตัวเลือก → เช็กว่ามี 1 บรรทัด จำนวน 2
  it('เมนูเดิม ตัวเลือกชุดเดิม (คนละลำดับ) โน้ตเดิม → รวมบรรทัดเดียว', () => {
    state().add(kaprao)
    state().add({ ...kaprao, options: [...kaprao.options].reverse() })
    expect(state().lines).toHaveLength(1)
    expect(state().lines[0].quantity).toBe(2)
  })

  // ทดสอบ: ตัวเลือกหรือโน้ตต่างกันต้องแยกเป็นคนละบรรทัด
  // วิธี: เพิ่มกะเพรา 3 แบบ (เต็ม, ตัวเลือกน้อยกว่า, โน้ตต่าง) → เช็กว่ามี 3 บรรทัด
  it('ตัวเลือกต่างกัน หรือโน้ตต่างกัน → แยกบรรทัด', () => {
    state().add(kaprao)
    state().add({ ...kaprao, options: [kaprao.options[0]] })
    state().add({ ...kaprao, note: 'ไม่เผ็ด' })
    expect(state().lines).toHaveLength(3)
  })

  // ทดสอบ: เพิ่มเมนูเดิมซ้ำจนเกินเพดานที่ backend รับ ต้องหยุดที่ MAX_ITEM_QUANTITY
  // วิธี: เพิ่ม 98 แล้วเพิ่มอีก 5 → เช็กว่าจำนวนเท่า MAX_ITEM_QUANTITY
  it('เพิ่มซ้ำจนเกินเพดาน backend → ค้างที่ MAX_ITEM_QUANTITY', () => {
    state().add({ ...kaprao, quantity: 98 })
    state().add({ ...kaprao, quantity: 5 })
    expect(state().lines[0].quantity).toBe(MAX_ITEM_QUANTITY)
  })

  // ทดสอบ: ตั้งจำนวนเองเกินเพดานก็ต้องไม่เกิน MAX_ITEM_QUANTITY
  // วิธี: เพิ่ม 1 จาน → setQuantity 500 → เช็กว่าไม่เกินเพดาน
  it('setQuantity เกินเพดานก็ต้องไม่เกิน MAX_ITEM_QUANTITY', () => {
    state().add(kaprao)
    state().setQuantity(state().lines[0].lineId, 500)
    expect(state().lines[0].quantity).toBeLessThanOrEqual(MAX_ITEM_QUANTITY)
  })

  // ทดสอบ: ตั้งจำนวนเป็น 0 หรือติดลบ = ลบบรรทัดนั้นออก
  // วิธี: เพิ่มแล้ว setQuantity 0 เช็กว่าว่าง → เพิ่มใหม่แล้ว setQuantity -3 เช็กว่าว่าง
  it('setQuantity 0 หรือติดลบ → ลบบรรทัด', () => {
    state().add(kaprao)
    state().setQuantity(state().lines[0].lineId, 0)
    expect(state().lines).toHaveLength(0)
    state().add(kaprao)
    state().setQuantity(state().lines[0].lineId, -3)
    expect(state().lines).toHaveLength(0)
  })

  // ทดสอบ: เปิดโต๊ะเดิมซ้ำตะกร้ายังอยู่ แต่สแกนโต๊ะใหม่ต้องล้างตะกร้า
  // วิธี: bindToken t1 แล้วเพิ่มของ → bindToken t1 ซ้ำ เช็กว่ายังมี 1 บรรทัด → bindToken t2 เช็กว่าว่างและ token เป็น t2
  it('bindToken: โต๊ะเดิมไม่ล้าง, โต๊ะใหม่ล้างตะกร้า', () => {
    state().bindToken('t1')
    state().add(kaprao)
    state().bindToken('t1')
    expect(state().lines).toHaveLength(1)
    state().bindToken('t2')
    expect(state().lines).toHaveLength(0)
    expect(state().token).toBe('t2')
  })

  // ทดสอบ: ตะกร้าถูกเก็บลง localStorage เพื่อให้ refresh แล้วยังอยู่
  // วิธี: bindToken แล้วเพิ่มของ → อ่าน restaurant.cart จาก localStorage → เช็กว่ามี 1 บรรทัดและ token ตรง
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
      ingredientStockQty: null,
      usageQty: 1,
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

    // ทดสอบ: ราคาเมนูหรือตัวเลือกเปลี่ยนตอนอยู่ในตะกร้า ตะกร้าต้องใช้ราคาใหม่ และจดชื่อเมนูที่ราคาเปลี่ยนไว้แจ้งลูกค้า
    // วิธี: เพิ่มกะเพรา 2 จาน → syncPrices ด้วยเมนูราคา 65 ไข่ดาว 15 → เช็ก repriced = [กะเพรา], ราคาต่อหน่วย 80, รวม 160
    it('ราคาเมนู/ตัวเลือกเปลี่ยน → ตะกร้าใช้ราคาใหม่ และบอกชื่อเมนูที่เปลี่ยน', () => {
      state().add({ ...kaprao, quantity: 2 })
      state().syncPrices(menu(65, 15))
      expect(state().repriced).toEqual(['กะเพรา'])
      expect(lineUnitPrice(state().lines[0])).toBe(80)
      expect(cartTotal(state().lines)).toBe(160)
    })

    // ทดสอบ: ถ้าราคาเท่าเดิม ต้องไม่เปลี่ยน state เลย กัน effect วนลูปไม่จบ
    // วิธี: เพิ่มของ จด lines เดิมไว้ → syncPrices ด้วยราคาเดิม → เช็กว่า repriced ว่าง และ lines เป็นตัวเดิม (อ้างอิงเดียวกัน)
    it('ราคาเท่าเดิม → ไม่เปลี่ยนอะไร (กัน effect วนลูป)', () => {
      state().add(kaprao)
      const before = state().lines
      state().syncPrices(menu(60, 10))
      expect(state().repriced).toEqual([])
      expect(state().lines).toBe(before)
    })

    // ทดสอบ: ถ้าเมนูหายไปจากเมนูลูกค้า ต้องคงบรรทัดเดิมไว้ ไม่ลบเอง
    // วิธี: เรียก repriceLines ด้วยเมนูว่าง → เช็กว่าได้ lines ตัวเดิม
    it('เมนูหายจากเมนูลูกค้า → คงบรรทัดเดิมไว้', () => {
      const lines = [{ ...kaprao, lineId: 'x' }]
      expect(repriceLines(lines, []).lines).toBe(lines)
    })

    // ทดสอบ: หาบรรทัดที่สั่งไม่ได้แล้วถูก: เมนูหายไป หรือตัวเลือกที่เลือกไว้ไม่มีแล้ว ส่วนบรรทัดที่เหลือยังสั่งได้
    // วิธี: สร้าง 3 บรรทัด (ปกติ, ตัวเลือกหาย, เมนูหาย) → เรียก unavailableLineIds → เช็กว่าได้แค่ egg กับ gone
    it('บรรทัดที่สั่งไม่ได้แล้ว: เมนูหาย / ตัวเลือกที่เลือกไว้หมด — ที่เหลือสั่งได้ปกติ', () => {
      const ok = { ...kaprao, lineId: 'ok', options: [{ id: 'pork', name: 'หมู', price: 0 }] }
      const optionGone = { ...kaprao, lineId: 'egg', options: [{ id: 'gone', name: 'ปู', price: 0 }] }
      const itemGone = { ...kaprao, lineId: 'gone', menuItemId: 'm-off' }
      expect([...unavailableLineIds([ok, optionGone, itemGone], menu(60, 10))]).toEqual(['egg', 'gone'])
    })
  })
})
