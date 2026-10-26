import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getLineSettings, saveLineSettings, testLineSettings } from './api'

const lineSettingsKey = ['settings', 'line'] as const

export const useLineSettings = () =>
  useQuery({ queryKey: lineSettingsKey, queryFn: getLineSettings })

export function useSaveLineSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: saveLineSettings,
    onSuccess: (data) => qc.setQueryData(lineSettingsKey, data),
  })
}

export const useTestLineSettings = () => useMutation({ mutationFn: testLineSettings })
