import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { StatCard } from '@/components/ui/StatCard'
import {
  useCashClosePreview,
  useCashCloses,
  useDeleteCashClose,
} from '@/features/cash-closes/hooks'
import { currentMonth } from '@/features/reports/api'
import { formatBaht, formatTime } from '@/lib/format'
import type { ApiCashClose } from '@/types/api'
import { useState } from 'react'
import { button, fieldCompact } from '@/components/ui/styles'
import { CashCloseDialog } from './CashCloseDialog'

const thaiDate = (ymd: string) =>
  new Date(`${ymd}T00:00:00`).toLocaleDateString('th-TH', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })

/** ช่องตัวเลขบนจอแคบ: ป้าย (data-label) ซ้าย ตัวเลขขวา */
const CC_CELL =
  'max-sm:flex max-sm:justify-between max-sm:gap-3 max-sm:px-0 max-sm:py-0.5 max-sm:before:font-normal max-sm:before:text-gray-600 max-sm:before:content-[attr(data-label)]'

const differenceTone = (value: number) => {
  if (value === 0) return 'text-success-ink'
  return value > 0 ? 'text-brand-500' : 'text-danger-ink'
}

const differenceLabel = (value: number) => {
  if (value === 0) return 'ตรง'
  return `${value > 0 ? '+' : '-'}${formatBaht(Math.abs(value))}`
}

/**
 * ปิดยอดเงินสดรายวัน — ปุ่ม "ปิดยอดวันนี้" อยู่หน้านี้ (ย้ายมาจากหน้า Check) + ประวัติว่าเงินขาด/เกินวันไหน
 * ลบได้เพื่อนับใหม่ (เช่น กรอกยอดผิด หรือยกเลิกบิลหลังปิดยอด)
 */
