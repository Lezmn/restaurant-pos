import { LoadError } from '@/components/ui/LoadError'
import { PageLoading } from '@/components/ui/PageLoading'
import { HourlyChart } from '@/components/ui/HourlyChart'
import { Pagination } from '@/components/ui/Pagination'
import { StatCard } from '@/components/ui/StatCard'
import { TrendChart } from '@/components/ui/TrendChart'
import { daysInRange, lastDays, todayYmd } from '@/features/reports/api'
import { useDashboard, useDashboardPeriod } from '@/features/reports/hooks'
import { formatBaht, formatTime } from '@/lib/format'
import { usePagination } from '@/lib/use-pagination'
import { PaymentMethod } from '@/types/enums'
import type { DateRange, PeriodData } from '@/types/reports'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

const methodLabel: Record<PaymentMethod, string> = {
  [PaymentMethod.CASH]: 'เงินสด',
  [PaymentMethod.PROMPTPAY]: 'PromptPay',
}

const thaiDate = (iso: string) =>
  new Date(iso).toLocaleDateString('th-TH', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

/** "เมื่อสักครู่" / "12 นาทีที่แล้ว" — เกินชั่วโมงไม่บอก เพราะเวลานาฬิกาบอกอยู่แล้ว */
const relativeHint = (iso: string, now: number) => {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'เมื่อสักครู่'
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`
  return null
}

/** เวลาปัจจุบันที่เดินทุก 30 วิ — ให้ "N นาทีที่แล้ว" ไม่ค้างอยู่ค่าตอนโหลด */
function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

type Preset = 'today' | 7 | 30 | 'custom'

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'today', label: 'วันนี้' },
  { value: 7, label: '7 วัน' },
  { value: 30, label: '30 วัน' },
  { value: 'custom', label: 'เลือกวันที่' },
]

/** ช่วงยาวสุดที่ให้เลือก — กราฟรายวันเกินนี้อ่านไม่ออก */
const MAX_DAYS = 366

const isYmd = (v: string | null): v is string => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v))

const shiftYmd = (ymd: string, days: number) => {
  const [y, m, d] = ymd.split('-').map(Number)
  const date = new Date(y, m - 1, d + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** ช่วงที่เลือกเอง: ไม่เกินวันนี้, from ไม่เกิน to, ยาวไม่เกิน MAX_DAYS */
function normalizeRange(from: string, to: string): DateRange {
  const today = todayYmd()
  let f = from > today ? today : from
  let t = to > today ? today : to
  if (f > t) [f, t] = [t, f]
  if (daysInRange({ from: f, to: t }) > MAX_DAYS) f = shiftYmd(t, -(MAX_DAYS - 1))
  return { from: f, to: t }
}

/**
 * อ่านช่วงจาก URL — เก็บใน URL ให้กดย้อนกลับ/รีเฟรชแล้วยังอยู่ช่วงเดิม
 * ?range=7 / ?range=30 = N วันล่าสุด · ?from=YYYY-MM-DD&to=YYYY-MM-DD = เลือกเอง (ไม่มี to = วันเดียว)
 */
function readRange(params: URLSearchParams): { preset: Preset; range: DateRange | null } {
  const r = params.get('range')
  if (r === '7' || r === '30') return { preset: Number(r) as 7 | 30, range: lastDays(Number(r)) }
  const from = params.get('from')
  if (isYmd(from)) {
    const to = params.get('to')
    return { preset: 'custom', range: normalizeRange(from, isYmd(to) ? to : from) }
  }
  return { preset: 'today', range: null }
}

const shortDate = (ymd: string, withYear = false) =>
  new Date(`${ymd}T00:00:00`).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  })

export function DashboardPage() {
  const [params, setParams] = useSearchParams()
  const { preset, range } = readRange(params)

  const { data, isPending, isError, error, refetch } = useDashboard()
  const periodQuery = useDashboardPeriod(range)
  // ต้องเรียก hook ก่อน early return เสมอ (กฎของ hooks) จึงอ่านจาก data?. ตรงนี้
  const pagedNotifications = usePagination(data?.notifications ?? [])
  const now = useNow()

  const setCustom = (next: DateRange) => {
    const { from, to } = normalizeRange(next.from, next.to)
    setParams(from === to ? { from } : { from, to }, { replace: true })
  }
  const selectPreset = (next: Preset) => {
    if (next === 'today') setParams({}, { replace: true })
    // เลือกวันที่ครั้งแรก = เมื่อวาน (มักใช้ดูย้อนหลังวันเดียว) แก้ช่วงต่อได้ที่ช่องวันที่
    else if (next === 'custom') setCustom({ from: shiftYmd(todayYmd(), -1), to: shiftYmd(todayYmd(), -1) })
    else setParams({ range: String(next) }, { replace: true })
  }

  const periodData = periodQuery.data
  const days = range ? daysInRange(range) : 1
  /** ป้ายสั้นต่อท้ายการ์ด ("รายรับ 7 วัน" / "รายรับวันนั้น") */
  const periodLabel = days === 1 ? 'วันนั้น' : `${days} วัน`
  let title = 'สรุปวันนี้'
  let description: string | undefined
  if (preset === 7 || preset === 30) {
    title = `สรุป ${preset} วันล่าสุด`
    if (range) description = `${shortDate(range.from)} – ${shortDate(range.to, true)} (รวมวันนี้)`
  } else if (preset === 'custom' && range) {
    title =
      days === 1 ? `สรุปวันที่ ${shortDate(range.from, true)}` : `สรุป ${shortDate(range.from)} – ${shortDate(range.to, true)}`
    description = days === 1 ? thaiDate(`${range.from}T00:00:00`) : `${days} วัน`
  } else if (data) {
    description = thaiDate(data.summary.date)
  }

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-gray-600">{description}</p>}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {/* เลือกเอง: อยู่ข้างปุ่มช่วงเวลา · วันเดียว = ใส่วันเดียวกันทั้งสองช่อง */}
        {preset === 'custom' && range && (
          <div className="flex items-center gap-2 text-sm" title={`ย้อนหลังได้สูงสุด ${MAX_DAYS} วันต่อครั้ง`}>
            <label className="sr-only" htmlFor="range-from">
              ตั้งแต่
            </label>
            <input
              id="range-from"
              type="date"
              value={range.from}
              max={todayYmd()}
              onChange={(e) =>
                e.target.value && setCustom({ from: e.target.value, to: range.to < e.target.value ? e.target.value : range.to })
              }
              className="min-h-11 rounded-lg border border-gray-300 px-3 text-sm font-semibold text-gray-800 outline-none focus:border-brand-300"
            />
            <span aria-hidden className="font-semibold text-gray-500">
              ถึง
            </span>
            <label className="sr-only" htmlFor="range-to">
              ถึง
            </label>
            <input
              id="range-to"
              type="date"
              value={range.to}
              min={range.from}
              max={todayYmd()}
              onChange={(e) => e.target.value && setCustom({ from: range.from, to: e.target.value })}
              className="min-h-11 rounded-lg border border-gray-300 px-3 text-sm font-semibold text-gray-800 outline-none focus:border-brand-300"
            />
          </div>
        )}
        <fieldset className="inline-flex flex-wrap rounded-lg bg-gray-100 p-1">
          <legend className="sr-only">ช่วงเวลาที่ดู</legend>
          {PRESETS.map((r) => (
            <button
              key={r.value}
              type="button"
              aria-pressed={preset === r.value}
              onClick={() => selectPreset(r.value)}
              className={`min-h-11 rounded-md px-4 text-sm font-bold transition sm:px-5 ${
                preset === r.value ? 'bg-brand-500 text-white' : 'text-gray-700 hover:bg-white'
              }`}
            >
              {r.label}
            </button>
          ))}
        </fieldset>
      </div>
    </div>
  )

  if (isPending) return <PageLoading />
  if (!data) {
    return (
      <div className="space-y-5">
        {header}
        <LoadError what="สรุปยอด" error={error} onRetry={() => void refetch()} />
      </div>
    )
  }

  const { summary, trend, todayStatus, notifications, slipIssues } = data
  // trend ของ backend จบที่วันนี้ — จุดก่อนสุดท้ายคือเมื่อวาน
  const yesterday = trend.length >= 2 ? trend[trend.length - 2] : undefined
  const slipIssueCount = slipIssues.pending + slipIssues.failed
  const netNegative = summary.netProfit < 0

  return (
    <div className="space-y-5">
      {header}

      {/* มีข้อมูลรอบก่อนอยู่แต่ดึงรอบใหม่ไม่ได้ — บอกว่าตัวเลขอาจไม่ใช่ล่าสุด */}
      {isError && (
        <LoadError what="สรุปยอดล่าสุด" stale error={error} onRetry={() => void refetch()} />
      )}

      {/* สลิป PromptPay ที่ยังยืนยันเงินเข้าไม่ได้ — ค้างจนกว่าจะจัดการ ไม่ใช่แค่ของวันนี้ */}
      {slipIssueCount > 0 && (
        <Link
          to="/employee/check"
          className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm transition hover:bg-amber-100"
        >
          <span className="flex items-center gap-2 font-semibold text-amber-900">
            <IconAlert />
            <span>
              สลิป PromptPay ที่ยังยืนยันเงินเข้าไม่ได้:{' '}
              <span className="tabular-nums">
                รอตรวจ {slipIssues.pending} · ไม่ผ่าน {slipIssues.failed}
              </span>
            </span>
          </span>
          <span className="shrink-0 font-bold text-brand-500">ไปตรวจที่หน้า Check →</span>
        </Link>
      )}

      {range ? (
        <PeriodView
          label={periodLabel}
          data={periodData}
          isPending={periodQuery.isPending}
          isError={periodQuery.isError}
          error={periodQuery.error}
          onRetry={() => void periodQuery.refetch()}
        />
      ) : (
        <>
          {/* สรุปวันนี้ — รายรับเป็นตัวหลัก เงินสด/PromptPay บอกทั้งยอดและจำนวนบิลในใบเดียว */}
          {/* มือถือ: รายรับ/กำไรเต็มแถว เงินสดกับ PromptPay คู่กัน — การ์ด 4 ใบไม่กินจอแรกจนหมด */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatCard
              label="รายรับวันนี้"
              value={formatBaht(summary.revenue)}
              hint={`${summary.paymentCount.toLocaleString('th-TH')} บิล${
                yesterday ? ` · เมื่อวาน ${formatBaht(yesterday.revenue)}` : ''
              }`}
              tone="brand"
              size="lg"
              className="col-span-2 xl:col-span-1"
            />
            <StatCard
              label="เงินสด"
              value={formatBaht(summary.cashTotal)}
              hint={`${todayStatus.cashCount.toLocaleString('th-TH')} บิล`}
              tone="orange"
            />
            <StatCard
              label="PromptPay"
              value={formatBaht(summary.promptPayTotal)}
              hint={`${todayStatus.promptPayCount.toLocaleString('th-TH')} บิล`}
              tone="promptpay"
            />
            <StatCard
              label={netNegative ? 'ขาดทุนวันนี้' : 'กำไรสุทธิวันนี้'}
              value={formatBaht(summary.netProfit)}
              hint={`รายจ่าย ${formatBaht(summary.expenseTotal)}`}
              tone={netNegative ? 'red' : 'green'}
              className="col-span-2 xl:col-span-1"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <section className="rounded-xl border border-gray-200 p-4 lg:col-span-2">
              {/* 7 วันอยู่ในแท็บ "7 วัน" แล้ว — วันนี้ดูรายชั่วโมงแทน ว่าช่วงไหนขายดี/ตอนนี้เป็นยังไง */}
              <h2 className="mb-3 text-lg font-bold text-black">รายรับรายชั่วโมงวันนี้</h2>
              <HourlyChart payments={notifications.map((n) => ({ amount: n.amount, paidAt: n.createdAt }))} now={now} />
            </section>

            <section className="flex flex-col rounded-xl border border-gray-200 p-4">
              <h2 className="mb-1 text-lg font-bold text-black">ในร้านตอนนี้</h2>
              <dl className="divide-y divide-gray-200">
                <StatusRow
                  label="โต๊ะที่ใช้งานอยู่"
                  value={`${todayStatus.tablesInUse} จาก ${todayStatus.tablesTotal} โต๊ะ`}
                />
                <StatusRow
                  label="ออเดอร์วันนี้"
                  value={`${summary.orderCount.toLocaleString('th-TH')} ออเดอร์`}
                />
                <StatusRow
                  label="รายจ่ายวันนี้"
                  value={formatBaht(summary.expenseTotal)}
                />
              </dl>
              <Link
                to="/owner/cash-closes"
                className="mt-auto inline-flex min-h-11 items-center pt-3 text-sm font-bold text-brand-500 hover:underline"
              >
                ปิดยอดเงินสดของวัน →
              </Link>
            </section>
          </div>

          <section className="rounded-xl border border-gray-200 p-4">
            <h2 className="mb-1 text-lg font-bold text-black">บิลที่รับเงินวันนี้</h2>

            {notifications.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-600">
                วันนี้ยังไม่มีบิลที่รับเงิน — บิลจะขึ้นที่นี่ทันทีที่หน้าร้านรับเงิน
              </p>
            ) : (
              <ul className="divide-y divide-gray-200">
                {pagedNotifications.pageItems.map((note) => {
                  const hint = relativeHint(note.createdAt, now)
                  return (
                    <li key={note.id} className="flex items-center gap-3 py-3">
                      <span
                        aria-hidden
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                          note.method === PaymentMethod.PROMPTPAY
                            ? 'bg-promptpay/10 text-promptpay'
                            : 'bg-brand-50 text-brand-500'
                        }`}
                      >
                        {note.method === PaymentMethod.PROMPTPAY ? <IconPhone /> : <IconCash />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-black">
                          โต๊ะ {note.tableName}
                        </p>
                        <p className="text-xs text-gray-600">
                          {methodLabel[note.method]} ·{' '}
                          <span className="tabular-nums">{formatTime(note.createdAt)}</span>
                          {hint && ` (${hint})`}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-bold text-black tabular-nums">
                        {formatBaht(note.amount)}
                      </p>
                    </li>
                  )
                })}
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
        </>
      )}
    </div>
  )
}

