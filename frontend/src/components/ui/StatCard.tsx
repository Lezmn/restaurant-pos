import type { ReactNode } from 'react'

/**
 * ขอบ 2px ใช้สีโทนตรง ๆ แต่ตัวเลขต้องใช้เวอร์ชัน ink ที่ผ่าน contrast บนขาว
 * (brand-300 ได้ 2.3:1, olive 2.2:1, success 3:1 — อ่านไม่ออกเมื่อเป็นตัวเลขเงิน)
 */
const tones = {
  brand: 'border-brand-500 text-brand-500',
  /** เงินสด — ส้มสดทั้งขอบและตัวเลขตามดีไซน์ (ตัวเลขใหญ่หนา 24px+ จึงพอรับ contrast ต่ำได้) */
  orange: 'border-brand-300 text-brand-300',
  purple: 'border-status-done text-status-done-ink',
  promptpay: 'border-promptpay text-promptpay',
  olive: 'border-accent-olive text-accent-olive-ink',
  green: 'border-success text-success-ink',
  red: 'border-danger text-danger-ink',
  /** ยังไม่มีข้อมูลให้ตัดสิน — ไม่ใช่ทั้งดีและไม่ดี */
  neutral: 'border-gray-300 text-gray-700',
} as const

export type StatTone = keyof typeof tones

/** การ์ดตัวเลขแบบขอบหนา 2px ตามภาษาการออกแบบของไฟล์ Figma */
export function StatCard({
  label,
  value,
  tone = 'brand',
  icon,
  hint,
  size = 'md',
  className = '',
}: Readonly<{
  label: string
  value: string
  tone?: StatTone
  icon?: ReactNode
  /** บรรทัดเล็กใต้ตัวเลข เช่น "8 บิล" */
  hint?: ReactNode
  size?: 'md' | 'lg'
  /** ใช้วางในกริด เช่น col-span */
  className?: string
}>) {
  return (
    <div className={`rounded-xl border-2 bg-white p-4 ${tones[tone]} ${className}`}>
      <div className="flex items-center gap-2">
        {icon}
        <p
          className={`font-semibold text-black ${size === 'lg' ? 'text-lg' : 'text-sm'}`}
        >
          {label}
        </p>
      </div>
      <p
        className={`mt-2 font-bold tabular-nums ${size === 'lg' ? 'text-3xl' : 'text-2xl'}`}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-sm text-gray-600">{hint}</p>}
    </div>
  )
}
