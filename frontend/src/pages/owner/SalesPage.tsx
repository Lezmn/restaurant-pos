import { LoadError } from '@/components/ui/LoadError'
import { StatCard } from '@/components/ui/StatCard'
import { currentMonth } from '@/features/reports/api'
import { useSales } from '@/features/reports/hooks'
import { BUSINESS_HOURS } from '@/lib/config'
import { formatBaht } from '@/lib/format'
import type { KitchenStats, SalesData, SalesHour, SalesItem } from '@/types/reports'
import { Fragment, useState } from 'react'
import { Link } from 'react-router-dom'

/** แสดงอันดับแรก ๆ ก่อน ที่เหลือกดดูเพิ่ม — เมนูทั้งร้านมีหลายสิบรายการ */
const TOP_N = 5
/** เมนูที่ไม่มีใครสั่งเกินเท่านี้ค่อยพับไว้ */
const UNSOLD_COLLAPSE_AT = 8

type SortKey = 'quantity' | 'revenue'

const clock = (hour: number) => `${String(hour).padStart(2, '0')}:00`
const hourRange = (hour: number) => `${clock(hour)}–${clock(hour + 1)}`

const monthLabel = (month: string) => {
  const [year, m] = month.split('-').map(Number)
  return new Date(year, m - 1, 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })
}

export function SalesPage() {
  const [month, setMonth] = useState(currentMonth)
  const { data, isPending, isError, error, refetch } = useSales(month)

  const peak = data?.byHour.reduce<SalesHour | null>(
    (best, slot) => (slot.orderCount > (best?.orderCount ?? 0) ? slot : best),
    null,
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-black">เมนูขายดี</h1>
          <p className="text-sm text-gray-600">
            นับออเดอร์ที่จ่ายเงินในเดือนนี้ (ตรงกับรายรับ) · ยอดตามราคาเมนู ก่อนหักส่วนลดท้ายบิล
          </p>
        </div>
        <label className="text-sm">
          <span className="sr-only">เดือน</span>
          <input
            type="month"
            value={month}
            max={currentMonth()}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="min-h-11 rounded-lg border border-gray-300 px-3 text-sm font-semibold text-gray-800 outline-none focus:border-brand-400"
          />
        </label>
      </div>

      {isError && (
        <LoadError what="รายงานยอดขาย" stale={Boolean(data)} error={error} onRetry={() => refetch()} />
      )}

      {isPending && !isError && <SalesSkeleton />}

      {data && data.orderCount === 0 && (
        <div className="rounded-xl border-2 border-gray-200 px-6 py-12 text-center">
          <p className="text-lg font-bold text-black">ยังไม่มีออเดอร์ที่จ่ายแล้วใน{monthLabel(month)}</p>
          <p className="mt-1 text-sm text-gray-600">เลือกเดือนอื่นด้านบน หรือรอให้มีบิลแรกของเดือน</p>
        </div>
      )}

      {data && data.orderCount > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="ขายได้"
              value={`${data.totalQuantity.toLocaleString('th-TH')} จาน`}
              hint={`จาก ${data.orderCount.toLocaleString('th-TH')} ออเดอร์`}
            />
            <StatCard
              label="ยอดตามราคาเมนู"
              value={formatBaht(data.totalRevenue)}
              tone="orange"
              hint="ก่อนหักส่วนลดท้ายบิล"
            />
            <StatCard
              label="ชั่วโมงที่ลูกค้าสั่งมากที่สุด"
              value={peak ? hourRange(peak.hour) : '-'}
              tone="purple"
              hint={peak ? `รวมทุกวัน ${peak.orderCount.toLocaleString('th-TH')} ออเดอร์` : undefined}
            />
          </div>

          {/* การ์ดสูงเท่ากัน กราฟยืดเต็มการ์ด ไม่เหลือที่โล่งใต้กราฟ (ยืดได้ถึง max-h ของการ์ดกราฟ) */}
          <div className="grid gap-5 lg:grid-cols-2">
            <TopItems items={data.topItems} unsold={data.unsoldItems} />
            <HourChart hours={data.byHour} peakHour={peak?.hour ?? null} />
          </div>

          <WeekHeatmap grid={data.byWeekdayHour} />
          <KitchenSpeed stats={data.kitchen} />
        </>
      )}
    </div>
  )
}

