import {
  useResolveServiceRequest,
  useServiceRequests,
} from '@/features/service-requests/hooks'
import { installAudioUnlock, playAlert } from '@/lib/alert-sound'
import { useNewArrivals } from '@/lib/use-new-arrivals'
import { ServiceRequestStatus, ServiceRequestType } from '@/types/enums'
import { useEffect } from 'react'

/**
 * แจ้งเตือน "เรียกพนักงาน" — วางไว้ที่ layout จึงขึ้นทุกหน้าของฝั่งพนักงาน
 * (เดิมอยู่แต่ในหน้า Order ทำให้ถ้าพนักงานอยู่หน้า Check/Manage จะไม่เห็นคำขอเลย)
 *
 * ถ้ามีหลายโต๊ะเรียกพร้อมกันจะโชว์ทีละใบ เรียงจากคำขอที่เก่าที่สุด (รอมานานสุดก่อน)
 */
export function CallStaffAlert() {
  const { data: requests } = useServiceRequests()
  const resolve = useResolveServiceRequest()

  const pending = (requests ?? []).filter(
    (r) =>
      r.type === ServiceRequestType.CALL_STAFF &&
      r.status === ServiceRequestStatus.PENDING,
  )

  // คำขอใหม่ → ปี๊บ 3 ครั้ง (แคชเชียร์อาจก้มนับเงินอยู่ ไม่ได้มองจอ) — ค่าเริ่มต้นเปิด (ปุ่มปิดอยู่บนจอครัว ซึ่งเครื่องแคชเชียร์เข้าไม่ได้ — ปิดที่ลำโพงเครื่องแทน)
  useEffect(installAudioUnlock, [])
  useNewArrivals(requests && pending.map((r) => r.id), () => playAlert('call'))

  const current = pending.at(-1)
  if (!current) return null

  return (
    <div
      role="alert"
      className="fixed inset-x-4 bottom-28 z-30 mx-auto max-w-2xl rounded-xl border border-gray-200 bg-white p-5 shadow-xl"
    >
      <button
        type="button"
        aria-label="รับทราบ"
        disabled={resolve.isPending}
        onClick={() => resolve.mutate(current.id)}
        className="absolute top-1 right-2 flex h-10 w-10 items-center justify-center rounded-full text-2xl leading-none text-gray-500 transition hover:bg-gray-100 hover:text-black disabled:opacity-40"
      >
        ×
      </button>

      <div className="text-center">
        <span aria-hidden className="text-2xl text-brand-300">
          ⚠
        </span>
        <p className="mt-1 text-lg font-bold text-black">มีการเรียกพนักงาน</p>
        <p className="text-sm text-gray-600">
          ลูกค้าที่โต๊ะ {current.tableName} ได้ส่งคำขอเรียกพนักงาน
          {current.note && ` — ${current.note}`}
        </p>
        {pending.length > 1 && (
          <p className="mt-1 text-xs font-semibold text-brand-500">
            มีคำขอค้างอยู่อีก {pending.length - 1} โต๊ะ
          </p>
        )}
      </div>
    </div>
  )
}
