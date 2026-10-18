import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { StatCard } from '@/components/ui/StatCard'
import {
  useCashCloses,
  useDeleteCashClose,
} from '@/features/cash-closes/hooks'
import { currentMonth } from '@/features/reports/api'
import { formatBaht, formatTime } from '@/lib/format'
import type { ApiCashClose } from '@/types/api'
import { useState } from 'react'

const thaiDate = (ymd: string) =>
  new Date(`${ymd}T00:00:00`).toLocaleDateString('th-TH', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })

const differenceTone = (value: number) => {
  if (value === 0) return 'text-success'
  return value > 0 ? 'text-brand-400' : 'text-danger'
}

const differenceLabel = (value: number) => {
  if (value === 0) return 'ตรง'
  return `${value > 0 ? '+' : '-'}${formatBaht(Math.abs(value))}`
}

/**
 * ประวัติการปิดยอดเงินสดรายวัน — เจ้าของดูว่าเงินขาด/เกินวันไหน
 * ลบได้เพื่อให้แคชเชียร์นับใหม่ (เช่น กรอกยอดผิด หรือยกเลิกบิลหลังปิดยอด)
 */
export function CashClosesPage() {
  const [month, setMonth] = useState(currentMonth)
  const { data, isPending, isError, error } = useCashCloses(month)
  const deleteCashClose = useDeleteCashClose()
  const [deleting, setDeleting] = useState<ApiCashClose | null>(null)

  const closes = data ?? []
  const totalDifference = closes.reduce((sum, c) => sum + c.difference, 0)
  const shortDays = closes.filter((c) => c.difference < 0).length

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-black">ปิดยอดเงินสด</h1>
        <label className="text-sm">
          <span className="sr-only">เดือน</span>
          <input
            type="month"
            value={month}
            max={currentMonth()}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-800 outline-none focus:border-brand-300"
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="วันที่ปิดยอด" value={`${closes.length} วัน`} tone="brand" />
        <StatCard
          label="วันที่เงินขาด"
          value={`${shortDays} วัน`}
          tone={shortDays > 0 ? 'red' : 'green'}
        />
        <StatCard
          label="ผลต่างรวมทั้งเดือน"
          value={differenceLabel(Math.round(totalDifference * 100) / 100)}
          tone={totalDifference < 0 ? 'red' : 'green'}
        />
      </div>

      {isError && (
        <p className="text-sm text-danger">
          {error instanceof Error ? error.message : 'โหลดข้อมูลไม่สำเร็จ'}
        </p>
      )}

      <section className="rounded-xl border border-gray-200 p-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-right text-sm">
            <thead>
              <tr className="bg-gray-100 text-gray-700">
                <th className="px-3 py-3 text-left font-semibold">วันที่</th>
                <th className="px-3 py-3 font-semibold">เงินทอนตั้งต้น</th>
                <th className="px-3 py-3 font-semibold">รับเงินสด</th>
                <th className="px-3 py-3 font-semibold">หยิบออก</th>
                <th className="px-3 py-3 font-semibold">ควรมี</th>
                <th className="px-3 py-3 font-semibold">นับได้</th>
                <th className="px-3 py-3 font-semibold">ผลต่าง</th>
                <th className="px-3 py-3 font-semibold">PromptPay</th>
                <th className="px-3 py-3 text-left font-semibold">ผู้ปิด / หมายเหตุ</th>
                <th className="px-3 py-3 text-center font-semibold">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isPending && (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-gray-400">
                    กำลังโหลด...
                  </td>
                </tr>
              )}
              {!isPending && closes.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-gray-400">
                    ยังไม่มีการปิดยอดในเดือนนี้
                  </td>
                </tr>
              )}

              {closes.map((c) => (
                <tr key={c.id}>
                  <td className="whitespace-nowrap px-3 py-3 text-left text-gray-800">
                    {thaiDate(c.date)}
                  </td>
                  <td className="px-3 py-3">{formatBaht(c.openingFloat)}</td>
                  <td className="px-3 py-3 text-brand-300">{formatBaht(c.cashSales)}</td>
                  <td className="px-3 py-3 text-danger">
                    {c.drawerExpenses > 0 ? `-${formatBaht(c.drawerExpenses)}` : '-'}
                  </td>
                  <td className="px-3 py-3">{formatBaht(c.expectedCash)}</td>
                  <td className="px-3 py-3 font-semibold">{formatBaht(c.countedCash)}</td>
                  <td className={`whitespace-nowrap px-3 py-3 font-bold ${differenceTone(c.difference)}`}>
                    {differenceLabel(c.difference)}
                  </td>
                  <td className="px-3 py-3 text-promptpay">{formatBaht(c.promptpaySales)}</td>
                  <td className="px-3 py-3 text-left text-gray-700">
                    {c.closedByName}{' '}
                    <span className="text-xs text-gray-400">{formatTime(c.closedAt)}</span>
                    {c.note && <span className="block text-xs text-gray-500">{c.note}</span>}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => setDeleting(c)}
                      title="ลบการปิดยอดนี้ เพื่อให้นับใหม่"
                      className="min-h-10 rounded-lg px-3 font-semibold text-danger underline-offset-4 transition hover:bg-danger/5 hover:underline"
                    >
                      ลบ
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {deleting && (
        <ConfirmDialog
          title="ลบการปิดยอด"
          subject={`ปิดยอดวันที่ ${thaiDate(deleting.date)}`}
          detail={`นับได้ ${formatBaht(deleting.countedCash)} · ${differenceLabel(deleting.difference)} · โดย ${deleting.closedByName}`}
          consequence="ถ้าลบการปิดยอดของวันนี้ แคชเชียร์จะกดปิดยอดวันนี้ใหม่ได้ที่หน้า Check ส่วนวันก่อนหน้าจะไม่มีบันทึกการนับเงิน"
          confirmLabel="ลบ"
          pendingLabel="กำลังลบ..."
          isPending={deleteCashClose.isPending}
          error={deleteCashClose.error}
          onCancel={() => {
            deleteCashClose.reset()
            setDeleting(null)
          }}
          onConfirm={() =>
            deleteCashClose.mutate(deleting.id, {
              onSuccess: () => setDeleting(null),
            })
          }
        />
      )}
    </div>
  )
}
