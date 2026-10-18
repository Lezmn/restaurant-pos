import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LIVE_STALE_TIME, useLivePollInterval } from '@/lib/live'
import { closeSession, getSessions, openSession } from './api'

export const sessionKeys = {
  all: ['table-sessions'] as const,
}

/** session ที่ได้มียอดรวม (total) ที่ backend คำนวณให้แล้วติดมาด้วย */
export const useSessions = (options?: { refetchInterval?: number }) =>
  useQuery({
    queryKey: sessionKeys.all,
    queryFn: getSessions,
    refetchInterval: useLivePollInterval(options?.refetchInterval),
    staleTime: LIVE_STALE_TIME,
  })

/** เปิด/ปิดโต๊ะกระทบทั้ง session และสถานะโต๊ะ จึงล้าง cache ทั้งสองก้อนเหมือนกัน */
function useSessionMutation<TVars, TData>(fn: (vars: TVars) => Promise<TData>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sessionKeys.all })
      qc.invalidateQueries({ queryKey: ['tables'] })
    },
  })
}

export const useOpenSession = () => useSessionMutation(openSession)
export const useCloseSession = () => useSessionMutation(closeSession)
