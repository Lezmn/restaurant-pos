import { formatBaht } from '@/lib/format'
import type { RevenuePoint } from '@/types/reports'
import { useId } from 'react'

const W = 640
const H = 260
const PAD = { top: 16, right: 12, bottom: 28, left: 48 }

/** ปัดเพดานแกน Y ขึ้นเป็นหลักสวย ๆ เพื่อให้เส้นกริดอ่านง่าย */
const niceMax = (value: number) => {
  if (value <= 0) return 100
  const step = 10 ** Math.floor(Math.log10(value)) / 2
  return Math.ceil(value / step) * step
}

/**
 * กราฟพื้นที่แบบง่าย เขียน SVG เอง — ข้อมูลมีแค่ 7 จุด
 * ไม่คุ้มที่จะลง chart library ทั้งก้อนเพื่อกราฟเดียว
 */
export function TrendChart({ points }: { points: RevenuePoint[] }) {
  const gradientId = useId()

  if (points.length === 0) {
    return <p className="py-10 text-center text-sm text-gray-400">ไม่มีข้อมูล</p>
  }

  const max = niceMax(Math.max(...points.map((p) => p.revenue)))
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  const x = (i: number) =>
    PAD.left + (points.length === 1 ? innerW / 2 : (innerW * i) / (points.length - 1))
  const y = (value: number) => PAD.top + innerH - (innerH * value) / max

  const line = points.map((p, i) => `${x(i)},${y(p.revenue)}`).join(' ')
  const area = `${PAD.left},${PAD.top + innerH} ${line} ${x(points.length - 1)},${PAD.top + innerH}`

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(max * t))

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`แนวโน้มรายรับ ${points.length} วัน สูงสุด ${formatBaht(max)}`}
      className="h-auto w-full"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-brand-300)" stopOpacity="0.45" />
          <stop offset="100%" stopColor="var(--color-brand-300)" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* เส้นกริด + ป้ายแกน Y */}
      {ticks.map((tick) => (
        <g key={tick}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(tick)}
            y2={y(tick)}
            stroke="currentColor"
            strokeWidth="1"
            className="text-gray-200"
          />
          <text
            x={PAD.left - 8}
            y={y(tick) + 4}
            textAnchor="end"
            className="fill-gray-400 text-xs"
          >
            {tick.toLocaleString('th-TH')}
          </text>
        </g>
      ))}

      <polygon points={area} fill={`url(#${gradientId})`} />
      <polyline
        points={line}
        fill="none"
        stroke="var(--color-brand-400)"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {points.map((p, i) => (
        <g key={p.date}>
          <circle
            cx={x(i)}
            cy={y(p.revenue)}
            r="4"
            fill="white"
            stroke="var(--color-brand-400)"
            strokeWidth="2"
          />
          <text
            x={x(i)}
            y={H - 8}
            textAnchor="middle"
            className="fill-gray-500 text-xs"
          >
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  )
}
