import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { usePagination } from './use-pagination'

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

describe('usePagination', () => {
  it('รายการว่าง: 1 หน้า from/to = 0', () => {
    const { result } = renderHook(() => usePagination([] as number[]))
    expect(result.current).toMatchObject({ page: 1, totalPages: 1, from: 0, to: 0, total: 0 })
  })

  it('ตัดหน้าละ 10 และ from–to ถูก', () => {
    const items = range(24)
    const { result } = renderHook(() => usePagination(items))
    expect(result.current.totalPages).toBe(3)
    act(() => result.current.setPage(3))
    expect(result.current.pageItems).toEqual([21, 22, 23, 24])
    expect([result.current.from, result.current.to]).toEqual([21, 24])
  })

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
