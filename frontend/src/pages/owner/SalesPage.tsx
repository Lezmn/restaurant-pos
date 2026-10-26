import { LoadError } from '@/components/ui/LoadError'
import { StatCard } from '@/components/ui/StatCard'
import { currentMonth } from '@/features/reports/api'
import { useSales } from '@/features/reports/hooks'
import { formatBaht } from '@/lib/format'
import type { KitchenStats, SalesHour, SalesItem } from '@/types/reports'
import { useState } from 'react'

/** แสดงอันดับแรก ๆ ก่อน ที่เหลือกดดูเพิ่ม — เมนูทั้งร้านมีหลายสิบรายการ */
const TOP_N = 10

type SortKey = 'quantity' | 'revenue'

const hourRange = (hour: number) =>
  `${String(hour).padStart(2, '0')}:00–${String(hour + 1).padStart(2, '0')}:00`

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
            นับเฉพาะออเดอร์ที่จ่ายเงินแล้ว · ยอดตามราคาเมนู ก่อนหักส่วนลดท้ายบิล
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
              label="ช่วงที่ลูกค้าสั่งมากที่สุด"
              value={peak ? hourRange(peak.hour) : '-'}
              tone="purple"
              hint={peak ? `${peak.orderCount.toLocaleString('th-TH')} ออเดอร์ทั้งเดือน` : undefined}
            />
          </div>

          {/* items-start: การ์ดกราฟไม่ยืดตามความสูงรายการอันดับจนมีที่ว่างโล่งท้ายการ์ด */}
          <div className="grid items-start gap-5 lg:grid-cols-2">
            <TopItems items={data.topItems} />
            <HourChart hours={data.byHour} peakHour={peak?.hour ?? null} />
          </div>

          <WeekHeatmap grid={data.byWeekdayHour} />
          <KitchenSpeed stats={data.kitchen} />

          {data.unsoldItems.length > 0 && (
            <section className="rounded-xl border-2 border-gray-200 p-4">
              <h2 className="text-base font-bold text-black">
                เปิดขายอยู่แต่ไม่มีใครสั่งเลย ({data.unsoldItems.length})
              </h2>
              <p className="text-sm text-gray-600">ลองปรับราคา รูป หรือพิจารณาเอาออกจากเมนู</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {data.unsoldItems.map((item) => (
                  <li
                    key={item.menuItemId}
                    className="rounded-full border border-gray-300 px-3 py-1 text-sm text-gray-800"
                  >
                    {item.name}
                    <span className="text-gray-500"> · {item.categoryName}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
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

/** อันดับเมนู — แท่งแนวนอนยาวตามค่าที่เลือก ตัวเลขอยู่ท้ายแถวเสมอ ไม่ต้องอ่านจากแท่ง */
function TopItems({ items }: Readonly<{ items: SalesItem[] }>) {
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
              className={`min-h-9 rounded-md px-3 text-sm font-semibold transition ${
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
    </section>
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
    <section className="rounded-xl border-2 border-gray-200 p-4">
      <h2 className="text-base font-bold text-black">ออเดอร์ตามช่วงเวลา</h2>
      <p className="text-sm text-gray-600">รวมทั้งเดือน ตามเวลาที่ลูกค้ากดสั่ง</p>

      <figure className="m-0 mt-4">
        <div className="flex gap-2">
          <div aria-hidden className="relative h-56 w-8 shrink-0">
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

          <div className="relative h-56 min-w-0 flex-1">
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

/**
 * heatmap วัน × ชั่วโมง — ใช้วางกะพนักงาน/เตรียมของ ว่าวันไหนชั่วโมงไหนยุ่ง
 * ตัดชั่วโมงหัว/ท้ายที่ไม่มีออเดอร์ทั้งสัปดาห์ออก (ร้านไม่เปิดตีสาม)
 */
function WeekHeatmap({ grid }: Readonly<{ grid: number[][] }>) {
  const hourTotals = Array.from({ length: 24 }, (_, h) => grid.reduce((n, day) => n + (day[h] ?? 0), 0))
  const firstActive = hourTotals.findIndex((n) => n > 0)
  if (firstActive === -1) return null
  const lastActive = 23 - [...hourTotals].reverse().findIndex((n) => n > 0)
  const hours = Array.from({ length: lastActive - firstActive + 1 }, (_, i) => firstActive + i)
  const max = Math.max(...grid.flat(), 1)

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
        <p className="text-sm text-gray-600">
          ยุ่งสุด:{' '}
          <span className="font-semibold text-black">
            {DAY_FULL[busiest.day]} {hourRange(busiest.hour)}
          </span>{' '}
          ({busiest.count.toLocaleString('th-TH')} ออเดอร์ทั้งเดือน)
        </p>
      </div>

      {/* ตารางกว้างเกินจอมือถือได้ — เลื่อนเฉพาะในกรอบ หน้าไม่เลื่อนข้าง */}
      <div className="mt-4 overflow-x-auto">
        <table className="border-separate border-spacing-0.5 text-xs">
          <caption className="sr-only">จำนวนออเดอร์แยกตามวันและชั่วโมง</caption>
          <thead>
            <tr>
              <th scope="col" className="w-9">
                <span className="sr-only">วัน</span>
              </th>
              {hours.map((hour) => (
                <th key={hour} scope="col" className="min-w-7 font-normal text-gray-500 tabular-nums">
                  {hour}
                </th>
              ))}
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
                  return (
                    <td
                      key={hour}
                      title={`${DAY_FULL[day]} ${hourRange(hour)} · ${count} ออเดอร์`}
                      className={`h-7 min-w-7 rounded text-center tabular-nums ${heatClass(count, max)} ${
                        count / max > 0.5 ? 'font-semibold text-white' : 'text-gray-700'
                      }`}
                    >
                      {count > 0 ? count : <span className="sr-only">0</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
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
