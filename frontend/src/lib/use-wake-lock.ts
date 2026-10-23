import { useEffect, useState } from 'react'

/**
 * กันจอดับระหว่างเปิดหน้านี้ (แท็บเล็ตครัว) — Screen Wake Lock API
 * - ใช้ได้เฉพาะ HTTPS/localhost และเบราว์เซอร์ที่รองรับ (Chrome/Android, Safari iPadOS 16.4+)
 * - เบราว์เซอร์ปล่อย lock เองเมื่อสลับแอป/ปิดจอ — กลับมาที่หน้าเว็บแล้วขอใหม่อัตโนมัติ
 * คืนค่า true เมื่อกำลังกันจอดับอยู่ (ไว้โชว์ให้ครัวรู้)
 */
export function useWakeLock(enabled = true) {
  const [active, setActive] = useState(false)

  useEffect(() => {
    const api = (navigator as Navigator & { wakeLock?: WakeLock }).wakeLock
    if (!enabled || !api) return
    let sentinel: WakeLockSentinel | null = null
    let cancelled = false

    const request = async () => {
      if (document.visibilityState !== 'visible' || sentinel) return
      try {
        const lock = await api.request('screen')
        if (cancelled) {
          void lock.release()
          return
        }
        sentinel = lock
        setActive(true)
        lock.addEventListener('release', () => {
          sentinel = null
          setActive(false)
        })
      } catch {
        // แบตต่ำ/โหมดประหยัดพลังงาน/ไม่อนุญาต — ไม่เป็นไร จอดับตามปกติ
        setActive(false)
      }
    }

    void request()
    document.addEventListener('visibilitychange', request)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', request)
      void sentinel?.release()
    }
  }, [enabled])

  return active
}
