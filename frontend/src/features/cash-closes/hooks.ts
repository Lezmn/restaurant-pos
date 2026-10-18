import { LIVE_STALE_TIME } from '@/lib/live'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createCashClose,
  deleteCashClose,
  getCashClosePreview,
  getCashCloses,
} from './api'

// ขึ้นต้นด้วย 'cash-closes' ทั้งหมด — features/live invalidate ตอนมีบิลใหม่/ยกเลิกบิล
export const cashCloseKeys = {
  all: ['cash-closes'] as const,
  preview: ['cash-closes', 'preview'] as const,
  list: (month: string) => ['cash-closes', 'list', month] as const,
}

/** ยอดลิ้นชักวันนี้ — อัปเดตตาม socket (payment.created/voided) เหมือนบิลวันนี้ */
export const useCashClosePreview = () =>
  useQuery({
    queryKey: cashCloseKeys.preview,
    queryFn: getCashClosePreview,
    staleTime: LIVE_STALE_TIME,
  })

export const useCashCloses = (month: string) =>
  useQuery({
    queryKey: cashCloseKeys.list(month),
    queryFn: () => getCashCloses(month),
  })

export const useCreateCashClose = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createCashClose,
    onSuccess: () => qc.invalidateQueries({ queryKey: cashCloseKeys.all }),
  })
}

export const useDeleteCashClose = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteCashClose,
    onSuccess: () => qc.invalidateQueries({ queryKey: cashCloseKeys.all }),
  })
}
