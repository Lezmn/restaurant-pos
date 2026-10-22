import { describe, expect, it } from 'vitest'
import { formatBaht, formatTime } from './format'

// Intl ใส่ช่องว่างไม่ตัด (U+00A0) ได้ — เทียบแบบตัดช่องว่างทิ้ง
const plain = (s: string) => s.replace(/\s/g, '')

describe('formatBaht', () => {
  it('จำนวนเต็มไม่มีทศนิยม', () => {
    expect(plain(formatBaht(1250))).toBe('฿1,250')
  })
  it('สตางค์แสดงไม่เกิน 2 ตำแหน่ง', () => {
    expect(plain(formatBaht(45.5))).toBe('฿45.5')
    expect(plain(formatBaht(0.1 + 0.2))).toBe('฿0.3')
  })
  it('ศูนย์และติดลบ (รายจ่าย/ขาด)', () => {
    expect(plain(formatBaht(0))).toBe('฿0')
    expect(plain(formatBaht(-30.25))).toBe('-฿30.25')
  })
})

describe('formatTime', () => {
  it('แสดงเวลาไทย HH:MM', () => {
    // 12:05Z = 19:05 เวลาไทย (vitest ตั้ง TZ=Asia/Bangkok)
    expect(formatTime('2026-10-21T12:05:00Z')).toBe('19:05')
  })
})
