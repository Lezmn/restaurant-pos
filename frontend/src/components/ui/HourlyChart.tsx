import { formatBaht } from '@/lib/format'
import { niceStep } from '@/lib/chart'

const TICKS = 4
/** ช่วงชั่วโมงขั้นต่ำที่แสดง (เวลาเปิดร้านทั่วไป) — มีบิลนอกช่วงนี้จะขยายให้เอง */
const OPEN_HOUR = 10
const CLOSE_HOUR = 21

/**
 * รายรับรายชั่วโมงของวันนี้ แบบแท่ง — ทำจากเวลารับเงินของแต่ละบิล ไม่ต้องเรียก API เพิ่ม
 * ชั่วโมงปัจจุบันเป็นแท่งเข้มและมีป้าย "ตอนนี้"
 */
export function HourlyChart({
  payments,
  now,
}: Readonly<{
  payments: { amount: number; paidAt: string }[]
  /** เวลาปัจจุบัน (ms) — ใช้หาชั่วโมงปัจจุบัน */
  now: number
}>) {
  const byHour = new Map<number, number>()
  for (const p of payments) {
    const hour = new Date(p.paidAt).getHours()
    byHour.set(hour, (byHour.get(hour) ?? 0) + p.amount)
  }

  const nowHour = new Date(now).getHours()
  const saleHours = [...byHour.keys()]
  const start = Math.min(OPEN_HOUR, ...saleHours)
  const end = Math.max(CLOSE_HOUR, nowHour, ...saleHours)
  const hours = Array.from({ length: end - start + 1 }, (_, i) => start + i)

  const peak = Math.max(0, ...byHour.values())
  const step = niceStep(peak)
  const max = step * TICKS
  const ticks = Array.from({ length: TICKS + 1 }, (_, i) => step * i)
  const peakHour = peak > 0 ? hours.find((h) => byHour.get(h) === peak) : undefined
  // จอแคบ 12+ แท่งใส่ป้ายทุกชั่วโมงไม่พอที่ — เว้นชั่วโมงเว้นชั่วโมง แต่ชั่วโมงปัจจุบันมีป้ายเสมอ
  const labelEvery = hours.length > 10 ? 2 : 1
  const pct = (value: number) => `${(value / max) * 100}%`

  return (
    <figure className="m-0">
      <div className="flex gap-2">
        {/* แกน Y */}
        <div aria-hidden className="relative h-56 w-12 shrink-0">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-0 translate-y-1/2 text-xs text-gray-500 tabular-nums"
              style={{ bottom: pct(tick) }}
            >
              {tick.toLocaleString('th-TH')}
            </span>
          ))}
        </div>

        <div className="relative h-56 min-w-0 flex-1">
          {ticks.map((tick) => (
            <div
              key={tick}
              aria-hidden
              className="absolute inset-x-0 border-t border-line"
              style={{ bottom: pct(tick) }}
            />
          ))}

          <div aria-hidden className="absolute inset-0 flex items-end gap-0.5 sm:gap-1">
            {hours.map((h) => {
              const value = byHour.get(h) ?? 0
              const current = h === nowHour
              return (
                <div key={h} className="relative flex h-full flex-1 items-end justify-center">
                  {value > 0 && (
                    <div
                      title={`${pad(h)}:00–${pad(h)}:59 ${formatBaht(value)}`}
                      className={`w-full max-w-8 rounded-t-sm ${current ? 'bg-brand-500' : 'bg-brand-400'}`}
                      style={{ height: pct(value) }}
                    />
                  )}
                  {h === peakHour && (
                    <span
                      className="absolute -translate-y-1.5 text-xs font-bold whitespace-nowrap text-black tabular-nums"
                      style={{ bottom: pct(value) }}
                    >
                      {formatBaht(value)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          {peak === 0 && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-gray-600">
              ยังไม่มีรายรับวันนี้
            </p>
          )}
        </div>
      </div>

      {/* แกน X */}
      <div aria-hidden className="ml-14 flex h-5 gap-0.5 sm:gap-1">
        {hours.map((h, i) => {
          const current = h === nowHour
          const show = current || (i % labelEvery === 0 && Math.abs(h - nowHour) > 1)
          return (
            <span
              key={h}
              className={`flex-1 pt-1 text-center text-xs whitespace-nowrap tabular-nums ${
                current ? 'font-bold text-black' : 'text-gray-500'
              }`}
            >
              {show ? (current ? 'ตอนนี้' : `${h}`) : ''}
            </span>
          )
        })}
      </div>

      <figcaption className="sr-only">
        รายรับวันนี้แยกตามชั่วโมง
        <ul>
          {hours
            .filter((h) => (byHour.get(h) ?? 0) > 0)
            .map((h) => (
              <li key={h}>
                {pad(h)}:00 ถึง {pad(h)}:59 {formatBaht(byHour.get(h) ?? 0)}
              </li>
            ))}
        </ul>
      </figcaption>
    </figure>
  )
}

const pad = (n: number) => String(n).padStart(2, '0')
