import { useMutation } from '@tanstack/react-query'
import { changePassword, login } from './api'
import { useAuth } from './use-auth'

export function useLogin() {
  const signIn = useAuth((s) => s.signIn)
  return useMutation({
    mutationFn: login,
    onSuccess: (data) => signIn(data.accessToken, data.user),
  })
}

/** เปลี่ยนรหัสผ่านของตัวเอง (ทุก role) — ต้องรู้รหัสเดิม */
export const useChangePassword = () => useMutation({ mutationFn: changePassword })
