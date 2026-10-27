import { LoadError } from '@/components/ui/LoadError'
import { PageLoading } from '@/components/ui/PageLoading'
import { Pagination } from '@/components/ui/Pagination'
import { HourlyChart, revenueByHour } from '@/components/ui/HourlyChart'
import { StatCard } from '@/components/ui/StatCard'
import { TrendChart } from '@/components/ui/TrendChart'
import { daysInRange, lastDays, previousRange, todayYmd } from '@/features/reports/api'
import { useDashboard, useDashboardPeriod, useTopItems } from '@/features/reports/hooks'
import { formatBaht, formatTime } from '@/lib/format'
import { usePagination } from '@/lib/use-pagination'
import { PaymentMethod } from '@/types/enums'
import type { DateRange, PeriodData, PeriodPayment } from '@/types/reports'
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

/** 'custom' = แก้ช่องวันที่เอง (ไม่มีปุ่ม — ไม่มีปุ่มไหนถูกเลือก) */
type Preset = 'today' | 7 | 30 | 'custom'
type QuickPreset = Exclude<Preset, 'custom'>

const PRESETS: { value: QuickPreset; label: string }[] = [
  { value: 'today', label: 'วันนี้' },
  { value: 7, label: '7 วัน' },
  { value: 30, label: '30 วัน' },
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
  // ช่วงก่อนหน้าที่ยาวเท่ากัน — ไว้บอกบนการ์ดว่าขึ้นหรือลง
  const previousQuery = useDashboardPeriod(range ? previousRange(range) : null)
  // ต้องเรียก hook ก่อน early return เสมอ (กฎของ hooks) จึงอ่านจาก data?. ตรงนี้
  const pagedNotifications = usePagination(data?.notifications ?? [])
  const now = useNow()

  const setCustom = (next: DateRange) => {
    const { from, to } = normalizeRange(next.from, next.to)
    setParams(from === to ? { from } : { from, to }, { replace: true })
  }
  const selectPreset = (next: QuickPreset) => {
    if (next === 'today') setParams({}, { replace: true })
    else setParams({ range: String(next) }, { replace: true })
  }
  /** ช่องวันที่โชว์ช่วงที่ดูอยู่เสมอ (วันนี้ = วันนี้ถึงวันนี้) แก้ช่องไหน = เปลี่ยนเป็นช่วงที่เลือกเอง */
  const shown: DateRange = range ?? { from: todayYmd(), to: todayYmd() }

  const periodData = periodQuery.data
  const days = range ? daysInRange(range) : 1
  /** ป้ายสั้นต่อท้ายการ์ด ("รายรับ 7 วัน" / "รายรับวันนั้น") */
  // เว้นวรรคหน้าตัวเลข ("รายรับ 7 วัน") แต่ "รายรับวันนั้น" ติดกัน
  const periodLabel = days === 1 ? 'วันนั้น' : ` ${days} วัน`
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
        {/* เลือกวันที่เอง อยู่ข้างปุ่มช่วงเวลาเสมอ · วันเดียว = ใส่วันเดียวกันทั้งสองช่อง */}
        <div className="flex items-center gap-2 text-sm" title={`ย้อนหลังได้สูงสุด ${MAX_DAYS} วันต่อครั้ง`}>
          <label className="sr-only" htmlFor="range-from">
            ตั้งแต่
          </label>
          <input
            id="range-from"
            type="date"
            value={shown.from}
            max={todayYmd()}
            onChange={(e) =>
              e.target.value && setCustom({ from: e.target.value, to: shown.to < e.target.value ? e.target.value : shown.to })
            }
            className={`min-h-11 rounded-lg border px-3 text-sm font-semibold text-gray-800 outline-none focus:border-brand-300 ${
              preset === 'custom' ? 'border-brand-500' : 'border-gray-300'
            }`}
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
            value={shown.to}
            min={shown.from}
            max={todayYmd()}
            onChange={(e) => e.target.value && setCustom({ from: shown.from, to: e.target.value })}
            className={`min-h-11 rounded-lg border px-3 text-sm font-semibold text-gray-800 outline-none focus:border-brand-300 ${
              preset === 'custom' ? 'border-brand-500' : 'border-gray-300'
            }`}
          />
        </div>
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
          now={now}
          previous={previousQuery.data}
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

          <div className="grid items-start gap-4 lg:grid-cols-3">
            <section className="rounded-xl border border-gray-200 p-4 lg:col-span-2">
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
                      <BillRow
                        key={note.id}
                        title={`โต๊ะ ${note.tableName}`}
                        method={note.method}
                        paidAt={note.createdAt}
                        hint={hint}
                        amount={note.amount}
                      />
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

            <TopItemsSection range={shown} />
          </div>
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
  now,
  previous,
}: Readonly<{
  /** "7 วัน" / "วันนั้น" — ต่อท้ายชื่อการ์ด */
  label: string
  data: PeriodData | undefined
  isPending: boolean
  isError: boolean
  error: unknown
  onRetry: () => void
  /** เวลาปัจจุบัน — ดูวันเดียวที่เป็นวันนี้ กราฟรายชั่วโมงจะบอก "ตอนนี้" */
  now: number
  /** ช่วงก่อนหน้าที่ยาวเท่ากัน — ยังโหลดไม่เสร็จ = ไม่โชว์ส่วนเทียบ */
  previous: PeriodData | undefined
}>) {
  if (isPending) return <PageLoading />
  if (!data) return <LoadError what={`สรุป${label}`} error={error} onRetry={onRetry} />

  const days = data.days
  const singleDay = days === 1
  const isToday = singleDay && data.from === todayYmd()
  const byHour = revenueByHour(data.payments)
  const bestHourRevenue = Math.max(0, ...byHour.values())
  const bestHour = [...byHour.entries()].find(([, v]) => v === bestHourRevenue && v > 0)?.[0]
  const pad = (n: number) => String(n).padStart(2, '0')

  const netNegative = data.netProfit < 0
  const perDay = data.revenue / days
  const perBill = data.paymentCount > 0 ? data.revenue / data.paymentCount : null
  const best = data.trend.reduce((a, b) => (b.revenue > a.revenue ? b : a), data.trend[0])
  const emptyDays = data.trend.filter((p) => p.revenue === 0).length
  const against = singleDay ? 'วันก่อนหน้า' : ` ${days} วันก่อนหน้า`
  // previous ต้องเป็นช่วงที่ติดกับช่วงนี้จริง (ตอนเปลี่ยนช่วง ข้อมูลเก่าอาจค้างอยู่ชั่วครู่)
  const prev = previous && previous.to < data.from && previous.days === days ? previous : undefined

  return (
    <>
      {isError && (
        <LoadError what={`สรุป${label}`} stale error={error} onRetry={onRetry} />
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label={`รายรับ${label}`}
          value={formatBaht(data.revenue)}
          hint={
            <>
              {data.paymentCount.toLocaleString('th-TH')} บิล
              {prev && (
                <Change
                  diff={data.revenue - prev.revenue}
                  // ก่อนหน้าเป็น 0 คิด % ไม่ได้ — บอกเป็นบาทแทน
                  text={
                    prev.revenue > 0
                      ? `${Math.round((Math.abs(data.revenue - prev.revenue) / prev.revenue) * 100)}%`
                      : formatBaht(Math.abs(data.revenue - prev.revenue))
                  }
                  against={against}
                  previousText={formatBaht(prev.revenue)}
                />
              )}
            </>
          }
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
          hint={
            <>
              รายจ่าย {formatBaht(data.expenseTotal)}
              {prev && (
                <Change
                  diff={data.netProfit - prev.netProfit}
                  // กำไรติดลบได้ % จะหลอกตา — บอกเป็นบาท
                  text={formatBaht(Math.abs(data.netProfit - prev.netProfit))}
                  against={against}
                  previousText={formatBaht(prev.netProfit)}
                />
              )}
            </>
          }
          tone={netNegative ? 'red' : 'green'}
          className="col-span-2 xl:col-span-1"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* วันเดียวไม่มีอะไรให้เทียบในกราฟรายวัน — ดูรายชั่วโมงแทน */}
        <section className="rounded-xl border border-gray-200 p-4 lg:col-span-2">
          {singleDay ? (
            <>
              <h2 className="mb-3 text-lg font-bold text-black">รายรับรายชั่วโมง</h2>
              <HourlyChart
                payments={data.payments}
                now={isToday ? now : undefined}
                emptyText={isToday ? 'ยังไม่มีรายรับวันนี้' : 'ไม่มีรายรับวันนั้น'}
              />
            </>
          ) : (
            <>
              <h2 className="mb-3 text-lg font-bold text-black">รายรับรายวัน</h2>
              <TrendChart points={data.trend} />
            </>
          )}
        </section>

        <section className="flex flex-col rounded-xl border border-gray-200 p-4">
          <h2 className="mb-1 text-lg font-bold text-black">{singleDay ? 'ภาพรวมวันนั้น' : 'ภาพรวมช่วงนี้'}</h2>
          <dl className="divide-y divide-gray-200">
            {days > 1 && <StatusRow label="เฉลี่ยต่อวัน" value={formatBaht(Math.round(perDay))} />}
            {singleDay && (
              <StatusRow label="จำนวนบิล" value={`${data.paymentCount.toLocaleString('th-TH')} บิล`} />
            )}
            <StatusRow
              label="เฉลี่ยต่อบิล"
              value={perBill === null ? '–' : formatBaht(Math.round(perBill))}
            />
            {singleDay && (
              <StatusRow
                label="ชั่วโมงที่ขายดีที่สุด"
                value={
                  bestHour === undefined
                    ? '–'
                    : `${pad(bestHour)}:00–${pad(bestHour)}:59 · ${formatBaht(bestHourRevenue)}`
                }
              />
            )}
            {singleDay && <StatusRow label="รายจ่าย" value={formatBaht(data.expenseTotal)} />}
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

      <div className="grid items-start gap-4 lg:grid-cols-3">
        {singleDay && <DayBills payments={data.payments} isToday={isToday} />}
        <TopItemsSection range={{ from: data.from, to: data.to }} className={singleDay ? '' : 'lg:col-span-3'} />
      </div>
    </>
  )
}

/** "▲ 12% จาก 7 วันก่อนหน้า" — ขึ้นสีเขียว ลงสีแดง */
function Change({
  diff,
  text,
  against,
  previousText,
}: Readonly<{ diff: number; text: string; against: string; previousText: string }>) {
  return (
    <span className="mt-0.5 block" title={`${against.trim()}: ${previousText}`}>
      {diff === 0 ? (
        <>เท่ากับ{against}</>
      ) : (
        <>
          <span className={`font-semibold ${diff > 0 ? 'text-success-ink' : 'text-danger-ink'}`}>
            <span aria-hidden>{diff > 0 ? '▲' : '▼'} </span>
            <span className="sr-only">{diff > 0 ? 'เพิ่มขึ้น ' : 'ลดลง '}</span>
            {text}
          </span>{' '}
          จาก{against}
        </>
      )}
    </span>
  )
}

/** บิลหนึ่งใบในรายการบิล — ไอคอนตามวิธีจ่าย ชื่อ เวลา ยอด */
function BillRow({
  title,
  method,
  paidAt,
  hint,
  amount,
}: Readonly<{ title: string; method: PaymentMethod; paidAt: string; hint?: string | null; amount: number }>) {
  return (
    <li className="flex items-center gap-3 py-3">
      <span
        aria-hidden
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          method === PaymentMethod.PROMPTPAY ? 'bg-promptpay/10 text-promptpay' : 'bg-brand-50 text-brand-500'
        }`}
      >
        {method === PaymentMethod.PROMPTPAY ? <IconPhone /> : <IconCash />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-black">{title}</p>
        <p className="text-xs text-gray-600">
          {methodLabel[method]} · <span className="tabular-nums">{formatTime(paidAt)}</span>
          {hint && ` (${hint})`}
        </p>
      </div>
      <p className="shrink-0 text-sm font-bold text-black tabular-nums">{formatBaht(amount)}</p>
    </li>
  )
}

/** รายการบิลของวันที่เลือก (ดูวันเดียว) ล่าสุดก่อน */
function DayBills({ payments, isToday }: Readonly<{ payments: PeriodPayment[]; isToday: boolean }>) {
  const paged = usePagination(payments)
  return (
    <section className="rounded-xl border border-gray-200 p-4 lg:col-span-2">
      <h2 className="mb-1 text-lg font-bold text-black">{isToday ? 'บิลที่รับเงินวันนี้' : 'บิลที่รับเงินวันนั้น'}</h2>
      {payments.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-600">
          {isToday ? 'วันนี้ยังไม่มีบิลที่รับเงิน' : 'วันนั้นไม่มีบิลที่รับเงิน'}
        </p>
      ) : (
        <ul className="divide-y divide-gray-200">
          {paged.pageItems.map((p) => (
            <BillRow key={p.id} title={p.title} method={p.method} paidAt={p.paidAt} amount={p.amount} />
          ))}
        </ul>
      )}
      <Pagination
        page={paged.page}
        totalPages={paged.totalPages}
        from={paged.from}
        to={paged.to}
        total={paged.total}
        onChange={paged.setPage}
        unit="บิล"
      />
    </section>
  )
}

/** เมนูขายดี 5 อันดับของช่วง — นับเฉพาะออเดอร์ที่จ่ายแล้ว แท่งเทียบกับอันดับ 1 */
function TopItemsSection({ range, className = '' }: Readonly<{ range: DateRange; className?: string }>) {
  const { data, isPending, isError, error, refetch } = useTopItems(range)
  const top = data?.items[0]?.quantity ?? 0

  return (
    <section className={`flex flex-col rounded-xl border border-gray-200 p-4 ${className}`}>
      <h2 className="mb-1 text-lg font-bold text-black">เมนูขายดี</h2>
      {isPending ? (
        <p className="py-6 text-center text-sm text-gray-600">กำลังโหลด…</p>
      ) : !data ? (
        <LoadError what="เมนูขายดี" error={isError ? error : null} onRetry={() => void refetch()} />
      ) : data.items.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-600">ยังไม่มีเมนูที่ขายได้ในช่วงนี้</p>
      ) : (
        <ol className="divide-y divide-gray-200">
          {data.items.map((item, i) => (
            <li key={item.menuItemId} className="flex items-center gap-3 py-3">
              <span className="w-5 shrink-0 text-center text-sm font-bold text-gray-500 tabular-nums">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="truncate text-sm font-semibold text-black">{item.name}</p>
                  <p className="shrink-0 text-sm font-bold text-black tabular-nums">
                    {item.quantity.toLocaleString('th-TH')} จาน
                  </p>
                </div>
                <div aria-hidden className="mt-1.5 h-1.5 rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-brand-400"
                    style={{ width: `${top > 0 ? (item.quantity / top) * 100 : 0}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-gray-600">
                  {item.categoryName} · <span className="tabular-nums">{formatBaht(item.revenue)}</span>
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
      <Link
        to="/owner/sales"
        className="mt-auto inline-flex min-h-11 items-center pt-3 text-sm font-bold text-brand-500 hover:underline"
      >
        ดูทั้งหมดในหน้าเมนูขายดี →
      </Link>
    </section>
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
