import { authStorage } from './auth-storage'

// fetch wrapper ตัวเดียวของทั้งแอป — features/*/api.ts ต้องเรียกผ่านตัวนี้เสมอ
// ตั้ง URL ของ API ผ่าน VITE_API_URL ใน .env
const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/**
 * API ตอบ 429 = เครื่องนี้/บัญชีนี้ส่งคำขอเกินเพดานต่อนาที — ไม่ใช่เน็ตหลุด รอแล้วหายเอง
 * ต้องแยกบอกให้ชัด ไม่งั้นหน้าขึ้น "ตรวจการเชื่อมต่ออินเทอร์เน็ต" แล้วผู้ใช้กดลองใหม่รัว ๆ ยิ่งนานขึ้น
 */
export const RATE_LIMIT_MESSAGE =
  'ส่งคำขอถี่เกินไป ระบบพักรับคำขอชั่วคราว — รอสักครู่ (ไม่เกิน 1 นาที) แล้วจะกลับมาเอง'

export const isRateLimited = (error: unknown) =>
  error instanceof ApiError && error.status === 429

/** หน้า login รวมของทุก role — ใช้ตอน token หมดอายุแล้วต้องเด้งออก */
const LOGIN_PATH = '/login'

export async function apiClient<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = authStorage.getToken()
  const isLoginRequest = path === '/auth/login'

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      // อัปโหลดไฟล์ (FormData) ให้ browser ใส่ multipart + boundary เอง — ใส่ JSON ทับ backend จะอ่านไฟล์ไม่ได้
      ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })

  // 401 ตอน login = รหัสผิด ต้องปล่อยให้หน้า login แสดง error เอง
  // (เดิมเด้ง window.location ทุกกรณี หน้ารีโหลด error เลยหายก่อนได้แสดง)
  if (res.status === 401 && !isLoginRequest) {
    authStorage.clear()
    window.location.href = LOGIN_PATH
    throw new ApiError(401, 'ยังไม่ได้เข้าสู่ระบบ')
  }

  if (res.status === 429) {
    throw new ApiError(429, RATE_LIMIT_MESSAGE)
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      message?: string | string[]
    } | null
    const message = Array.isArray(body?.message)
      ? body.message.join(', ')
      : (body?.message ?? `เกิดข้อผิดพลาด (${res.status})`)
    throw new ApiError(res.status, message)
  }

  // 204 หรือ 200 ที่ไม่มี body (endpoint ที่ไม่ return อะไร) = สำเร็จ ไม่ใช่ error ตอน parse
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}
