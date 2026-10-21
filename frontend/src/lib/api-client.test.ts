import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Role } from '@/types/enums'
import { ApiError, apiClient } from './api-client'
import { authStorage } from './auth-storage'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const admin = { id: 'u', email: 'e', name: 'n', role: Role.ADMIN }

describe('apiClient', () => {
  const originalLocation = window.location
  let href = ''

  beforeEach(() => {
    href = ''
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        get href() {
          return href
        },
        set href(v: string) {
          href = v
        },
      },
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
    vi.unstubAllGlobals()
  })

  it('แนบ Bearer token เมื่อ login อยู่', async () => {
    authStorage.save('tok-1', admin)
    const fetchMock = vi.fn().mockResolvedValue(json(200, { ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    await apiClient('/orders')
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok-1')
  })

  it('401 → ล้าง token แล้วเด้งไป /login', async () => {
    authStorage.save('expired', admin)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(401, { message: 'Unauthorized' })))
    await expect(apiClient('/orders')).rejects.toMatchObject({ status: 401 })
    expect(authStorage.getToken()).toBeNull()
    expect(href).toBe('/login')
  })

  it('401 ตอน login (รหัสผิด) → ไม่เด้ง ให้หน้า login แสดง error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(json(401, { message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' })),
    )
    await expect(apiClient('/auth/login', { method: 'POST' })).rejects.toThrow(
      'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
    )
    expect(href).toBe('')
  })

  it('error 400 ที่ message เป็น array → รวมเป็นข้อความเดียว', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(400, { message: ['a ผิด', 'b ผิด'] })))
    const err = await apiClient('/x').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(400)
    expect((err as ApiError).message).toBe('a ผิด, b ผิด')
  })

  it('error ที่ body ไม่ใช่ JSON → ข้อความ fallback มีรหัส status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>', { status: 502 })))
    await expect(apiClient('/x')).rejects.toThrow('เกิดข้อผิดพลาด (502)')
  })

  it('204 → undefined', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
    await expect(apiClient('/x')).resolves.toBeUndefined()
  })

  /** Nest คืน 200 body ว่างเมื่อ handler return void (เช่น DELETE /users/:id ใน users.service) */
  it('200 body ว่าง → สำเร็จ ไม่ใช่ error (กันเคสลบสำเร็จแต่จอขึ้น error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 200 })))
    await expect(apiClient('/users/1', { method: 'DELETE' })).resolves.toBeUndefined()
  })
})
