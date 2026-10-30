import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Role } from '@/types/enums'
import { ApiError, RATE_LIMIT_MESSAGE, apiClient, isRateLimited } from '@/lib/api-client'
import { authStorage } from '@/lib/auth-storage'

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

  // ทดสอบ: โดนจำกัดจำนวนคำขอ (429) ต้องได้ข้อความบอกให้รอ แทนข้อความภาษาอังกฤษจาก backend
  // วิธี: mock fetch ตอบ 429 ThrottlerException → เรียก apiClient → เช็กว่าเป็น ApiError, isRateLimited เป็น true และข้อความเป็น RATE_LIMIT_MESSAGE
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

  // ทดสอบ: ทุกคำขอต้องให้ browser แนบ cookie JWT ไปด้วย และไม่มี token ใน header แล้ว
  // วิธี: login อยู่ → mock fetch → เรียก apiClient → เช็ก credentials = 'include' และไม่มี Authorization
  it('ส่ง cookie (credentials: include) ไม่แนบ Authorization', async () => {
    authStorage.save(admin)
    const fetchMock = vi.fn().mockResolvedValue(json(200, { ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    await apiClient('/orders')
    expect(fetchMock.mock.calls[0][1].credentials).toBe('include')
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined()
  })

  // ทดสอบ: token หมดอายุ (401) ต้องล้างข้อมูลผู้ใช้แล้วพาไปหน้า /login
  // วิธี: login อยู่ → mock fetch ตอบ 401 → เช็กว่า reject ด้วย status 401, ข้อมูลผู้ใช้ถูกล้าง และ location.href เป็น /login
  it('401 → ล้างข้อมูลผู้ใช้แล้วเด้งไป /login', async () => {
    authStorage.save(admin)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(401, { message: 'Unauthorized' })))
    await expect(apiClient('/orders')).rejects.toMatchObject({ status: 401 })
    expect(authStorage.getUser()).toBeNull()
    expect(href).toBe('/login')
  })

  // ทดสอบ: 401 ตอน login (รหัสผิด) ต้องไม่พาไปหน้าอื่น ให้หน้า login แสดง error เอง
  // วิธี: mock fetch ตอบ 401 → เรียก POST /auth/login → เช็กว่าได้ error ข้อความจาก backend และ href ไม่เปลี่ยน
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

  // ทดสอบ: error 400 ที่ backend ส่งข้อความมาเป็นหลายข้อ ต้องรวมเป็นข้อความเดียว
  // วิธี: mock fetch ตอบ 400 พร้อม message 2 ข้อ → เช็กว่าเป็น ApiError status 400 ข้อความ 'a ผิด, b ผิด'
  it('error 400 ที่ message เป็น array → รวมเป็นข้อความเดียว', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(400, { message: ['a ผิด', 'b ผิด'] })))
    const err = await apiClient('/x').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(400)
    expect((err as ApiError).message).toBe('a ผิด, b ผิด')
  })

  // ทดสอบ: error ที่ body ไม่ใช่ JSON (เช่นหน้า HTML จาก proxy) ต้องได้ข้อความสำรองที่มีรหัส status
  // วิธี: mock fetch ตอบ '<html>' status 502 → เช็กว่า error ข้อความ 'เกิดข้อผิดพลาด (502)'
  it('error ที่ body ไม่ใช่ JSON → ข้อความ fallback มีรหัส status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>', { status: 502 })))
    await expect(apiClient('/x')).rejects.toThrow('เกิดข้อผิดพลาด (502)')
  })

  // ทดสอบ: คำตอบ 204 (ไม่มีเนื้อหา) ต้องได้ undefined ไม่ error
  // วิธี: mock fetch ตอบ 204 → เช็กว่า resolve เป็น undefined
  it('204 → undefined', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
    await expect(apiClient('/x')).resolves.toBeUndefined()
  })

  // ทดสอบ: ตอนส่งไฟล์ (FormData) ต้องไม่ใส่ Content-Type JSON ทับ ให้เบราว์เซอร์ใส่ multipart เอง แต่คำขอปกติยังเป็น JSON
  // วิธี: mock fetch → ส่ง FormData ไป /uploads/menu-image เช็กว่าไม่มี Content-Type → ส่ง body '{}' ไป /menu เช็กว่าเป็น application/json
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

  /** Nest คืน 200 body ว่างเมื่อ handler return void (เช่น DELETE /users/:id ใน users.service) */
  // ทดสอบ: คำตอบ 200 ที่ body ว่าง (เช่นลบสำเร็จ) ต้องนับว่าสำเร็จ ไม่ขึ้น error บนจอ
  // วิธี: mock fetch ตอบ '' status 200 → เรียก DELETE /users/1 → เช็กว่า resolve เป็น undefined
  it('200 body ว่าง → สำเร็จ ไม่ใช่ error (กันเคสลบสำเร็จแต่จอขึ้น error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 200 })))
    await expect(apiClient('/users/1', { method: 'DELETE' })).resolves.toBeUndefined()
  })
})
