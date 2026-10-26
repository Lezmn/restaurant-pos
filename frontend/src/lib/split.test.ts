import { describe, expect, it } from 'vitest'
import { splitShare } from './split'

describe('splitShare', () => {
  it('ปัดลงเป็นสตางค์ คนสุดท้ายจ่ายเศษ (ตรงกับ backend)', () => {
    expect(splitShare(100, 3)).toBe(33.33)
    expect(splitShare(100, 3, 2, 66.66)).toBe(33.34)
    expect(splitShare(211.95, 4)).toBe(52.98)
    expect(splitShare(211.95, 4, 3, 158.94)).toBe(53.01)
  })

  it('ยอดน้อยมากไม่ติดลบ', () => {
    expect(splitShare(0.05, 3)).toBe(0.01)
    expect(splitShare(0.05, 3, 2, 0.02)).toBe(0.03)
  })
})
