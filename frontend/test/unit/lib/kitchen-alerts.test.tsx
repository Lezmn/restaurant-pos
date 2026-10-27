import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { playAlert, useAlertSound } from '@/lib/alert-sound'
import { useNewArrivals } from '@/lib/use-new-arrivals'
import { useWakeLock } from '@/lib/use-wake-lock'

describe('useNewArrivals — ออเดอร์/คำขอใหม่', () => {
  // ทดสอบ: เสียงแจ้งออเดอร์ใหม่: โหลดครั้งแรกไม่ร้อง, มีของใหม่ร้องครั้งเดียว, ข้อมูลเดิมไม่ร้อง, ของที่หายไปแล้วกลับมาไม่ร้องซ้ำ และบอกจำนวนของใหม่ถูก
  // วิธี: renderHook useNewArrivals แล้ว rerender ด้วยรายการ id ทีละชุด → เช็กว่า onArrive ถูกเรียกเมื่อไหร่และด้วยจำนวนเท่าไร
  it('โหลดครั้งแรกไม่ร้อง, มี id ใหม่ร้องครั้งเดียว, หายไปแล้วกลับมาไม่ร้องซ้ำ', () => {
    const onArrive = vi.fn()
    const { rerender } = renderHook(({ ids }) => useNewArrivals(ids, onArrive), {
      initialProps: { ids: undefined as string[] | undefined },
    })
    rerender({ ids: ['a', 'b'] })
    expect(onArrive).not.toHaveBeenCalled()

    rerender({ ids: ['a', 'b', 'c'] })
    expect(onArrive).toHaveBeenCalledWith(1)

    // refetch ได้ array ใหม่แต่ข้อมูลเดิม → ไม่ร้อง
    rerender({ ids: ['a', 'b', 'c'] })
    // c ย้ายไปคอลัมน์อื่นแล้วกลับมา (เช่นแก้สถานะผิด) → ไม่ร้องซ้ำ
    rerender({ ids: ['a', 'b'] })
    rerender({ ids: ['a', 'b', 'c'] })
    expect(onArrive).toHaveBeenCalledTimes(1)

    rerender({ ids: ['a', 'b', 'c', 'd', 'e'] })
    expect(onArrive).toHaveBeenLastCalledWith(2)
  })

  // ทดสอบ: เปิดจอครัวตอนยังไม่มีออเดอร์ แล้วออเดอร์แรกเข้ามา ต้องร้อง
  // วิธี: เริ่มด้วยรายการว่าง → rerender มี 1 id → เช็กว่า onArrive ได้ 1
  it('เปิดจอมาตอนไม่มีอะไรค้าง แล้วมีออเดอร์แรก → ร้อง', () => {
    const onArrive = vi.fn()
    const { rerender } = renderHook(({ ids }) => useNewArrivals(ids, onArrive), {
      initialProps: { ids: [] as string[] },
    })
    rerender({ ids: ['first'] })
    expect(onArrive).toHaveBeenCalledWith(1)
  })
})

describe('เสียงแจ้งเตือน', () => {
  // ทดสอบ: ปิดเสียงแล้วต้องจำค่าไว้ในเครื่อง และสั่งเล่นเสียงตอนเบราว์เซอร์ยังไม่ปลดล็อกเสียงต้องไม่ error
  // วิธี: setEnabled(false) → เช็ก localStorage เป็น '0' และ enabled เป็น false → เรียก playAlert('order') ต้องไม่ throw
  it('ปิดเสียงแล้วจำค่าต่อเครื่อง, ยังไม่ปลดล็อกเสียง (ยังไม่แตะจอ) เล่นไม่ได้แต่ไม่ error', () => {
    act(() => useAlertSound.getState().setEnabled(false))
    expect(localStorage.getItem('restaurant.alertSound')).toBe('0')
    expect(useAlertSound.getState().enabled).toBe(false)
    expect(() => playAlert('order')).not.toThrow()
  })
})

describe('useWakeLock — กันจอดับ', () => {
  const original = Object.getOwnPropertyDescriptor(navigator, 'wakeLock')
  afterEach(() => {
    if (original) Object.defineProperty(navigator, 'wakeLock', original)
    else delete (navigator as { wakeLock?: unknown }).wakeLock
  })

  // ทดสอบ: กันจอดับ: ขอ wake lock ตอนเปิดหน้า, พอเบราว์เซอร์ปล่อย lock (สลับแอป) แล้วกลับมาต้องขอใหม่ และออกจากหน้าต้องปล่อย
  // วิธี: mock navigator.wakeLock → render hook เช็กว่าขอ 'screen' → จำลองว่าถูกปล่อย แล้วยิง visibilitychange → เช็กว่าขอใหม่ (รวม 2 ครั้ง) → unmount เช็กว่าเรียก release
  it('ขอ lock ตอนเปิดหน้า, ถูกปล่อย (สลับแอป) แล้วกลับมาขอใหม่, ออกจากหน้าแล้วปล่อย', async () => {
    const listeners: (() => void)[] = []
    const release = vi.fn(async () => {
      for (const l of listeners.splice(0)) l()
    })
    const request = vi.fn(async () => ({
      release,
      addEventListener: (_: string, l: () => void) => listeners.push(l),
    }))
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true })

    const { result, unmount } = renderHook(() => useWakeLock())
    await vi.waitFor(() => expect(result.current).toBe(true))
    expect(request).toHaveBeenCalledWith('screen')

    // เบราว์เซอร์ปล่อย lock เอง (ปิดจอ/สลับแอป) → กลับมาที่หน้าเว็บต้องขอใหม่
    await act(async () => {
      for (const l of listeners.splice(0)) l()
    })
    expect(result.current).toBe(false)
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await vi.waitFor(() => expect(result.current).toBe(true))
    expect(request).toHaveBeenCalledTimes(2)

    unmount()
    expect(release).toHaveBeenCalled()
  })

  // ทดสอบ: เบราว์เซอร์ที่ไม่มี wake lock ต้องไม่ทำอะไรและไม่ error
  // วิธี: ลบ navigator.wakeLock → render hook → เช็กว่าได้ false
  it('เบราว์เซอร์ไม่รองรับ → ไม่ทำอะไร ไม่ error', () => {
    delete (navigator as { wakeLock?: unknown }).wakeLock
    const { result } = renderHook(() => useWakeLock())
    expect(result.current).toBe(false)
  })
})
