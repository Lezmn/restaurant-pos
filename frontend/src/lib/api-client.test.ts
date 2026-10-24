import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Role } from '@/types/enums'
import { ApiError, RATE_LIMIT_MESSAGE, apiClient, isRateLimited } from './api-client'
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

  it('429 → ApiError บอกให้รอ ไม่ใช่ข้อความ ThrottlerException จาก backend', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(json(429, { statusCode: 429, message: 'ThrottlerException: Too Many Requests' })),
    )
    const error = await apiClient('/menu').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(isRateLimited(error)).toBe(true)
    expect((error as ApiError).message).toBe(RATE_LIMIT_MESSAGE)
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
  it('ส่งไฟล์ (FormData) → ไม่ใส่ Content-Type JSON ทับ ให้ browser ใส่ multipart boundary เอง', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(json(201, { url: 'https://api.x/uploads/a.webp' })))
    vi.stubGlobal('fetch', fetchMock)
    const form = new FormData()
    form.append('file', new Blob(['x'], { type: 'image/webp' }), 'menu.webp')
    await apiClient('/uploads/menu-image', { method: 'POST', body: form })
    expect(fetchMock.mock.calls[0][1].headers['Content-Type']).toBeUndefined()

    await apiClient('/menu', { method: 'POST', body: '{}' })
    expect(fetchMock.mock.calls[1][1].headers['Content-Type']).toBe('application/json')
  })

  it('200 body ว่าง → สำเร็จ ไม่ใช่ error (กันเคสลบสำเร็จแต่จอขึ้น error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 200 })))
    await expect(apiClient('/users/1', { method: 'DELETE' })).resolves.toBeUndefined()
  })
})
