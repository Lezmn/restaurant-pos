import { MAX_ITEM_QUANTITY } from '@/lib/config'
import type { Id } from '@/types/models'
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
  /** เรียกตอนเข้าหน้าลูกค้า: ถ้าเป็นคนละโต๊ะให้ล้างตะกร้าทิ้ง */
  bindToken: (token: string) => void
  add: (line: Omit<CartLine, 'lineId'>) => void
  setQuantity: (lineId: string, quantity: number) => void
  remove: (lineId: string) => void
  clear: () => void
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
    (set) => ({
      token: null,
      lines: [],

      bindToken: (token) =>
        set((state) =>
          state.token === token ? state : { token, lines: [] },
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
                  l.lineId === lineId ? { ...l, quantity } : l,
                ),
        })),

      remove: (lineId) =>
        set((state) => ({
          lines: state.lines.filter((l) => l.lineId !== lineId),
        })),

      clear: () => set({ lines: [] }),
    }),
    { name: 'restaurant.cart' },
  ),
)