/** สรุปช่วงวันที่ (7 / 30 วันล่าสุด หรือที่เลือกเอง) — ยอดรวม แยกวิธีจ่าย กำไร และกราฟรายวัน */
function PeriodView({
  label,
  data,
  isPending,
  isError,
  error,
  onRetry,
}: Readonly<{
  /** "7 วัน" / "วันนั้น" — ต่อท้ายชื่อการ์ด */
  label: string
  data: PeriodData | undefined
  isPending: boolean
  isError: boolean
  error: unknown
  onRetry: () => void
}>) {
  if (isPending) return <PageLoading />
  if (!data) return <LoadError what={`สรุป${label}`} error={error} onRetry={onRetry} />

  const days = data.days

  const netNegative = data.netProfit < 0
  const perDay = data.revenue / days
  const perBill = data.paymentCount > 0 ? data.revenue / data.paymentCount : null
  const best = data.trend.reduce((a, b) => (b.revenue > a.revenue ? b : a), data.trend[0])
  const emptyDays = data.trend.filter((p) => p.revenue === 0).length

  return (
    <>
      {isError && (
        <LoadError what={`สรุป${label}`} stale error={error} onRetry={onRetry} />
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label={`รายรับ${label}`}
          value={formatBaht(data.revenue)}
          hint={`${data.paymentCount.toLocaleString('th-TH')} บิล`}
          tone="brand"
          size="lg"
          className="col-span-2 xl:col-span-1"
        />
        <StatCard
          label="เงินสด"
          value={formatBaht(data.cashTotal)}
          hint={`${data.cashCount.toLocaleString('th-TH')} บิล`}
          tone="orange"
        />
        <StatCard
          label="PromptPay"
          value={formatBaht(data.promptPayTotal)}
          hint={`${data.promptPayCount.toLocaleString('th-TH')} บิล`}
          tone="promptpay"
        />
        <StatCard
          label={netNegative ? `ขาดทุน${label}` : `กำไรสุทธิ${label}`}
          value={formatBaht(data.netProfit)}
          hint={`รายจ่าย ${formatBaht(data.expenseTotal)}`}
          tone={netNegative ? 'red' : 'green'}
          className="col-span-2 xl:col-span-1"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* วันเดียวไม่มีอะไรให้เทียบในกราฟรายวัน */}
        {days > 1 && (
          <section className="rounded-xl border border-gray-200 p-4 lg:col-span-2">
            <h2 className="mb-3 text-lg font-bold text-black">รายรับรายวัน</h2>
            <TrendChart points={data.trend} />
          </section>
        )}

        <section className="flex flex-col rounded-xl border border-gray-200 p-4">
          <h2 className="mb-1 text-lg font-bold text-black">ภาพรวมช่วงนี้</h2>
          <dl className="divide-y divide-gray-200">
            {days > 1 && <StatusRow label="เฉลี่ยต่อวัน" value={formatBaht(Math.round(perDay))} />}
            <StatusRow
              label="เฉลี่ยต่อบิล"
              value={perBill === null ? '–' : formatBaht(Math.round(perBill))}
            />
            {days > 1 && (
              <StatusRow
                label="วันที่ขายดีที่สุด"
                value={best.revenue > 0 ? `${shortDate(best.date)} · ${formatBaht(best.revenue)}` : '–'}
              />
            )}
            {days > 1 && <StatusRow label="วันที่ไม่มีรายรับ" value={`${emptyDays} จาก ${days} วัน`} />}
          </dl>
          <Link
            to="/owner/finance"
            className="mt-auto inline-flex min-h-11 items-center pt-3 text-sm font-bold text-brand-500 hover:underline"
          >
            ดูรายการทั้งหมดในรายรับ-รายจ่าย →
          </Link>
        </section>
      </div>
    </>
  )
}

function StatusRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <dt className="text-sm text-gray-700">{label}</dt>
      <dd className="text-sm font-bold text-black tabular-nums">{value}</dd>
    </div>
  )
}

function IconAlert() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-5 w-5 shrink-0">
      <path d="M12 3.5 2.5 20h19L12 3.5Z" strokeLinejoin="round" />
      <path d="M12 10v4.5M12 17.5h.01" strokeLinecap="round" />
    </svg>
  )
}

function IconCash() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <rect x="2.5" y="6" width="19" height="12" rx="1.5" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 9.5v5M18 9.5v5" strokeLinecap="round" />
    </svg>
  )
}

function IconPhone() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <rect x="6.5" y="2.5" width="11" height="19" rx="2" />
      <path d="M10.5 18.5h3" strokeLinecap="round" />
    </svg>
  )
}
