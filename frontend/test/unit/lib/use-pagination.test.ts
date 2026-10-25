import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { usePagination } from '@/lib/use-pagination'

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

describe('usePagination', () => {
  // ทดสอบ: รายการว่างต้องได้ 1 หน้า และ from/to/total เป็น 0
  // วิธี: renderHook usePagination กับ [] → เช็ก page, totalPages, from, to, total
  it('รายการว่าง: 1 หน้า from/to = 0', () => {
    const { result } = renderHook(() => usePagination([] as number[]))
    expect(result.current).toMatchObject({ page: 1, totalPages: 1, from: 0, to: 0, total: 0 })
  })

  // ทดสอบ: แบ่งหน้าละ 10 รายการ และเลขช่วง from–to ถูก
  // วิธี: รายการ 24 ชิ้น → เช็กว่ามี 3 หน้า → ไปหน้า 3 → เช็กว่าได้ 21–24
  it('ตัดหน้าละ 10 และ from–to ถูก', () => {
    const items = range(24)
    const { result } = renderHook(() => usePagination(items))
    expect(result.current.totalPages).toBe(3)
    act(() => result.current.setPage(3))
    expect(result.current.pageItems).toEqual([21, 22, 23, 24])
    expect([result.current.from, result.current.to]).toEqual([21, 24])
  })

  // ทดสอบ: รายการลดลงจนหน้าปัจจุบันไม่มีแล้ว ต้องปรับไปหน้าที่มีอยู่ ไม่ค้างหน้าว่าง
  // วิธี: รายการ 30 ชิ้นแล้วไปหน้า 3 → เปลี่ยนเหลือ 5 ชิ้นแล้ว rerender → เช็กว่ากลับมาหน้า 1 และเห็นครบ 5 ชิ้น
  it('รายการหดลง → หน้าปัจจุบันถูก clamp ไม่ค้างหน้าว่าง', () => {
    let items = range(30)
    const { result, rerender } = renderHook(() => usePagination(items))
    act(() => result.current.setPage(3))
    items = range(5)
    rerender()
    expect(result.current.page).toBe(1)
    expect(result.current.pageItems).toEqual([1, 2, 3, 4, 5])
  })
})
