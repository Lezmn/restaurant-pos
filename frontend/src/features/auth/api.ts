import { apiClient } from '@/lib/api-client'
import { LOGIN_EMAIL_DOMAIN } from '@/lib/config'
import { mapUser } from '@/lib/map'
import type { ApiLoginResponse } from '@/types/api'
import type { User } from '@/types/models'

export interface LoginPayload {
  /** ชื่อผู้ใช้ เช่น "admin" หรือจะพิมพ์อีเมลเต็มก็ได้ */
  username: string
  password: string
}

/** "admin" → "admin@restaurant.local", ถ้าพิมพ์อีเมลเต็มมาแล้วก็ใช้ตามนั้น */
export const toLoginEmail = (username: string) => {
  const name = username.trim().toLowerCase()
  return name.includes('@') ? name : `${name}@${LOGIN_EMAIL_DOMAIN}`
}

/**
 * POST /auth/login — backend รับเฉพาะ { email, password } (LoginDto ใช้ @IsEmail)
 * หน้าจอให้กรอกแค่ชื่อผู้ใช้ แล้วเติมโดเมนของร้านให้ที่นี่
 * backend ตั้ง JWT ใน httpOnly cookie ให้เอง — accessToken ใน body ตั้งใจไม่เก็บ (มีไว้ให้ Swagger/สคริปต์)
 */
export async function login(payload: LoginPayload): Promise<User> {
  const data = await apiClient<ApiLoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: toLoginEmail(payload.username),
      password: payload.password,
    }),
  })

  return mapUser(data.user)
}

/** PATCH /auth/password — เฉพาะ ADMIN เปลี่ยนรหัสของตัวเอง ต้องใส่รหัสเดิม (กันคนหยิบเครื่องที่ login ค้างไปเปลี่ยน) */
export async function changePassword(vars: {
  currentPassword: string
  newPassword: string
}): Promise<void> {
  await apiClient<unknown>('/auth/password', {
    method: 'PATCH',
    body: JSON.stringify(vars),
  })
}
