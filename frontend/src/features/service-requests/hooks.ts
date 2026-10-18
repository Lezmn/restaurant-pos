import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LIVE_POLL_MS, LIVE_STALE_TIME, useLivePollInterval } from '@/lib/live'
import { getServiceRequests, resolveServiceRequest } from './api'

export const serviceRequestKeys = { all: ['service-requests'] as const }

/**
 * คำขอของลูกค้าต้องขึ้นให้เร็วที่สุด — socket push มาทันที
 * ถ้า socket หลุดค่อย poll ถี่สำรอง และไม่ถือ cache เป็นของสด
 */
export const useServiceRequests = (options?: { refetchInterval?: number }) =>
  useQuery({
    queryKey: serviceRequestKeys.all,
    queryFn: getServiceRequests,
    refetchInterval: useLivePollInterval(options?.refetchInterval ?? LIVE_POLL_MS),
    staleTime: LIVE_STALE_TIME,
  })

export function useResolveServiceRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: resolveServiceRequest,
    onSuccess: () => qc.invalidateQueries({ queryKey: serviceRequestKeys.all }),
  })
}
