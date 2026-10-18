import type { Id } from '@/types/models'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createMenuItem,
  createMenuOption,
  deleteMenuItem,
  deleteMenuOption,
  getCategories,
  getMenuItem,
  getMenuItems,
  setMenuItemAvailability,
  updateMenuItem,
  updateMenuOption,
} from './api'

export const menuKeys = {
  categories: ['categories'] as const,
  items: ['menu-items'] as const,
  item: (id: Id) => ['menu-items', id] as const,
}

export const useCategories = () =>
  useQuery({ queryKey: menuKeys.categories, queryFn: getCategories })

export const useMenuItems = () =>
  useQuery({ queryKey: menuKeys.items, queryFn: getMenuItems })

export const useMenuItem = (id: Id | undefined) =>
  useQuery({
    queryKey: menuKeys.item(id ?? ''),
    queryFn: () => getMenuItem(id as Id),
    enabled: Boolean(id),
  })

export function useSetMenuItemAvailability() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: setMenuItemAvailability,
    onSuccess: () => qc.invalidateQueries({ queryKey: menuKeys.items }),
  })
}

function useMenuMutation<TVars, TData>(fn: (vars: TVars) => Promise<TData>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: menuKeys.items }),
  })
}

export const useCreateMenuItem = () => useMenuMutation(createMenuItem)
export const useUpdateMenuItem = () => useMenuMutation(updateMenuItem)
export const useDeleteMenuItem = () => useMenuMutation(deleteMenuItem)

/**
 * ตัวเลือกเปลี่ยน → ต้อง refetch ทั้งรายการเมนู, เมนูตัวที่เปิดแก้อยู่ (dialog ใช้ useMenuItem)
 * และ /public/menu เพราะลูกค้าเห็นเฉพาะตัวเลือกที่ isAvailable
 */
function useMenuOptionMutation<TVars>(
  fn: (vars: TVars & { menuItemId: Id }) => Promise<void>,
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: menuKeys.items })
      qc.invalidateQueries({ queryKey: menuKeys.item(vars.menuItemId) })
      qc.invalidateQueries({ queryKey: ['public', 'menu'] })
    },
  })
}

export const useCreateMenuOption = () => useMenuOptionMutation(createMenuOption)
export const useUpdateMenuOption = () => useMenuOptionMutation(updateMenuOption)
export const useDeleteMenuOption = () => useMenuOptionMutation(deleteMenuOption)
