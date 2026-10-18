import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { menuKeys } from '@/features/menu/hooks'
import {
  createIngredient,
  deleteIngredient,
  getIngredients,
  updateIngredient,
} from './api'

export const ingredientKeys = { all: ['ingredients'] as const }

export const useIngredients = () =>
  useQuery({ queryKey: ingredientKeys.all, queryFn: getIngredients })

/**
 * วัตถุดิบเปลี่ยน = ตัวเลือกเมนูที่ผูกไว้เปลี่ยนตาม
 * ต้องล้างทั้งเมนูฝั่งจัดการและเมนูฝั่งลูกค้า (/public/menu กรองตัวเลือกที่วัตถุดิบหมดออกให้แล้ว)
 */
function useIngredientMutation<TVars, TData>(fn: (vars: TVars) => Promise<TData>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ingredientKeys.all })
      qc.invalidateQueries({ queryKey: menuKeys.items })
      qc.invalidateQueries({ queryKey: ['public', 'menu'] })
    },
  })
}

export const useCreateIngredient = () => useIngredientMutation(createIngredient)
export const useUpdateIngredient = () => useIngredientMutation(updateIngredient)
export const useDeleteIngredient = () => useIngredientMutation(deleteIngredient)
