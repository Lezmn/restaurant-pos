import { create } from 'zustand'

/**
 * ค่าคงที่ของข้อมูลที่ต้อง "สด" ตลอดเวลา (ออเดอร์ / คำขอของลูกค้า / โต๊ะ)
 *
 * ทางหลักคือ WebSocket (ดู features/live/hooks.ts) — backend push event มาแล้ว
 * เราสั่ง react-query refetch ทันที ไม่ต้องรอรอบ poll
 *
 * polling ยังเก็บไว้เป็น fallback ตอน socket หลุด (เน็ตร้านสะดุด / server restart)
 * - LIVE_POLL_MS สั้นพอที่พนักงานจะเห็นคำขอเกือบทันทีแม้ไม่มี socket
 * - staleTime = 0 เพื่อให้สลับหน้า/กลับมาที่แท็บแล้วดึงใหม่ทันที
 *   (ค่า default ของทั้งแอปคือ 30 วินาที ซึ่งทำให้คำขอที่เข้ามาตอนอยู่หน้าอื่นโผล่ช้า)
 */
export const LIVE_POLL_MS = 3_000
export const LIVE_STALE_TIME = 0

interface LiveState {
  /** socket ต่อกับ backend อยู่หรือไม่ — ใช้ตัดสินว่าต้อง poll สำรองไหม */
  connected: boolean
  setConnected: (connected: boolean) => void
}

export const useLiveStatus = create<LiveState>((set) => ({
  connected: false,
  setConnected: (connected) => set({ connected }),
}))

/**
 * ใช้เป็นค่า refetchInterval ของ query ที่ต้องสด:
 * socket ต่ออยู่ → ไม่ต้อง poll (false) เพราะ event จะสั่ง refetch เอง
 * socket หลุด   → กลับไป poll ตาม fallback ที่ส่งมา
 */
export function useLivePollInterval(fallback: number | undefined) {
  const connected = useLiveStatus((s) => s.connected)
  return connected ? false : fallback
}
