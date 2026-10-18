import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import {
  useResolveServiceRequest,
  useServiceRequests,
} from '@/features/service-requests/hooks'
import { formatTime } from '@/lib/format'
import { useLiveStatus } from '@/lib/live'
import { ServiceRequestStatus, ServiceRequestType } from '@/types/enums'

const REQUEST_POLL_MS = 10_000

const typeLabel: Record<string, string> = {
  [ServiceRequestType.CALL_STAFF]: 'เรียกพนักงาน',
  [ServiceRequestType.CHECKOUT]: 'ขอเช็คบิล',
  [ServiceRequestType.OTHER]: 'อื่น ๆ',
}

const statusTone: Record<string, BadgeTone> = {
  [ServiceRequestStatus.PENDING]: 'amber',
  [ServiceRequestStatus.RESOLVED]: 'green',
  [ServiceRequestStatus.CANCELLED]: 'gray',
}

const statusLabel: Record<string, string> = {
  [ServiceRequestStatus.PENDING]: 'รอดำเนินการ',
  [ServiceRequestStatus.RESOLVED]: 'เสร็จแล้ว',
  [ServiceRequestStatus.CANCELLED]: 'ยกเลิก',
}

export function RequestsPage() {
  const { data: requests, isPending } = useServiceRequests({
    refetchInterval: REQUEST_POLL_MS,
  })
  const resolve = useResolveServiceRequest()
  const live = useLiveStatus((s) => s.connected)

  return (
    <div>
      <PageHeader
        title="คำขอจากโต๊ะ"
        description={
          live
            ? 'เรียกพนักงาน / ขอเช็คบิล · อัปเดตทันที'
            : `เรียกพนักงาน / ขอเช็คบิล · ออฟไลน์ รีเฟรชทุก ${REQUEST_POLL_MS / 1000} วินาที`
        }
      />

      {isPending && <p className="text-sm text-gray-500">กำลังโหลด...</p>}

      <div className="space-y-3">
        {requests?.map((req) => (
          <div
            key={req.id}
            className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
          >
            <div>
              <p className="font-semibold text-gray-900">
                โต๊ะ {req.tableName} · {typeLabel[req.type]}
              </p>
              <p className="text-xs text-gray-500">
                {formatTime(req.createdAt)}
                {req.paymentMethod && ` · ${req.paymentMethod}`}
              </p>
              {req.note && (
                <p className="mt-1 text-sm text-gray-600">{req.note}</p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <Badge tone={statusTone[req.status]}>
                {statusLabel[req.status]}
              </Badge>
              {req.status === ServiceRequestStatus.PENDING && (
                <button
                  type="button"
                  disabled={resolve.isPending}
                  onClick={() => resolve.mutate(req.id)}
                  className="min-h-10 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  ทำเสร็จแล้ว
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
