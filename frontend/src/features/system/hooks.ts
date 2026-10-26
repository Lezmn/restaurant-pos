import { useQuery } from '@tanstack/react-query'
import { getSystemStatus } from './api'

/** เปิดหน้าค้างไว้ก็อัปเดตเองทุกนาที */
const REFRESH_MS = 60_000

export const useSystemStatus = () =>
  useQuery({
    queryKey: ['system', 'status'],
    queryFn: getSystemStatus,
    refetchInterval: REFRESH_MS,
  })
