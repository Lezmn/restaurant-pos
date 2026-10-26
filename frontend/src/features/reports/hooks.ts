import { useQuery } from '@tanstack/react-query'
import type { DashboardPeriodDays } from '@/types/reports'
import { getDashboard, getDashboardPeriod, getFinance, getSales } from './api'

// ขึ้นต้นด้วย 'reports' ทั้งหมด — features/live invalidate ['reports'] ตอนมีบิลใหม่/ยกเลิกบิล
export const reportKeys = {
  all: ['reports'] as const,
  dashboard: ['reports', 'dashboard'] as const,
  dashboardPeriod: (days: DashboardPeriodDays) => ['reports', 'dashboard-period', days] as const,
  finance: (month: string) => ['reports', 'finance', month] as const,
  sales: (month: string) => ['reports', 'sales', month] as const,
}

export const useDashboard = () =>
  useQuery({ queryKey: reportKeys.dashboard, queryFn: getDashboard })

/** days = null → ไม่ดึง (กำลังดูแท็บ "วันนี้") */
export const useDashboardPeriod = (days: DashboardPeriodDays | null) =>
  useQuery({
    queryKey: reportKeys.dashboardPeriod(days ?? 7),
    queryFn: () => getDashboardPeriod(days ?? 7),
    enabled: days !== null,
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
