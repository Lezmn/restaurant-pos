import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createUser, deleteUser, getUsers, updateUser } from './api'

export const userKeys = { all: ['users'] as const }

export const useUsers = () => useQuery({ queryKey: userKeys.all, queryFn: getUsers })

function useUserMutation<TVars, TData>(fn: (vars: TVars) => Promise<TData>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all }),
  })
}

export const useCreateUser = () => useUserMutation(createUser)
export const useUpdateUser = () => useUserMutation(updateUser)
export const useDeleteUser = () => useUserMutation(deleteUser)