export function CashClosesPage() {
  const [month, setMonth] = useState(currentMonth)
  const { data, isPending, isError, error } = useCashCloses(month)
  const deleteCashClose = useDeleteCashClose()
  const [deleting, setDeleting] = useState<ApiCashClose | null>(null)
  const today = useCashClosePreview()
  const [closingToday, setClosingToday] = useState(false)
  const closedToday = today.data?.alreadyClosed

  const closes = data ?? []
  const totalDifference = closes.reduce((sum, c) => sum + c.difference, 0)
  const shortDays = closes.filter((c) => c.difference < 0).length

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-black">ปิดยอดเงินสด</h1>
        <div className="flex flex-wrap items-center gap-3">
        {closedToday ? (
          <span className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700">
            ปิดยอดวันนี้แล้ว {formatTime(closedToday.closedAt)}
          </span>
        ) : (
          <button
            type="button"
            disabled={!today.data}
            onClick={() => {
              // จำนวนโต๊ะค้างจ่ายไม่ได้อัปเดตแบบ live — ดึงใหม่ก่อนเปิดให้เตือนตรง
              today.refetch()
              setClosingToday(true)
            }}
            className={button('primary')}
          >
            ปิดยอดวันนี้
          </button>
        )}
        <label className="text-sm">
          <span className="sr-only">เดือน</span>
          <input
            type="month"
            value={month}
            max={currentMonth()}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className={fieldCompact}
          />
        </label>
        </div>
      </div>

      {closingToday && today.data && (
        <CashCloseDialog preview={today.data} onClose={() => setClosingToday(false)} />
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="วันที่ปิดยอด" value={`${closes.length} วัน`} tone="brand" />
        {/* ยังไม่ปิดยอดสักวัน = ยังไม่รู้ว่าเงินตรงไหม — ห้ามขึ้น "ตรง" สีเขียวให้เข้าใจผิด */}
        {closes.length === 0 ? (
          <>
            <StatCard label="วันที่เงินขาด" value="-" hint="ยังไม่ได้ปิดยอดในเดือนนี้" tone="neutral" />
            <StatCard label="ผลต่างรวมทั้งเดือน" value="-" hint="ยังไม่ได้ปิดยอดในเดือนนี้" tone="neutral" />
          </>
        ) : (
          <>
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
          </>
        )}
      </div>

      {isError && (
        <p className="text-sm text-danger-ink">
          {error instanceof Error ? error.message : 'โหลดข้อมูลไม่สำเร็จ'}
        </p>
      )}

      <section className="rounded-xl border border-gray-200 p-4">
        {/* จอแคบ: แต่ละวันเป็นการ์ด ป้ายจาก data-label — เดิมตาราง 10 คอลัมน์เลื่อนข้าง
            และข้อความ "ยังไม่มีการปิดยอด" จัดกลางตาราง 820px เลยหลุดจอมองไม่เห็น */}
        <div className="sm:overflow-x-auto">
          <table className="w-full border-collapse text-right text-sm max-sm:block sm:min-w-[820px]">
            <thead className="max-sm:sr-only">
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
            <tbody className="divide-y divide-gray-200 max-sm:block">
              {isPending && (
                <tr className="max-sm:block">
                  <td colSpan={10} className="py-8 text-center text-gray-500 max-sm:block">
                    กำลังโหลด...
                  </td>
                </tr>
              )}
              {!isPending && closes.length === 0 && (
                <tr className="max-sm:block">
                  <td colSpan={10} className="py-10 text-center text-gray-500 max-sm:block">
                    ยังไม่มีการปิดยอดในเดือนนี้
                  </td>
                </tr>
              )}

              {closes.map((c) => (
                <tr key={c.id} className="max-sm:block max-sm:py-3">
                  <td className="whitespace-nowrap px-3 py-3 text-left text-gray-800 max-sm:block max-sm:px-0 max-sm:pt-0 max-sm:pb-1 max-sm:text-base max-sm:font-bold max-sm:text-black">
                    {thaiDate(c.date)}
                  </td>
                  <td data-label="เงินทอนตั้งต้น" className={`px-3 py-3 ${CC_CELL}`}>{formatBaht(c.openingFloat)}</td>
                  {/* ข้อมูลอ่านอย่างเดียว ไม่ใช่สีส้ม — ส้มบนขาวได้แค่ 2.3:1 และส้มหมายถึงกดได้ */}
                  <td data-label="รับเงินสด" className={`px-3 py-3 text-gray-900 ${CC_CELL}`}>{formatBaht(c.cashSales)}</td>
                  <td data-label="หยิบออก" className={`px-3 py-3 text-danger-ink ${CC_CELL}`}>
                    {c.drawerExpenses > 0 ? `-${formatBaht(c.drawerExpenses)}` : '-'}
                  </td>
                  <td data-label="ควรมี" className={`px-3 py-3 ${CC_CELL}`}>{formatBaht(c.expectedCash)}</td>
                  <td data-label="นับได้" className={`px-3 py-3 font-semibold ${CC_CELL}`}>{formatBaht(c.countedCash)}</td>
                  <td data-label="ผลต่าง" className={`whitespace-nowrap px-3 py-3 font-bold ${differenceTone(c.difference)} ${CC_CELL}`}>
                    {differenceLabel(c.difference)}
                  </td>
                  <td data-label="PromptPay" className={`px-3 py-3 text-promptpay ${CC_CELL}`}>{formatBaht(c.promptpaySales)}</td>
                  <td className="px-3 py-3 text-left text-gray-700 max-sm:block max-sm:px-0 max-sm:pt-1.5 max-sm:pb-0">
                    {c.closedByName}{' '}
                    <span className="text-xs text-gray-500">{formatTime(c.closedAt)}</span>
                    {c.note && <span className="block text-xs text-gray-500">{c.note}</span>}
                  </td>
                  <td className="px-3 py-3 text-center max-sm:block max-sm:p-0 max-sm:text-right">
                    <button
                      type="button"
                      onClick={() => setDeleting(c)}
                      title="ลบการปิดยอดนี้ เพื่อให้นับใหม่"
                      className="min-h-11 rounded-lg px-3 font-semibold text-danger-ink underline-offset-4 transition hover:bg-danger/5 hover:underline"
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
          consequence="ถ้าลบการปิดยอดของวันนี้ จะกดปิดยอดวันนี้ใหม่ได้ที่หน้านี้ ส่วนวันก่อนหน้าจะไม่มีบันทึกการนับเงิน"
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
