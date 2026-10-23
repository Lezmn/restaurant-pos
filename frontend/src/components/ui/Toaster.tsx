import { useEffect } from 'react'
import {
  DURATION_MS,
  DURATION_WITH_ACTION_MS,
  useToasts,
  type ToastItem,
} from './toast'

export function Toaster() {
  const toasts = useToasts((s) => s.toasts)

  return (
    // อยู่บนกลางจอ ไม่ชนแถบล่างและกล่องเรียกพนักงานที่อยู่ด้านล่าง
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 top-4 z-50 mx-auto flex max-w-md flex-col gap-2"
    >
      {toasts.map((t) => (
        <ToastRow key={t.id} item={t} />
      ))}
    </div>
  )
}

function ToastRow({ item }: Readonly<{ item: ToastItem }>) {
  const dismiss = useToasts((s) => s.dismiss)

  useEffect(() => {
    const ms = item.action ? DURATION_WITH_ACTION_MS : DURATION_MS
    const timer = setTimeout(() => dismiss(item.id), ms)
    return () => clearTimeout(timer)
  }, [item, dismiss])

  return (
    <div className="toast-in pointer-events-auto flex items-center justify-between gap-3 rounded-lg bg-black px-4 py-3 text-base text-white shadow-lg">
      <span>{item.message}</span>
      <div className="flex shrink-0 items-center gap-1">
        {item.action && (
          <button
            type="button"
            onClick={() => {
              item.action?.run()
              dismiss(item.id)
            }}
            className="min-h-10 rounded-md px-3 font-bold text-brand-100 transition hover:bg-white/10"
          >
            {item.action.label}
          </button>
        )}
        <button
          type="button"
          aria-label="ปิดข้อความ"
          onClick={() => dismiss(item.id)}
          className="flex h-10 w-10 items-center justify-center rounded-md text-white/80 transition hover:bg-white/10"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-4 w-4">
            <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}
