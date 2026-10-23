import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LIVE_STALE_TIME } from '@/lib/live'
import { createTable, deleteTable, getTables, updateTable } from './api'

export const tableKeys = { all: ['tables'] as const, manage: ['tables', 'manage'] as const }

export const useTables = () =>
  useQuery({
    queryKey: tableKeys.all,
    queryFn: () => getTables(),
    staleTime: LIVE_STALE_TIME,
  })

/** หน้าจัดการโต๊ะ — รวมโต๊ะที่ปิดใช้งาน */
export const useAllTables = () =>
  useQuery({ queryKey: tableKeys.manage, queryFn: () => getTables(true) })

// แก้โต๊ะแล้วรีเฟรชทั้งรายการโต๊ะของหน้าพนักงานและหน้าจัดการ (key ขึ้นต้นด้วย 'tables' ทั้งคู่)
function useTableMutation<TVars, TData>(fn: (vars: TVars) => Promise<TData>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: tableKeys.all }),
  })
}

export const useCreateTable = () => useTableMutation(createTable)
export const useUpdateTable = () => useTableMutation(updateTable)
export const useDeleteTable = () => useTableMutation(deleteTable)
