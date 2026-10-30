import { apiClient } from '@/lib/api-client'
import { authStorage } from '@/lib/auth-storage'
import type { Role } from '@/types/enums'
import type { User } from '@/types/models'
import { create } from 'zustand'

interface AuthState {
  user: User | null
  signIn: (user: User) => void
  signOut: () => void
  /** แก้ข้อมูล user ที่เก็บไว้ (เช่น เปลี่ยนรหัสชั่วคราวเสร็จ) โดยไม่ต้อง login ใหม่ */
  updateUser: (patch: Partial<User>) => void
}

export const useAuth = create<AuthState>((set) => ({
  user: authStorage.getUser(),
  signIn: (user) => {
    authStorage.save(user)
    set({ user })
  },
  signOut: () => {
    // cookie เป็น httpOnly ลบจาก JS ไม่ได้ ต้องให้ backend ลบ — เน็ตหลุดก็ยังออกจากหน้าจอได้ (cookie หมดอายุเองตาม JWT)
    apiClient('/auth/logout', { method: 'POST' }).catch(() => {})
    authStorage.clear()
    set({ user: null })
  },
  updateUser: (patch) =>
    set((s) => {
      if (!s.user) return s
      const user = { ...s.user, ...patch }
      authStorage.save(user)
      return { user }
    }),
}))

export const useHasRole = (...roles: Role[]) => {
  const user = useAuth((s) => s.user)
  return user !== null && roles.includes(user.role)
}
