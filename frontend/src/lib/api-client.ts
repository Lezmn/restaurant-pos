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
      'Content-Type': 'application/json',
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

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      message?: string | string[]
    } | null
    const message = Array.isArray(body?.message)
      ? body.message.join(', ')
      : (body?.message ?? `เกิดข้อผิดพลาด (${res.status})`)
    throw new ApiError(res.status, message)
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
