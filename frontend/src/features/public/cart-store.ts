import { MAX_ITEM_QUANTITY } from '@/lib/config'
import type { Id, MenuItem } from '@/types/models'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CartOption {
  id: Id
  name: string
  price: number
}

export interface CartLine {
  /** key ของบรรทัดในตะกร้า — เมนูเดียวกันแต่คนละตัวเลือกถือเป็นคนละบรรทัด */
  lineId: string
  menuItemId: Id
  name: string
  imageUrl: string | null
  basePrice: number
  options: CartOption[]
  quantity: number
  note: string
}

interface CartState {
  /** token ของ session ที่ตะกร้านี้เป็นเจ้าของ — กันตะกร้าโต๊ะเก่าติดมาโต๊ะใหม่ */
  token: string | null
  lines: CartLine[]
  /** ชื่อเมนูที่ราคาเปลี่ยนระหว่างอยู่ในตะกร้า — ไว้บอกลูกค้า (ไม่ persist) */
  repriced: string[]
  /** เรียกตอนเข้าหน้าลูกค้า: ถ้าเป็นคนละโต๊ะให้ล้างตะกร้าทิ้ง */
  bindToken: (token: string) => void
  add: (line: Omit<CartLine, 'lineId'>) => void
  setQuantity: (lineId: string, quantity: number) => void
  remove: (lineId: string) => void
  clear: () => void
  /** อัปเดตราคาในตะกร้าให้ตรงเมนูล่าสุด และจดชื่อเมนูที่ราคาเปลี่ยนไว้ใน repriced */
  syncPrices: (menu: MenuItem[]) => void
}

/**
 * ตะกร้าจำราคา ณ ตอนกดเพิ่ม แต่ backend คิดเงินจากราคาปัจจุบันเสมอ
 * ถ้าแอดมินเปลี่ยนราคาระหว่างนั้น ต้องอัปเดตตาม ไม่งั้นลูกค้าเห็นยอดหนึ่งแต่โดนคิดอีกยอด
 * เมนูที่หายจากเมนูลูกค้า (ปิดขาย) ปล่อยราคาเดิมไว้ — backend จะปฏิเสธตอนส่งอยู่แล้ว
 */
export function repriceLines(lines: CartLine[], menu: MenuItem[]) {
  const byId = new Map(menu.map((m) => [m.id, m]))
  const changed: string[] = []
  const next = lines.map((line) => {
    const item = byId.get(line.menuItemId)
    if (!item) return line
    const optionPrice = new Map(
      item.optionGroups.flatMap((g) => g.options).map((o) => [o.id, o.price]),
    )
    const options = line.options.map((o) => ({
      ...o,
      price: optionPrice.get(o.id) ?? o.price,
    }))
    const repriced = { ...line, basePrice: item.price, options }
    if (lineUnitPrice(repriced) === lineUnitPrice(line)) return line
    changed.push(line.name)
    return repriced
  })
  return { lines: changed.length ? next : lines, changed }
}

/**
 * บรรทัดที่สั่งไม่ได้แล้ว — เมนูปิดขาย/วัตถุดิบหมด (หายจากเมนูลูกค้า) หรือตัวเลือกที่เลือกไว้หมด
 * ส่งไปทั้งตะกร้า backend จะปฏิเสธทั้งออเดอร์ จึงต้องบอกลูกค้าให้เอาออกก่อน
 */
export function unavailableLineIds(lines: CartLine[], menu: MenuItem[]) {
  const byId = new Map(menu.map((m) => [m.id, m]))
  return new Set(
    lines
      .filter((line) => {
        const item = byId.get(line.menuItemId)
        if (!item?.isAvailable || item.ingredientsOutOfStock.length > 0) return true
        const orderable = new Set(
          item.optionGroups
            .flatMap((g) => g.options)
            .filter((o) => o.isAvailable && !o.ingredientOutOfStock)
            .map((o) => o.id),
        )
        return line.options.some((o) => !orderable.has(o.id))
      })
      .map((line) => line.lineId),
  )
}

// เรียง option id ก่อนต่อเป็น key เพื่อให้เลือกตัวเลือกชุดเดียวกันคนละลำดับได้ id เดียวกัน
// ต้องระบุ compare เอง — .sort() เปล่า ๆ เรียงตามลำดับ UTF-16 ซึ่งไม่ใช่ลำดับตัวอักษรจริง
const makeLineId = (menuItemId: Id, options: CartOption[], note: string) =>
  [
    menuItemId,
    ...options.map((o) => o.id).sort((a, b) => a.localeCompare(b)),
    note,
  ].join('|')

export const lineUnitPrice = (line: CartLine) =>
  line.basePrice + line.options.reduce((sum, o) => sum + o.price, 0)

export const lineTotal = (line: CartLine) => lineUnitPrice(line) * line.quantity

export const cartTotal = (lines: CartLine[]) =>
  lines.reduce((sum, l) => sum + lineTotal(l), 0)

export const cartCount = (lines: CartLine[]) =>
  lines.reduce((n, l) => n + l.quantity, 0)

// ตะกร้าเป็น client state จริง ๆ (ยังไม่มีใน backend จนกว่าจะกดส่งเข้าครัว)
// จึงใช้ zustand + persist ไม่ใช่ TanStack Query
export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      token: null,
      lines: [],
      repriced: [],

      bindToken: (token) =>
        set((state) =>
          state.token === token ? state : { token, lines: [], repriced: [] },
        ),

      add: (line) =>
        set((state) => {
          const lineId = makeLineId(line.menuItemId, line.options, line.note)
          const existing = state.lines.find((l) => l.lineId === lineId)
          if (existing) {
            return {
              lines: state.lines.map((l) =>
                l.lineId === lineId
                  ? // เพิ่มเมนูเดิมซ้ำหลายรอบ อย่าให้รวมเกินเพดานของ backend
                    { ...l, quantity: Math.min(l.quantity + line.quantity, MAX_ITEM_QUANTITY) }
                  : l,
              ),
            }
          }
          return { lines: [...state.lines, { ...line, lineId }] }
        }),

      setQuantity: (lineId, quantity) =>
        set((state) => ({
          lines:
            quantity <= 0
              ? state.lines.filter((l) => l.lineId !== lineId)
              : state.lines.map((l) =>
                  l.lineId === lineId
                    ? { ...l, quantity: Math.min(quantity, MAX_ITEM_QUANTITY) }
                    : l,
                ),
        })),

      remove: (lineId) =>
        set((state) => ({
          lines: state.lines.filter((l) => l.lineId !== lineId),
        })),

      clear: () => set({ lines: [], repriced: [] }),

      syncPrices: (menu) => {
        const { lines, changed } = repriceLines(get().lines, menu)
        if (changed.length === 0) return
        set((state) => ({ lines, repriced: [...new Set([...state.repriced, ...changed])] }))
      },
    }),
    {
      name: 'restaurant.cart',
      partialize: ({ token, lines }) => ({ token, lines }),
    },
  ),
)
