import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { playAlert, useAlertSound } from './alert-sound'
import { useNewArrivals } from './use-new-arrivals'
import { useWakeLock } from './use-wake-lock'

describe('useNewArrivals — ออเดอร์/คำขอใหม่', () => {
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

  it('เบราว์เซอร์ไม่รองรับ → ไม่ทำอะไร ไม่ error', () => {
    delete (navigator as { wakeLock?: unknown }).wakeLock
    const { result } = renderHook(() => useWakeLock())
    expect(result.current).toBe(false)
  })
})
