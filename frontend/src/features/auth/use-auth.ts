import { authStorage } from '@/lib/auth-storage'
import type { Role } from '@/types/enums'
import type { User } from '@/types/models'
import { create } from 'zustand'

interface AuthState {
  user: User | null
  signIn: (token: string, user: User) => void
  signOut: () => void
  /** แก้ข้อมูล user ที่เก็บไว้ (เช่น เปลี่ยนรหัสชั่วคราวเสร็จ) โดยไม่ต้อง login ใหม่ */
  updateUser: (patch: Partial<User>) => void
}

export const useAuth = create<AuthState>((set) => ({
  user: authStorage.getUser(),
  signIn: (token, user) => {
    authStorage.save(token, user)
    set({ user })
  },
  signOut: () => {
    authStorage.clear()
    set({ user: null })
  },
  updateUser: (patch) =>
    set((s) => {
      const token = authStorage.getToken()
      if (!s.user || !token) return s
      const user = { ...s.user, ...patch }
      authStorage.save(token, user)
      return { user }
    }),
}))

export const useHasRole = (...roles: Role[]) => {
  const user = useAuth((s) => s.user)
  return user !== null && roles.includes(user.role)
}
