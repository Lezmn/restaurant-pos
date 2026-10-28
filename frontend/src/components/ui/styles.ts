/**
 * คลาสปุ่มและช่องกรอกกลาง — ทุกกล่อง/หน้าใช้ชุดเดียวกัน (ดู DESIGN.md › Components)
 *
 * primary ใช้ brand-500 เพราะตัวขาวบน brand-300/400 ได้แค่ 2.3:1 / 4.4:1 ไม่ผ่าน AA
 */
const buttonBase =
  'inline-flex items-center justify-center gap-2 rounded-lg font-bold transition disabled:cursor-not-allowed disabled:opacity-50'

const buttonVariants = {
  primary: 'bg-brand-500 text-white hover:brightness-90',
  secondary: 'border-2 border-gray-400 bg-white text-black hover:bg-gray-50',
  outline: 'border-2 border-brand-400 bg-white text-brand-500 hover:bg-brand-50',
  danger: 'bg-danger-ink text-white hover:brightness-90',
  'danger-outline':
    'border-2 border-danger bg-white text-danger-ink hover:bg-danger/5',
} as const

const buttonSizes = {
  sm: 'min-h-11 px-3 text-sm',
  md: 'min-h-11 px-4 text-sm',
  lg: 'min-h-12 px-5 text-base',
} as const

export type ButtonVariant = keyof typeof buttonVariants

export const button = (
  variant: ButtonVariant,
  size: keyof typeof buttonSizes = 'md',
) => `${buttonBase} ${buttonVariants[variant]} ${buttonSizes[size]}`

export const fieldLabel = 'text-sm font-semibold text-gray-700'

/** ช่องเลือกเดือน/วัน/ตัวกรองบนแถบเครื่องมือ — ไม่เต็มแถว ไม่มี mt-1 แต่สูง 44px และโฟกัสเหมือน field */
export const fieldCompact =
  'min-h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-400/25'

export const field =
  'mt-1 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-base text-field-text outline-none transition placeholder:text-gray-500 focus:border-brand-400 focus:ring-2 focus:ring-brand-400/25'
