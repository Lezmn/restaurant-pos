import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * กันจอขาว — ถ้า component ไหน throw ตอน render จะแสดงหน้านี้แทน
 * (React ไม่มี hook สำหรับดักตรงนี้ ต้องเป็น class component เท่านั้น)
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // ตอนต่อ error tracking จริง (Sentry ฯลฯ) ให้ส่งตรงนี้
    console.error('ErrorBoundary caught:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <span aria-hidden className="text-4xl">
          ⚠️
        </span>
        <h1 className="text-xl font-bold text-ink">เกิดข้อผิดพลาด</h1>
        <p className="max-w-md text-sm text-gray-600">
          ระบบทำงานผิดพลาดโดยไม่คาดคิด ลองโหลดหน้าใหม่อีกครั้ง
          ถ้ายังไม่หายกรุณาแจ้งพนักงาน
        </p>

        <pre className="max-w-md overflow-x-auto rounded-lg bg-gray-100 p-3 text-left text-xs text-gray-600">
          {error.message}
        </pre>

        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-full bg-brand-300 px-6 py-2.5 text-sm font-bold text-white"
        >
          โหลดหน้าใหม่
        </button>
      </div>
    )
  }
}
