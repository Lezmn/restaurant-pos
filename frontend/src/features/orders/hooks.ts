import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LIVE_STALE_TIME, useLivePollInterval } from '@/lib/live'
import { clearOrder, createOrder, getOrders, updateOrderStatus } from './api'

export const orderKeys = {
  all: ['orders'] as const,
}

/** refetchInterval เป็นแค่ fallback — ปกติ socket จะสั่ง refetch ทันทีที่มี event */
export const useOrders = (options?: { refetchInterval?: number }) =>
  useQuery({
    queryKey: orderKeys.all,
    queryFn: getOrders,
    refetchInterval: useLivePollInterval(options?.refetchInterval),
    staleTime: LIVE_STALE_TIME,
  })

export function useUpdateOrderStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: updateOrderStatus,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: orderKeys.all })
      // ยกเลิกออเดอร์แล้วโต๊ะกลับเป็นว่าง
      qc.invalidateQueries({ queryKey: ['tables'] })
    },
  })
}

/** เคลียร์ออเดอร์ที่เสิร์ฟแล้วออกจากบอร์ดครัว */
export function useClearOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: clearOrder,
    onSuccess: () => qc.invalidateQueries({ queryKey: orderKeys.all }),
  })
}

export function useCreateOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createOrder,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: orderKeys.all })
      qc.invalidateQueries({ queryKey: ['public'] })
    },
  })
}
