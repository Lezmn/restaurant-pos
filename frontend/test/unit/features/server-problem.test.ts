import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api-client'
import { describeServerProblem } from '@/features/system/server-problem'

describe('describeServerProblem', () => {
  it('ไม่มี error = ไม่มีปัญหา', () => {
    expect(describeServerProblem(null)).toBeNull()
  })

  it('เน็ตหลุด / เซิร์ฟเวอร์ไม่ตอบ (fetch โยน TypeError) = แดง ติดต่อไม่ได้', () => {
    const p = describeServerProblem(new TypeError('Failed to fetch'))
    expect(p?.state).toBe('error')
    expect(p?.message).toContain('ติดต่อเซิร์ฟเวอร์ไม่ได้')
  })

  it('404 = เหลือง เซิร์ฟเวอร์เวอร์ชันเก่า ขายของได้ปกติ', () => {
    const p = describeServerProblem(new ApiError(404, 'Cannot GET /system/status'))
    expect(p?.state).toBe('warn')
    expect(p?.message).toContain('เวอร์ชันเก่า')
  })

  it('429 = เหลือง รอสักครู่', () => {
    expect(describeServerProblem(new ApiError(429, 'Too Many Requests'))?.state).toBe('warn')
  })

  it('500 = แดง บอกรหัส', () => {
    const p = describeServerProblem(new ApiError(500, 'Internal Server Error'))
    expect(p?.state).toBe('error')
    expect(p?.message).toContain('รหัส 500')
  })
})
