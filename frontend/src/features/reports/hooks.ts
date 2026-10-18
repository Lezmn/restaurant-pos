import { useQuery } from '@tanstack/react-query'
import { getDashboard, getFinance } from './api'

// ขึ้นต้นด้วย 'reports' ทั้งหมด — features/live invalidate ['reports'] ตอนมีบิลใหม่/ยกเลิกบิล
export const reportKeys = {
  all: ['reports'] as const,
  dashboard: ['reports', 'dashboard'] as const,
  finance: (month: string) => ['reports', 'finance', month] as const,
}

export const useDashboard = () =>
  useQuery({ queryKey: reportKeys.dashboard, queryFn: getDashboard })

export const useFinance = (month: string) =>
  useQuery({
    queryKey: reportKeys.finance(month),
    queryFn: () => getFinance(month),
  })
