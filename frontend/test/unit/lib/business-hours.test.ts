import { describe, expect, it } from 'vitest'
import { parseBusinessHours } from '@/lib/config'

describe('parseBusinessHours', () => {
  it('ช่วงปกติ รวมชั่วโมงปิดด้วย', () => {
    expect(parseBusinessHours('10', '13')).toEqual([10, 11, 12, 13])
  })

  it('เปิดข้ามเที่ยงคืน เรียงตามเวลาจริง', () => {
    expect(parseBusinessHours('22', '1')).toEqual([22, 23, 0, 1])
  })

  it('เปิดกับปิดชั่วโมงเดียวกัน = ชั่วโมงเดียว', () => {
    expect(parseBusinessHours('9', '9')).toEqual([9])
  })

  it.each([
    [undefined, undefined],
    ['', '22'],
    ['10', ''],
    ['24', '22'],
    ['10', 'abc'],
    ['-1', '5'],
    ['10.5', '22'],
  ])('ค่าว่าง/ผิดรูป (%s, %s) → null ให้ตัดตามข้อมูล', (open, close) => {
    expect(parseBusinessHours(open, close)).toBeNull()
  })
})
