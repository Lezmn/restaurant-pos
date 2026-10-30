import { ErrorScreen } from '@/components/ErrorScreen'
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
    // หน้าตาเดียวกับ errorElement ของ router — ตัวนี้จับเฉพาะที่พังนอก router (เช่น provider ชั้นบน)
    return <ErrorScreen error={error} />
  }
}
