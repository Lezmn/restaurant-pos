import { useMutation } from '@tanstack/react-query'
import { login } from './api'
import { useAuth } from './use-auth'

export function useLogin() {
  const signIn = useAuth((s) => s.signIn)
  return useMutation({
    mutationFn: login,
    onSuccess: (data) => signIn(data.accessToken, data.user),
  })
}
