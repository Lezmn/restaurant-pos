import { MAX_ITEM_QUANTITY } from '@/lib/config'

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = MAX_ITEM_QUANTITY,
  size = 'md',
}: {
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
  size?: 'sm' | 'md'
}) {
  const button =
    size === 'sm'
      ? 'h-7 w-7 text-base'
      : 'h-9 w-9 text-lg sm:h-10 sm:w-10 sm:text-xl'

  return (
    <div className="flex items-center gap-2.5 rounded-full bg-white px-1.5 py-1 shadow-sm">
      <button
        type="button"
        aria-label="ลดจำนวน"
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        className={`${button} flex items-center justify-center rounded-full bg-minus font-bold text-white transition disabled:opacity-40`}
      >
        −
      </button>

      <span className="min-w-6 text-center text-sm font-bold text-qty tabular-nums sm:text-base">
        {value}
      </span>

      <button
        type="button"
        aria-label="เพิ่มจำนวน"
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        className={`${button} flex items-center justify-center rounded-full bg-plus font-bold text-white transition disabled:opacity-40`}
      >
        +
      </button>
    </div>
  )
}
