import { formatBaht } from '@/lib/format'
import type { RevenuePoint } from '@/types/reports'
import { niceStep } from '@/lib/chart'
import { useId } from 'react'

const TICKS = 4
/** เว้นซ้าย/ขวาในพื้นที่กราฟ (%) ไม่ให้จุดแรก/สุดท้ายและป้ายชิดขอบ */
const INSET_X = 5
const INSET_TOP = 12


/**
 * กราฟพื้นที่แบบง่าย เขียน SVG เอง — ข้อมูลมีแค่ 7 จุด
 * ไม่คุ้มที่จะลง chart library ทั้งก้อนเพื่อกราฟเดียว
 *
 * SVG ยืดตามกล่อง (preserveAspectRatio="none") ส่วนป้ายและจุดเป็น HTML วางทับ
 * ตัวหนังสือจึงคงที่ 12px ทุกขนาดจอ (เดิมย่อตาม viewBox จนเหลือ ~6px บนมือถือ)
 */
export function TrendChart({ points }: Readonly<{ points: RevenuePoint[] }>) {
  const gradientId = useId()

  if (points.length === 0) {
    return <p className="py-10 text-center text-sm text-gray-500">ไม่มีข้อมูล</p>
  }

  const peak = Math.max(...points.map((p) => p.revenue))
  const step = niceStep(peak)
  const max = step * TICKS
  const ticks = Array.from({ length: TICKS + 1 }, (_, i) => step * i)
  const last = points.length - 1
  const today = points[last]
  const dense = points.length > 14
  // 30 วันใส่ป้ายทุกจุดไม่พอที่ — แสดงทุก N วันนับถอยจากวันนี้ ให้ "วันนี้" มีป้ายเสมอ
  const labelEvery = dense ? Math.ceil(points.length / 7) : 1
  const showLabel = (i: number) => (last - i) % labelEvery === 0

  // พิกัดเป็น % ของพื้นที่กราฟ ใช้ร่วมกันทั้ง SVG และป้าย HTML
  const x = (i: number) =>
    points.length === 1 ? 50 : INSET_X + ((100 - INSET_X * 2) * i) / last
  const y = (value: number) => INSET_TOP + (100 - INSET_TOP) * (1 - value / max)

  const line = points.map((p, i) => `${x(i)},${y(p.revenue)}`).join(' ')
  const area = `${x(0)},100 ${line} ${x(last)},100`

  return (
    <figure className="m-0">
      <div className="flex gap-2">
        {/* แกน Y */}
        <div aria-hidden className="relative h-56 w-12 shrink-0">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-0 -translate-y-1/2 text-xs text-gray-500 tabular-nums"
              style={{ top: `${y(tick)}%` }}
            >
              {tick.toLocaleString('th-TH')}
            </span>
          ))}
        </div>

        <div className="relative h-56 min-w-0 flex-1">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden
            className="absolute inset-0 h-full w-full overflow-visible"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-brand-300)" stopOpacity="0.4" />
                <stop offset="100%" stopColor="var(--color-brand-300)" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {ticks.map((tick) => (
              <line
                key={tick}
                x1="0"
                x2="100"
                y1={y(tick)}
                y2={y(tick)}
                stroke="var(--color-line)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <polygon points={area} fill={`url(#${gradientId})`} />
            <polyline
              points={line}
              fill="none"
              stroke="var(--color-brand-400)"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {/* จุดข้อมูล — วันนี้ (จุดสุดท้าย) ใหญ่กว่าและมีป้ายยอด */}
          {points.map((p, i) => (
            <span
              key={p.date}
              aria-hidden
              title={`${p.label} ${formatBaht(p.revenue)}`}
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${dotSize(i === last, dense)}`}
              style={{ left: `${x(i)}%`, top: `${y(p.revenue)}%` }}
            />
          ))}
          <span
            aria-hidden
            className="absolute -translate-x-full -translate-y-[calc(100%+10px)] rounded-md bg-white px-1.5 text-xs font-bold whitespace-nowrap text-black tabular-nums"
            style={{ left: `${x(last)}%`, top: `${y(today.revenue)}%` }}
          >
            {formatBaht(today.revenue)}
          </span>
        </div>
      </div>

      {/* แกน X */}
      <div aria-hidden className="relative ml-14 h-5">
        {points.map((p, i) =>
          showLabel(i) && (
          <span
            key={p.date}
            className={`absolute top-1 -translate-x-1/2 text-xs whitespace-nowrap ${
              i === last ? 'font-bold text-black' : 'text-gray-500'
            }`}
            style={{ left: `${x(i)}%` }}
          >
            {i === last ? 'วันนี้' : p.label}
          </span>
          ),
        )}
      </div>

      {/* ข้อมูลรายวันสำหรับโปรแกรมอ่านหน้าจอ แทนการอ่านกราฟ */}
      <figcaption className="sr-only">
        รายรับ {points.length} วัน สูงสุด {formatBaht(peak)} วันนี้ {formatBaht(today.revenue)}
        <ul>
          {points.map((p) => (
            <li key={p.date}>
              {p.label} {formatBaht(p.revenue)}
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  )
}

function dotSize(isLast: boolean, dense: boolean) {
  if (isLast) return 'h-3.5 w-3.5 border-2 border-brand-400 bg-brand-500'
  return dense ? 'h-1.5 w-1.5 bg-brand-400' : 'h-2.5 w-2.5 border-2 border-brand-400 bg-white'
}
