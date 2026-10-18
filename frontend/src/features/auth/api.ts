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

export interface LoginResponse {
  accessToken: string
  user: User
}

/** "admin" → "admin@restaurant.local", ถ้าพิมพ์อีเมลเต็มมาแล้วก็ใช้ตามนั้น */
export const toLoginEmail = (username: string) => {
  const name = username.trim().toLowerCase()
  return name.includes('@') ? name : `${name}@${LOGIN_EMAIL_DOMAIN}`
}

/**
 * POST /auth/login — backend รับเฉพาะ { email, password } (LoginDto ใช้ @IsEmail)
 * หน้าจอให้กรอกแค่ชื่อผู้ใช้ แล้วเติมโดเมนของร้านให้ที่นี่
 */
export async function login(payload: LoginPayload): Promise<LoginResponse> {
  const data = await apiClient<ApiLoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: toLoginEmail(payload.username),
      password: payload.password,
    }),
  })

  return { accessToken: data.accessToken, user: mapUser(data.user) }
}
