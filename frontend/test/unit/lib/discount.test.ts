import { describe, expect, it } from 'vitest'
import { applyDiscountPercent, isValidDiscountPercent } from '@/lib/discount'

describe('applyDiscountPercent', () => {
  it('ลด 10% ของ 235.50 = 23.55 เก็บ 211.95', () => {
    expect(applyDiscountPercent(235.5, 10)).toEqual({ discount: 23.55, charged: 211.95 })
  })

  it('เศษสตางค์ปัดครึ่งขึ้นเหมือน backend (235.50 × 15% = 35.325 → 35.33)', () => {
    expect(applyDiscountPercent(235.5, 15)).toEqual({ discount: 35.33, charged: 200.17 })
  })

  it('เงินสด: ยอดเก็บปัดครึ่งขึ้นเป็นบาทเต็ม (211.95 → 212, 200.17 → 200)', () => {
    expect(applyDiscountPercent(235.5, 10, true)).toEqual({ discount: 23.5, charged: 212 })
    expect(applyDiscountPercent(235.5, 15, true)).toEqual({ discount: 35.5, charged: 200 })
  })

  it('เงินสดแต่ไม่ลด = ไม่ปัด (ยอดบิลมีสตางค์ก็เก็บตามจริง)', () => {
    expect(applyDiscountPercent(99.5, 0, true)).toEqual({ discount: 0, charged: 99.5 })
  })

  it('100% = ฟรี', () => {
    expect(applyDiscountPercent(120, 100)).toEqual({ discount: 120, charged: 0 })
  })

  it('% ไม่ถูกต้อง (0, ทศนิยม, เกิน 100) = ไม่ลด', () => {
    for (const p of [0, 12.5, 101, Number.NaN]) {
      expect(applyDiscountPercent(100, p)).toEqual({ discount: 0, charged: 100 })
      expect(isValidDiscountPercent(p)).toBe(false)
    }
  })
})
