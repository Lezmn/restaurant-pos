import type { ReactNode } from 'react'

const tones = {
  brand: 'border-brand-500 text-brand-500',
  orange: 'border-brand-300 text-brand-300',
  purple: 'border-status-done text-status-done',
  olive: 'border-accent-olive text-accent-olive',
  green: 'border-success text-success',
  red: 'border-danger text-danger',
} as const

export type StatTone = keyof typeof tones

/** การ์ดตัวเลขแบบขอบหนา 2px ตามภาษาการออกแบบของไฟล์ Figma */
export function StatCard({
  label,
  value,
  tone = 'brand',
  icon,
  size = 'md',
}: {
  label: string
  value: string
  tone?: StatTone
  icon?: ReactNode
  size?: 'md' | 'lg'
}) {
  return (
    <div className={`rounded-xl border-2 bg-white p-4 ${tones[tone]}`}>
      <div className="flex items-center gap-2">
        {icon}
        <p
          className={`font-semibold text-black ${size === 'lg' ? 'text-lg' : 'text-sm'}`}
        >
          {label}
        </p>
      </div>
      <p
        className={`mt-2 font-bold ${size === 'lg' ? 'text-3xl' : 'text-2xl'}`}
      >
        {value}
      </p>
    </div>
  )
}
