import { cashCloseKeys } from '@/features/cash-closes/hooks'
import { reportKeys } from '@/features/reports/hooks'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { addDrawerExpense, addExpense, deleteExpense, updateExpense } from './api'

/**
 * รายจ่ายกระทบทั้งหน้ารายรับ-รายจ่าย ยอด "รายจ่ายวันนี้" บน Dashboard
 * และยอดหยิบออกจากลิ้นชักในหน้า Check
 */
function useExpenseMutation<TVars, TData>(fn: (vars: TVars) => Promise<TData>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportKeys.all })
      qc.invalidateQueries({ queryKey: cashCloseKeys.all })
    },
  })
}

export const useAddExpense = () => useExpenseMutation(addExpense)
export const useUpdateExpense = () => useExpenseMutation(updateExpense)
export const useDeleteExpense = () => useExpenseMutation(deleteExpense)
export const useAddDrawerExpense = () => useExpenseMutation(addDrawerExpense)
