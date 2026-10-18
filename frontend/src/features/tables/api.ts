import { apiClient } from '@/lib/api-client'
import { mapTable } from '@/lib/map'
import type { ApiTable } from '@/types/api'
import type { RestaurantTable } from '@/types/models'

export async function getTables(): Promise<RestaurantTable[]> {
  const data = await apiClient<ApiTable[]>('/tables')
  return data.map(mapTable)
}
