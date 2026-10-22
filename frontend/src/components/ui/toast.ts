import { create } from 'zustand'

/**
 * แจ้งผลหลังทำสำเร็จ (ปิดขาย / รับเงิน / ปิดโต๊ะ ...) พร้อมปุ่ม "เลิกทำ" ถ้าย้อนได้
 * เดิมกดแล้วหน้าเปลี่ยนเงียบ ๆ ผู้ใช้ไม่แน่ใจว่าระบบรับแล้วหรือยัง
 */
interface ToastAction {
  label: string
  run: () => void
}

export interface ToastItem {
  id: number
  message: string
  action?: ToastAction
}

interface ToastState {
  toasts: ToastItem[]
  push: (message: string, action?: ToastAction) => void
  dismiss: (id: number) => void
}

/** มีปุ่มเลิกทำ = ให้เวลาอ่าน/กดนานขึ้น */
export const DURATION_MS = 4000
export const DURATION_WITH_ACTION_MS = 7000
/** กองไว้แค่ 3 อันล่าสุด กันจอรกตอนกดสวิตช์ติด ๆ กัน */
const MAX_TOASTS = 3

let nextId = 1

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (message, action) =>
    set((s) => ({
      toasts: [...s.toasts, { id: nextId++, message, action }].slice(-MAX_TOASTS),
    })),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

/** เรียกได้จากทุกที่ ไม่ต้องผ่าน hook */
export const toast = (message: string, action?: ToastAction) =>
  useToasts.getState().push(message, action)
