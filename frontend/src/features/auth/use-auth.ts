import { authStorage } from '@/lib/auth-storage'
import type { Role } from '@/types/enums'
import type { User } from '@/types/models'
import { create } from 'zustand'

interface AuthState {
  user: User | null
  signIn: (token: string, user: User) => void
  signOut: () => void
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
}))

export const useHasRole = (...roles: Role[]) => {
  const user = useAuth((s) => s.user)
  return user !== null && roles.includes(user.role)
}
