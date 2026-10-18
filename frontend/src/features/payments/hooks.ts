import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LIVE_STALE_TIME } from '@/lib/live'
import {
  confirmSlip,
  createPayment,
  getPayment,
  getPayments,
  getSlipIssuePayments,
  recheckSlip,
  voidPayment,
} from './api'
import type { Id } from '@/types/models'

export const paymentKeys = {
  all: ['payments'] as const,
  today: (dayStart: string) => ['payments', 'today', dayStart] as const,
  slipIssues: ['payments', 'slip-issues'] as const,
  detail: (id: Id) => ['payments', id] as const,
}

/** ช่วง [เที่ยงคืนวันนี้, เที่ยงคืนพรุ่งนี้) ตามเวลาเครื่อง */
function todayRange() {
  const from = new Date()
  from.setHours(0, 0, 0, 0)
  const to = new Date(from)
  to.setDate(to.getDate() + 1)
  return { from, to }
}

/** บิลของวันนี้ — key ผูกกับวันที่ ข้ามเที่ยงคืนแล้วจะดึงชุดของวันใหม่เอง */
export const useTodayPayments = () => {
  const range = todayRange()
  return useQuery({
    queryKey: paymentKeys.today(range.from.toISOString()),
    queryFn: () => getPayments(range),
    staleTime: LIVE_STALE_TIME,
  })
}

export const usePayment = (id: Id | undefined) =>
  useQuery({
    queryKey: paymentKeys.detail(id ?? ''),
    queryFn: () => getPayment(id as Id),
    enabled: Boolean(id),
  })

/** จ่ายเงิน / ยกเลิกบิล กระทบ orders, session, โต๊ะ และคำขอเช็คบิล เหมือนกันทั้งคู่ */
function useBillingMutation<TVars, TData>(fn: (vars: TVars) => Promise<TData>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: paymentKeys.all })
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['service-requests'] })
      qc.invalidateQueries({ queryKey: ['tables'] })
      // จ่าย/ยกเลิกแล้ว session ถูกปิด/เปิดกลับ ตารางหน้า Check ต้องอัปเดตด้วย
      qc.invalidateQueries({ queryKey: ['table-sessions'] })
    },
  })
}

export const useCreatePayment = () => useBillingMutation(createPayment)
export const useVoidPayment = () => useBillingMutation(voidPayment)

/** บิลที่สลิปรอตรวจ/ตรวจไม่ผ่าน ทุกวัน — โชว์ในหน้า Check ให้ตามจนกว่าจะจัดการ */
export const useSlipIssuePayments = () =>
  useQuery({
    queryKey: paymentKeys.slipIssues,
    queryFn: getSlipIssuePayments,
    staleTime: LIVE_STALE_TIME,
  })

/** ตรวจซ้ำ / ยืนยันเอง — กระทบรายการบิลและตัวเลขแจ้งเตือนบน Dashboard */
function useSlipMutation<TVars, TData>(fn: (vars: TVars) => Promise<TData>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: paymentKeys.all })
      qc.invalidateQueries({ queryKey: ['reports'] })
    },
  })
}

export const useRecheckSlip = () => useSlipMutation(recheckSlip)
export const useConfirmSlip = () => useSlipMutation(confirmSlip)