function SalesSkeleton() {
  return (
    <div aria-hidden className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-100" />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="h-96 animate-pulse rounded-xl bg-gray-100" />
        <div className="h-96 animate-pulse rounded-xl bg-gray-100" />
      </div>
    </div>
  )
}

/**
 * อันดับเมนู — แท่งแนวนอนยาวตามค่าที่เลือก ตัวเลขอยู่ท้ายแถวเสมอ ไม่ต้องอ่านจากแท่ง
 * ท้ายการ์ดคือเมนูที่เปิดขายแต่ไม่มีใครสั่ง (= อันดับท้ายสุด 0 ออเดอร์)
 * อยู่การ์ดเดียวกัน ตัดสินใจเรื่องเมนูได้ในที่เดียว
 */
function TopItems({
  items,
  unsold,
}: Readonly<{ items: SalesItem[]; unsold: SalesData['unsoldItems'] }>) {
  const [sortBy, setSortBy] = useState<SortKey>('quantity')
  const [showAll, setShowAll] = useState(false)

  const sorted =
    sortBy === 'quantity'
      ? items
      : [...items].sort((a, b) => b.revenue - a.revenue || b.quantity - a.quantity)
  const visible = showAll ? sorted : sorted.slice(0, TOP_N)
  const max = Math.max(...sorted.map((item) => item[sortBy]), 1)

  return (
    <section className="rounded-xl border-2 border-gray-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-black">อันดับเมนู</h2>
        <div role="group" aria-label="เรียงตาม" className="flex rounded-lg border-2 border-gray-300 p-0.5">
          {(
            [
              ['quantity', 'จำนวนออเดอร์'],
              ['revenue', 'ยอดเงิน'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={sortBy === key}
              onClick={() => setSortBy(key)}
              className={`min-h-11 rounded-md px-3 text-sm font-semibold transition ${
                sortBy === key ? 'bg-brand-500 text-white' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <ol aria-label="อันดับเมนู" className="mt-4 space-y-3">
        {visible.map((item, index) => (
          <li key={item.menuItemId} className="flex items-center gap-3">
            <span
              className={`w-7 shrink-0 text-center text-base font-bold tabular-nums ${
                index < 3 ? 'text-brand-500' : 'text-gray-500'
              }`}
            >
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-black">
                {item.name}
                <span className="font-normal text-gray-500"> · {item.categoryName}</span>
              </p>
              <div aria-hidden className="mt-1 h-2.5 rounded-r bg-brand-50">
                <div
                  className={`h-full rounded-r ${index === 0 ? 'bg-brand-500' : 'bg-brand-300'}`}
                  style={{ width: `${Math.max(2, (item[sortBy] / max) * 100)}%` }}
                />
              </div>
            </div>
            <div className="w-20 shrink-0 text-right tabular-nums">
              <p className="text-sm font-bold text-black">
                {sortBy === 'quantity'
                  ? `${item.quantity.toLocaleString('th-TH')} ออเดอร์`
                  : formatBaht(item.revenue)}
              </p>
              <p className="text-xs text-gray-600">
                {sortBy === 'quantity'
                  ? formatBaht(item.revenue)
                  : `${item.quantity.toLocaleString('th-TH')} ออเดอร์`}
              </p>
            </div>
          </li>
        ))}
      </ol>

      {sorted.length > TOP_N && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-4 min-h-11 w-full rounded-lg border-2 border-gray-300 text-sm font-semibold text-gray-800 transition hover:bg-gray-50"
        >
          {showAll ? `แสดงแค่ ${TOP_N} อันดับแรก` : `ดูทั้งหมด ${sorted.length} เมนู`}
        </button>
      )}

      {unsold.length > 0 && <UnsoldItems items={unsold} />}
    </section>
  )
}

/**
 * เมนูที่เปิดขายแต่ไม่มีใครสั่ง — มักมีหลายสิบรายการ ถ้ากางหมดจะยาวกว่าอันดับเมนูเสียอีก
 * ปกติพับไว้ โชว์แค่จำนวนแยกหมวด กดดูรายชื่อแล้วจัดกลุ่มตามหมวด ไม่ต้องพิมพ์ชื่อหมวดซ้ำทุกเมนู
 */
function UnsoldItems({ items }: Readonly<{ items: SalesData['unsoldItems'] }>) {
  const [expanded, setExpanded] = useState(false)
  // ไม่กี่เมนูกางไว้เลย — ปุ่ม "ดูรายชื่อทั้ง 1 เมนู" มีแต่เพิ่มขั้นตอน
  const collapsible = items.length > UNSOLD_COLLAPSE_AT
  const open = expanded || !collapsible

  const groups = new Map<string, string[]>()
  for (const item of items) {
    groups.set(item.categoryName, [...(groups.get(item.categoryName) ?? []), item.name])
  }
  // หมวดที่ค้างเยอะสุดขึ้นก่อน — เป็นหมวดที่ควรรื้อเมนูก่อน
  const byCategory = [...groups].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'th'))

  return (
    <div className="mt-4 border-t border-gray-200 pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-bold text-black">
          ไม่มีใครสั่งเลย <span className="tabular-nums">{items.length.toLocaleString('th-TH')}</span> เมนู
        </h3>
        <Link to="/employee/manage" className="text-sm font-semibold text-brand-500 underline">
          ไปหน้าจัดการเมนู →
        </Link>
      </div>
      <p className="mt-1 text-sm text-gray-600">เปิดขายอยู่แต่ไม่มีออเดอร์ — ลองปรับราคา รูป หรือเอาออกจากเมนู</p>

      {open ? (
        <dl aria-label="เมนูที่ไม่มีใครสั่ง แยกตามหมวด" className="mt-3 space-y-2.5">
          {byCategory.map(([category, names]) => (
            <div key={category}>
              <dt className="text-xs font-semibold text-gray-600">
                {category} <span className="tabular-nums">({names.length})</span>
              </dt>
              {/* nowrap ทีละชื่อ — ภาษาไทยไม่มีเว้นวรรค ไม่งั้นตัดบรรทัดกลางชื่อเมนู */}
              <dd className="mt-0.5 text-sm leading-relaxed text-gray-800">
                {names.map((name, i) => (
                  <Fragment key={name}>
                    {i > 0 && <span className="text-gray-400"> · </span>}
                    <span className="whitespace-nowrap">{name}</span>
                  </Fragment>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-3 text-sm text-gray-700">
          {byCategory.map(([category, names], i) => (
            <Fragment key={category}>
              {i > 0 && <span className="text-gray-400"> · </span>}
              <span className="whitespace-nowrap">
                {category} <span className="font-semibold tabular-nums text-black">{names.length}</span>
              </span>
            </Fragment>
          ))}
        </p>
      )}

      {collapsible && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 min-h-11 w-full rounded-lg border-2 border-gray-300 text-sm font-semibold text-gray-800 transition hover:bg-gray-50"
        >
          {open ? 'ซ่อนรายชื่อ' : `ดูรายชื่อทั้ง ${items.length.toLocaleString('th-TH')} เมนู`}
        </button>
      )}
    </div>
  )
}

const CHART_TICKS = 4

/** ระยะห่างเส้นกริดเป็นเลขกลม (1 / 2 / 5 × 10ⁿ) */
const niceStep = (max: number) => {
  const raw = Math.max(1, max) / CHART_TICKS
  const mag = 10 ** Math.floor(Math.log10(raw))
  return Math.max(1, [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw)
}

/**
 * จำนวนออเดอร์รายชั่วโมง — แท่งแนวตั้ง ชั่วโมงที่มากที่สุดเข้มกว่า
 * ตัดช่วงที่ไม่มีออเดอร์หัว/ท้ายออก (ร้านไม่เปิดตีสาม) แต่ช่องว่างกลางวันยังแสดงเป็น 0
 */
function HourChart({
  hours,
  peakHour,
}: Readonly<{ hours: SalesHour[]; peakHour: number | null }>) {
  const active = hours.filter((h) => h.orderCount > 0)
  const first = Math.max(0, (active[0]?.hour ?? 10) - 1)
  const last = Math.min(23, (active.at(-1)?.hour ?? 20) + 1)
  const shown = hours.slice(first, last + 1)

  const step = niceStep(Math.max(...shown.map((h) => h.orderCount)))
  const max = step * CHART_TICKS
  const ticks = Array.from({ length: CHART_TICKS + 1 }, (_, i) => step * i)
  // ป้ายแกน X ทุกชั่วโมงถ้าแท่งไม่เยอะ ไม่งั้นเว้นชั่วโมง กันตัวเลขชนกัน
  const labelEvery = shown.length > 12 ? 2 : 1

  return (
    // สูงตามการ์ดอันดับเมนูข้าง ๆ แต่ไม่เกิน max-h — กางรายชื่อเมนูยาว ๆ แล้วการ์ดกราฟหยุดยืด
    // (grid item ที่ stretch แต่ติด max-h จะชิดบน) ไม่เป็นกล่องโล่งยาวลงไป
    <section className="flex flex-col rounded-xl border-2 border-gray-200 p-4 lg:max-h-[34rem]">
      <h2 className="text-base font-bold text-black">ออเดอร์ตามช่วงเวลา</h2>
      <p className="text-sm text-gray-600">รวมทั้งเดือน ตามเวลาที่ลูกค้ากดสั่ง</p>

      <figure className="m-0 mt-4 flex flex-1 flex-col">
        <div className="flex min-h-56 flex-1 gap-2">
          <div aria-hidden className="relative w-8 shrink-0">
            {ticks.map((tick) => (
              <span
                key={tick}
                className="absolute right-0 translate-y-1/2 text-xs text-gray-500 tabular-nums"
                style={{ bottom: `${(tick / max) * 100}%` }}
              >
                {tick}
              </span>
            ))}
          </div>

          <div className="relative min-w-0 flex-1">
            {ticks.map((tick) => (
              <div
                key={tick}
                aria-hidden
                className="absolute inset-x-0 border-t border-line"
                style={{ bottom: `${(tick / max) * 100}%` }}
              />
            ))}
            <div className="absolute inset-0 flex items-end gap-0.5">
              {shown.map((slot) => {
                const isPeak = slot.hour === peakHour
                return (
                  <div
                    key={slot.hour}
                    // พื้นที่ hover เต็มความสูงคอลัมน์ ไม่ใช่แค่ตัวแท่ง — แท่งเตี้ยก็ชี้ง่าย
                    tabIndex={0}
                    aria-label={`${hourRange(slot.hour)} ${slot.orderCount} ออเดอร์ ${slot.quantity} จาน ${formatBaht(slot.revenue)}`}
                    className="group relative flex h-full min-w-0 flex-1 items-end outline-none"
                  >
                    <div
                      className={`w-full rounded-t transition ${
                        isPeak ? 'bg-brand-500' : 'bg-brand-300 group-hover:bg-brand-400 group-focus-visible:bg-brand-400'
                      }`}
                      style={{ height: `${(slot.orderCount / max) * 100}%` }}
                    />
                    <div
                      role="tooltip"
                      className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-black px-3 py-2 text-xs text-white shadow-lg group-hover:block group-focus-visible:block"
                    >
                      <p className="font-bold">{hourRange(slot.hour)}</p>
                      <p className="tabular-nums">
                        {slot.orderCount} ออเดอร์ · {slot.quantity} จาน
                      </p>
                      <p className="tabular-nums">{formatBaht(slot.revenue)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div aria-hidden className="ml-10 flex gap-0.5">
          {shown.map((slot, i) => (
            <span
              key={slot.hour}
              className={`min-w-0 flex-1 pt-1 text-center text-xs tabular-nums ${
                slot.hour === peakHour ? 'font-bold text-black' : 'text-gray-500'
              }`}
            >
              {i % labelEvery === 0 || slot.hour === peakHour ? slot.hour : ''}
            </span>
          ))}
        </div>

        <figcaption className="sr-only">
          จำนวนออเดอร์รายชั่วโมง
          <ul>
            {shown.map((slot) => (
              <li key={slot.hour}>
                {hourRange(slot.hour)} {slot.orderCount} ออเดอร์
              </li>
            ))}
          </ul>
        </figcaption>
      </figure>
    </section>
  )
}

/** จันทร์ขึ้นก่อน (ร้านคิดเป็นสัปดาห์ทำงาน) — index ตาม getDay(): 0 = อาทิตย์ */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]
const DAY_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']
const DAY_FULL = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']

/** ความเข้ม 5 ระดับ — ช่องว่างเป็นเทาอ่อน ไม่ใช่ขาว จะได้เห็นว่าเป็นช่องที่ไม่มีออเดอร์ ไม่ใช่ข้อมูลหาย */
const HEAT_STEPS = ['bg-gray-100', 'bg-brand-50', 'bg-brand-75', 'bg-brand-300', 'bg-brand-500']
const heatClass = (value: number, max: number) =>
  value === 0 ? HEAT_STEPS[0] : HEAT_STEPS[Math.min(4, 1 + Math.floor((value / max) * 3.999))]
/** ตัวขาวได้เฉพาะบน brand-500 — บน brand-300 ได้แค่ 2.3:1 */
const heatTextClass = (heat: string) =>
  heat === 'bg-brand-500' ? 'font-semibold text-white' : heat === 'bg-brand-300' ? 'font-semibold text-black' : 'text-gray-700'

/**
 * heatmap วัน × ชั่วโมง — ใช้วางกะพนักงาน/เตรียมของ ว่าวันไหนชั่วโมงไหนยุ่ง
 * ตั้ง VITE_OPEN_HOUR/VITE_CLOSE_HOUR = แสดงเฉพาะเวลาเปิดร้าน
 * ไม่ตั้ง = ตัดชั่วโมงหัว/ท้ายที่ไม่มีออเดอร์ทั้งสัปดาห์ออก (ร้านไม่เปิดตีสาม)
 */
function WeekHeatmap({ grid }: Readonly<{ grid: number[][] }>) {
  const hourTotals = Array.from({ length: 24 }, (_, h) => grid.reduce((n, day) => n + (day[h] ?? 0), 0))
  const firstActive = hourTotals.findIndex((n) => n > 0)
  if (firstActive === -1) return null
  const lastActive = 23 - [...hourTotals].reverse().findIndex((n) => n > 0)
  const hours =
    BUSINESS_HOURS ?? Array.from({ length: lastActive - firstActive + 1 }, (_, i) => firstActive + i)
  const max = Math.max(...grid.flatMap((day) => hours.map((h) => day[h] ?? 0)), 1)

  // ยอดรวมขอบตาราง — เจ้าของร้านมักถามแยกกัน "วันไหนยุ่ง" กับ "ชั่วโมงไหนยุ่ง"
  // นับเฉพาะชั่วโมงที่แสดง ตัวเลขรวมจะได้ตรงกับช่องที่เห็น
  const dayTotals = grid.map((day) => hours.reduce((n, h) => n + (day[h] ?? 0), 0))
  const topDay = Math.max(...dayTotals)
  const topHour = Math.max(...hours.map((h) => hourTotals[h]))
  const grandTotal = dayTotals.reduce((n, c) => n + c, 0)
  // ออเดอร์นอกเวลาเปิดร้าน (เช่น ทดสอบระบบตอนดึก) — ไม่โชว์ในตาราง แต่บอกไว้ไม่ให้ยอดหายเงียบ ๆ
  const outsideTotal = hourTotals.reduce((n, c) => n + c, 0) - grandTotal

  let busiest = { day: 0, hour: 0, count: 0 }
  for (const day of WEEK_ORDER) {
    for (const hour of hours) {
      const count = grid[day]?.[hour] ?? 0
      if (count > busiest.count) busiest = { day, hour, count }
    }
  }

  return (
    <section className="rounded-xl border-2 border-gray-200 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold text-black">วันไหน ชั่วโมงไหนยุ่ง</h2>
        {busiest.count > 0 && (
          <p className="text-sm text-gray-600">
            {/* ช่องเดียว (วัน × ชั่วโมง) — ไม่ใช่ชั่วโมงรวมทุกวันแบบการ์ดด้านบน จึงอาจไม่ตรงกัน */}
            ช่องที่ยุ่งสุด:{' '}
            <span className="font-semibold text-black">
              {DAY_FULL[busiest.day]} {hourRange(busiest.hour)}
            </span>{' '}
            ({busiest.count.toLocaleString('th-TH')} ออเดอร์ รวมทุกวัน{DAY_FULL[busiest.day]}ของเดือน)
          </p>
        )}
      </div>

      {/* เต็มความกว้างกรอบ — จอแคบเกิน (มือถือ) เลื่อนเฉพาะในกรอบ หน้าไม่เลื่อนข้าง */}
      {/* relative: ช่อง sr-only (absolute) ต้องอยู่ในกรอบนี้ ไม่งั้นหลุดกรอบดันทั้งหน้าให้เลื่อนข้าง */}
      <div className="relative mt-4 overflow-x-auto">
        <table className="w-full border-separate border-spacing-0.5 text-xs md:text-sm">
          <caption className="sr-only">จำนวนออเดอร์แยกตามวันและชั่วโมง พร้อมยอดรวมรายวันและรายชั่วโมง</caption>
          <thead>
            <tr>
              <th scope="col" className="w-10">
                <span className="sr-only">วัน</span>
              </th>
              {hours.map((hour) => (
                <th
                  key={hour}
                  scope="col"
                  className="min-w-11 pb-1 font-normal whitespace-nowrap text-gray-600 tabular-nums"
                >
                  {clock(hour)}
                </th>
              ))}
              <th scope="col" className="pb-1 pl-2 font-semibold text-gray-700">
                รวม
              </th>
            </tr>
          </thead>
          <tbody>
            {WEEK_ORDER.map((day) => (
              <tr key={day}>
                <th scope="row" className="pr-1 text-left font-semibold text-gray-700">
                  <abbr title={DAY_FULL[day]} className="no-underline">
                    {DAY_SHORT[day]}
                  </abbr>
                </th>
                {hours.map((hour) => {
                  const count = grid[day]?.[hour] ?? 0
                  const heat = heatClass(count, max)
                  return (
                    <td
                      key={hour}
                      title={`${DAY_FULL[day]} ${hourRange(hour)} · ${count} ออเดอร์`}
                      className={`h-8 min-w-11 rounded text-center tabular-nums md:h-9 ${heat} ${heatTextClass(heat)}`}
                    >
                      {count > 0 ? count : <span className="sr-only">0</span>}
                    </td>
                  )
                })}
                <TotalCell value={dayTotals[day]} top={dayTotals[day] === topDay} />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="pt-1 pr-1 text-left font-semibold text-gray-700">
                รวม
              </th>
              {hours.map((hour) => (
                <TotalCell key={hour} value={hourTotals[hour]} top={hourTotals[hour] === topHour} footer />
              ))}
              <td className="pt-1 pl-2 text-center font-bold text-black tabular-nums">
                {grandTotal.toLocaleString('th-TH')}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* บอกว่าสี/ตัวเลขหมายถึงอะไร — ไม่งั้นต้องเดาเอง */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-600 md:text-sm">
        <span className="flex items-center gap-1.5">
          น้อย
          {HEAT_STEPS.map((step) => (
            <span key={step} aria-hidden className={`h-4 w-4 rounded ${step}`} />
          ))}
          มาก
        </span>
        <span>ตัวเลขในช่อง = จำนวนออเดอร์</span>
        <span>
          <b className="text-black">ตัวหนา</b> ในแถว/คอลัมน์ “รวม” = วันหรือชั่วโมงที่ยุ่งสุด
        </span>
        {outsideTotal > 0 && (
          <span>
            ไม่รวม {outsideTotal.toLocaleString('th-TH')} ออเดอร์นอกเวลาเปิดร้าน ({clock(hours[0])}–
            {clock(hours.at(-1)! + 1)})
          </span>
        )}
      </div>
    </section>
  )
}

/** ช่องยอดรวมของ heatmap — ไม่ลงสี (แยกจากข้อมูลรายช่อง) ตัวที่มากสุดเป็นตัวหนา */
function TotalCell({
  value,
  top,
  footer = false,
}: Readonly<{ value: number; top: boolean; footer?: boolean }>) {
  return (
    <td
      className={`text-center tabular-nums ${footer ? 'pt-1' : 'pl-2'} ${
        top && value > 0 ? 'font-bold text-black' : 'text-gray-600'
      }`}
    >
      {value > 0 ? value.toLocaleString('th-TH') : '–'}
    </td>
  )
}

const minutesLabel = (value: number | null) =>
  value === null ? '-' : `${value.toLocaleString('th-TH', { maximumFractionDigits: 1 })} นาที`

/** ความเร็วครัว: รอคิวนานไหม / ปรุงนานไหม / ช้าเกินกี่ออเดอร์ / เมนูไหนทำนาน */
function KitchenSpeed({ stats }: Readonly<{ stats: KitchenStats }>) {
  const latePercent =
    stats.timedOrderCount > 0 ? Math.round((stats.lateOrderCount / stats.timedOrderCount) * 100) : 0

  return (
    <section className="rounded-xl border-2 border-gray-200 p-4">
      <h2 className="text-base font-bold text-black">ความเร็วครัว</h2>
      {stats.timedOrderCount === 0 ? (
        <p className="mt-1 text-sm text-gray-600">
          ยังไม่มีข้อมูล — ระบบเริ่มจับเวลาตอนครัวกด &quot;เริ่มปรุง&quot; และ &quot;ทำเสร็จแล้ว&quot; บนจอครัว
        </p>
      ) : (
        <>
          <p className="text-sm text-gray-600">
            จาก {stats.timedOrderCount.toLocaleString('th-TH')} ออเดอร์ที่จับเวลาได้ · เวลาปรุงนับทั้งออเดอร์
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="รอคิวเฉลี่ย" value={minutesLabel(stats.avgWaitMinutes)} hint="สั่ง → เริ่มปรุง" tone="olive" />
            <StatCard label="ปรุงเฉลี่ย" value={minutesLabel(stats.avgCookMinutes)} hint="เริ่มปรุง → เสร็จ" tone="orange" />
            <StatCard label="รวมเฉลี่ย" value={minutesLabel(stats.avgTotalMinutes)} hint="สั่ง → เสร็จ" />
            <StatCard
              label={`เกิน ${stats.lateMinutes} นาที`}
              value={`${stats.lateOrderCount.toLocaleString('th-TH')} ออเดอร์`}
              hint={`${latePercent}% ของออเดอร์`}
              tone={latePercent >= 20 ? 'red' : 'green'}
            />
          </div>

          {stats.slowestMenus.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-bold text-black">เมนูที่ออเดอร์ใช้เวลาปรุงนานสุด</h3>
              <ol className="mt-2 divide-y divide-gray-100">
                {stats.slowestMenus.map((menu) => (
                  <li key={menu.menuItemId} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 truncate font-semibold text-black">{menu.name}</span>
                    <span className="shrink-0 tabular-nums text-gray-700">
                      <span className="font-bold text-black">{minutesLabel(menu.avgCookMinutes)}</span>
                      <span className="text-gray-500"> · {menu.orderCount} ออเดอร์</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}
    </section>
  )
}
