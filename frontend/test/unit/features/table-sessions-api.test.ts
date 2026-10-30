import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSessions } from '@/features/table-sessions/api'

afterEach(() => vi.restoreAllMocks())

describe('getSessions', () => {
  // ทดสอบ: ดึงเฉพาะโต๊ะที่เปิดอยู่ — ไม่กรองจะได้ทุก session ที่เคยเปิด หน้าเช็คบิลโหลดช้าเป็นวินาที
  // วิธี: mock fetch → เรียก getSessions → เช็ก URL มี ?status=OPEN
  it('ขอเฉพาะ session ที่เปิดอยู่ (?status=OPEN)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
    await getSessions()
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/table-sessions\?status=OPEN$/)
  })
})
