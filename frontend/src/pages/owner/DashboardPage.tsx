import { Pagination } from '@/components/ui/Pagination'
import { StatCard } from '@/components/ui/StatCard'
import { TrendChart } from '@/components/ui/TrendChart'
import { useDashboard } from '@/features/reports/hooks'
import { formatBaht } from '@/lib/format'
import { usePagination } from '@/lib/use-pagination'
import { PaymentMethod } from '@/types/enums'
import { Link } from 'react-router-dom'

const methodLabel: Record<PaymentMethod, string> = {
  [PaymentMethod.CASH]: 'จ่ายเงินสด',
  [PaymentMethod.PROMPTPAY]: 'จ่าย PromptPay',
}

const methodIcon: Record<PaymentMethod, string> = {
  [PaymentMethod.CASH]: '💰',
  [PaymentMethod.PROMPTPAY]: '📱',
}

const thaiDate = (iso: string) =>
  new Date(iso).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

const minutesSince = (iso: string) =>
  Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))

export function DashboardPage() {
  const { data, isPending, isError, error } = useDashboard()
  // ต้องเรียก hook ก่อน early return เสมอ (กฎของ hooks) จึงอ่านจาก data?. ตรงนี้
  const pagedNotifications = usePagination(data?.notifications ?? [])

  if (isPending) {
    return <p className="text-sm text-gray-500">กำลังโหลด...</p>
  }
  if (isError || !data) {
    return (
      <p className="text-sm text-danger">
        {error instanceof Error ? error.message : 'โหลดข้อมูลไม่สำเร็จ'}
      </p>
    )
  }

  const { summary, trend, todayStatus, notifications, slipIssues } = data
  const slipIssueCount = slipIssues.pending + slipIssues.failed

  return (
    <div className="space-y-5">
      {/* สลิป PromptPay ที่ยังยืนยันเงินเข้าไม่ได้ — ค้างจนกว่าจะจัดการ ไม่ใช่แค่ของวันนี้ */}
      {slipIssueCount > 0 && (
        <Link
          to="/employee/check"
          className="flex min-h-12 items-center justify-between gap-3 rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm transition hover:bg-amber-100"
        >
          <span className="font-semibold text-amber-900">
            ⚠️ สลิป PromptPay ที่ต้องตาม: รอตรวจ {slipIssues.pending} · ไม่ผ่าน {slipIssues.failed}
          </span>
          <span className="shrink-0 font-bold text-brand-400">ไปหน้า Check →</span>
        </Link>
      )}

      <div className="flex justify-end">
        <p className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800">
          📅 {thaiDate(summary.date)}
        </p>
      </div>

      {/* สรุปวันนี้ */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="รายรับวันนี้"
          value={formatBaht(summary.revenue)}
          tone="brand"
        />
        <StatCard
          label="จ่ายเงินสด"
          value={formatBaht(summary.cashTotal)}
          tone="orange"
        />
        <StatCard
          label="จ่าย PromptPay"
          value={formatBaht(summary.promptPayTotal)}
          tone="purple"
        />
        <StatCard
          label="จำนวนออเดอร์"
          value={summary.orderCount.toLocaleString('th-TH')}
          tone="olive"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* กราฟแนวโน้ม */}
        <section className="rounded-xl border border-gray-200 p-4 lg:col-span-2">
          <h2 className="mb-3 text-lg font-bold text-black">
            แนวโน้มรายรับ 7 วันที่ผ่านมา
          </h2>
          <TrendChart points={trend} />
        </section>

        {/* สถานะวันนี้ */}
        <section className="rounded-xl border border-gray-200 p-4">
          <h2 className="mb-3 text-lg font-bold text-black">สถานะวันนี้</h2>
          <dl className="divide-y divide-gray-200">
            <StatusRow
              label="จ่ายเงินสด"
              value={`${todayStatus.cashCount} บิล`}
            />
            <StatusRow
              label="จ่าย PromptPay"
              value={`${todayStatus.promptPayCount} บิล`}
            />
            <StatusRow
              label="โต๊ะที่ใช้งานอยู่"
              value={`${todayStatus.tablesInUse}/${todayStatus.tablesTotal}`}
            />
            {/* จำนวนที่พนักงานกดระบุตอนเปิดโต๊ะ — โต๊ะที่ไม่ได้ระบุบอกแยก ไม่เดาแทน */}
            <StatusRow
              label="ลูกค้าเข้าใช้บริการ"
              value={
                todayStatus.tablesWithoutGuestCount > 0
                  ? `${todayStatus.guests.toLocaleString('th-TH')} คน (+${todayStatus.tablesWithoutGuestCount} โต๊ะไม่ระบุ)`
                  : `${todayStatus.guests.toLocaleString('th-TH')} คน`
              }
            />
            <StatusRow
              label="รายจ่ายวันนี้"
              value={formatBaht(summary.expenseTotal)}
            />
          </dl>
        </section>
      </div>

      {/* การแจ้งเตือน */}
      <section className="rounded-xl border border-gray-200 p-4">
        <h2 className="mb-3 text-lg font-bold text-black">การแจ้งเตือน</h2>

        {notifications.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">
            วันนี้ยังไม่มีบิลที่รับเงิน
          </p>
        ) : (
          <ul className="divide-y divide-gray-200">
            {pagedNotifications.pageItems.map((note) => (
              <li key={note.id} className="flex items-center gap-3 py-3">
                <span aria-hidden className="text-xl">
                  {methodIcon[note.method]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-black">
                    โต๊ะ {note.tableName} {methodLabel[note.method]}
                  </p>
                  <p className="text-xs text-gray-500">
                    {minutesSince(note.createdAt)} นาทีที่แล้ว
                  </p>
                </div>
                <p className="shrink-0 text-sm font-bold text-brand-400">
                  {formatBaht(note.amount)}
                </p>
              </li>
            ))}
          </ul>
        )}

        <Pagination
          page={pagedNotifications.page}
          totalPages={pagedNotifications.totalPages}
          from={pagedNotifications.from}
          to={pagedNotifications.to}
          total={pagedNotifications.total}
          onChange={pagedNotifications.setPage}
          unit="บิล"
        />
      </section>
    </div>
  )
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-3">
      <dt className="text-sm text-gray-700">{label}</dt>
      <dd className="text-sm font-bold text-black">{value}</dd>
    </div>
  )
}
