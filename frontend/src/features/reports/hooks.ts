import { useQuery } from '@tanstack/react-query'
import type { DateRange } from '@/types/reports'
import { getDashboard, getDashboardPeriod, getFinance, getSales, getTopItems } from './api'

// ขึ้นต้นด้วย 'reports' ทั้งหมด — features/live invalidate ['reports'] ตอนมีบิลใหม่/ยกเลิกบิล
export const reportKeys = {
  all: ['reports'] as const,
  dashboard: ['reports', 'dashboard'] as const,
  dashboardPeriod: (range: DateRange) => ['reports', 'dashboard-period', range.from, range.to] as const,
  finance: (month: string) => ['reports', 'finance', month] as const,
  sales: (month: string) => ['reports', 'sales', month] as const,
  topItems: (range: DateRange) => ['reports', 'top-items', range.from, range.to] as const,
}

export const useTopItems = (range: DateRange) =>
  useQuery({
    queryKey: reportKeys.topItems(range),
    queryFn: () => getTopItems(range),
  })

export const useDashboard = () =>
  useQuery({ queryKey: reportKeys.dashboard, queryFn: getDashboard })

/** range = null → ไม่ดึง (กำลังดูแท็บ "วันนี้") */
export const useDashboardPeriod = (range: DateRange | null) =>
  useQuery({
    queryKey: reportKeys.dashboardPeriod(range ?? { from: '', to: '' }),
    queryFn: () => getDashboardPeriod(range!),
    enabled: range !== null,
  })

export const useFinance = (month: string) =>
  useQuery({
    queryKey: reportKeys.finance(month),
    queryFn: () => getFinance(month),
  })

export const useSales = (month: string) =>
  useQuery({
    queryKey: reportKeys.sales(month),
    queryFn: () => getSales(month),
  })
