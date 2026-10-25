import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { getAuditDevices, getAuditLogs, type AuditLogFilter } from './api'

export const auditKeys = {
  all: ['audit-logs'] as const,
  list: (filter: AuditLogFilter) =>
    [
      'audit-logs',
      'list',
      filter.from.toISOString(),
      filter.to.toISOString(),
      filter.action ?? '',
      filter.deviceId ?? '',
    ] as const,
  devices: ['audit-logs', 'devices'] as const,
}

export const useAuditLogs = (filter: AuditLogFilter) =>
  useInfiniteQuery({
    queryKey: auditKeys.list(filter),
    queryFn: ({ pageParam }) => getAuditLogs(filter, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.hasMore ? last.items[last.items.length - 1]?.createdAt : undefined,
  })

export const useAuditDevices = () =>
  useQuery({ queryKey: auditKeys.devices, queryFn: getAuditDevices })
