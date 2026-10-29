import { ErrorScreen } from '@/components/ErrorScreen'
import { useEffect } from 'react'
import { useRouteError } from 'react-router-dom'

/**
 * errorElement ของ router — React Router จับ error ที่ throw ตอน render ในทุก route เอง
 * ไม่ส่งต่อไปถึง ErrorBoundary ชั้นนอก ถ้าไม่มีตัวนี้จะขึ้นหน้า "Unexpected Application Error!" ของ library
 * ไม่โหลดแบบ lazy — ตอนโหลดไฟล์หน้าไม่ได้ (เน็ตหลุด / deploy ใหม่) หน้านี้ต้องยังขึ้นได้
 */
export function RouteErrorPage() {
  const error = useRouteError()

  useEffect(() => {
    // ตอนต่อ error tracking จริง (Sentry ฯลฯ) ให้ส่งตรงนี้
    console.error('Route error:', error)
  }, [error])

  return <ErrorScreen error={error} />
}
