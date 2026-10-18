import { apiClient } from '@/lib/api-client'
import { mapServiceRequest } from '@/lib/map'
import type { ApiServiceRequest } from '@/types/api'
import type { Id, ServiceRequest } from '@/types/models'

/** GET /service-requests @Roles(ADMIN, STAFF) */
export async function getServiceRequests(): Promise<ServiceRequest[]> {
  const data = await apiClient<ApiServiceRequest[]>('/service-requests')
  return data
    .map(mapServiceRequest)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** PATCH /service-requests/:id/resolve */
export async function resolveServiceRequest(id: Id): Promise<void> {
  await apiClient<unknown>(`/service-requests/${id}/resolve`, {
    method: 'PATCH',
  })
}
