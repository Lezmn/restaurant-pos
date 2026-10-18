import { useQuery } from '@tanstack/react-query'
import { LIVE_STALE_TIME } from '@/lib/live'
import { getTables } from './api'

export const tableKeys = { all: ['tables'] as const }

export const useTables = () =>
  useQuery({
    queryKey: tableKeys.all,
    queryFn: getTables,
    staleTime: LIVE_STALE_TIME,
  })
