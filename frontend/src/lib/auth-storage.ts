import type { User } from '@/types/models'

// JWT อยู่ใน httpOnly cookie ที่ backend ตั้งให้ (JS อ่านไม่ได้) — ที่นี่เก็บแค่ข้อมูลผู้ใช้ไว้วาดหน้า/เช็ก role
const USER_KEY = 'restaurant.user'
/** เวอร์ชันก่อนเก็บ token ไว้ที่นี่ — ลบทิ้งตอน login/logout ไม่ให้ค้างในเครื่อง */
const LEGACY_TOKEN_KEY = 'restaurant.token'

export const authStorage = {
  getUser(): User | null {
    const raw = localStorage.getItem(USER_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as User
    } catch {
      return null
    }
  },
  save(user: User) {
    localStorage.removeItem(LEGACY_TOKEN_KEY)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  },
  clear() {
    localStorage.removeItem(LEGACY_TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  },
}
