import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLivePollInterval } from '@/lib/live'
import {
  callStaff,
  getPublicCategories,
  getPublicMenu,
  getSessionByToken,
  getSessionOrders,
  requestCheckout,
  submitOrder,
} from './api'
import { useCart } from './cart-store'

// socket (features/live/hooks.ts) สั่ง refetch ทันทีที่สถานะเปลี่ยน — poll นี้ใช้เฉพาะตอน socket หลุด
export const ORDER_POLL_MS = 10_000

export const publicKeys = {
  session: (token: string) => ['public', 'session', token] as const,
  orders: (token: string) => ['public', 'orders', token] as const,
  menu: ['public', 'menu'] as const,
  categories: ['public', 'categories'] as const,
}

/** ลูกค้าไม่ได้ login จึงต้องใช้ /public/menu ไม่ใช่ /menu ที่มี JwtAuthGuard */
export const usePublicMenu = () =>
  useQuery({ queryKey: publicKeys.menu, queryFn: getPublicMenu })

export const usePublicCategories = () =>
  useQuery({ queryKey: publicKeys.categories, queryFn: getPublicCategories })

export const usePublicMenuItem = (id: string | undefined) =>
  useQuery({
    queryKey: [...publicKeys.menu, id] as const,
    queryFn: async () => {
      const items = await getPublicMenu()
      const item = items.find((m) => m.id === id)
      if (!item) throw new Error('ไม่พบเมนูนี้')
      return item
    },
    enabled: Boolean(id),
  })

/**
 * พอแคชเชียร์ปิดบิล socket จะสั่ง refetch แล้ว backend ตอบ 400 ทันที
 * CustomerLayout ใช้ตรงนี้เปลี่ยนเป็นหน้า "ปิดบิลแล้ว" โดยลูกค้าไม่ต้อง reload
 */
export const useSession = (token: string | undefined) =>
  useQuery({
    queryKey: publicKeys.session(token ?? ''),
    queryFn: () => getSessionByToken(token as string),
    enabled: Boolean(token),
    retry: false,
    refetchInterval: useLivePollInterval(ORDER_POLL_MS),
  })

export const useSessionOrders = (token: string | undefined) =>
  useQuery({
    queryKey: publicKeys.orders(token ?? ''),
    queryFn: () => getSessionOrders(token as string),
    enabled: Boolean(token),
    refetchInterval: useLivePollInterval(ORDER_POLL_MS),
  })

export function useSubmitOrder(token: string | undefined) {
  const qc = useQueryClient()
  const clear = useCart((s) => s.clear)

  return useMutation({
    mutationFn: submitOrder,
    onSuccess: () => {
      clear()
      qc.invalidateQueries({ queryKey: publicKeys.orders(token ?? '') })
      qc.invalidateQueries({ queryKey: ['orders'] })
    },
    // ส่งไม่ผ่านอาจเพราะโต๊ะเพิ่งถูกปิดบิล — เช็ค session ใหม่ทันที ไม่ต้องรอรอบ poll
    onError: () => {
      qc.invalidateQueries({ queryKey: publicKeys.session(token ?? '') })
    },
  })
}

export function useCallStaff() {
  return useMutation({ mutationFn: callStaff })
}

export function useRequestCheckout() {
  return useMutation({ mutationFn: requestCheckout })
}
