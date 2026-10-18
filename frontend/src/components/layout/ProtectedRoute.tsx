import { useAuth } from '@/features/auth/use-auth'
import type { Role } from '@/types/enums'
import { Navigate, Outlet, useLocation } from 'react-router-dom'

// กัน UI ไม่ให้เข้าหน้าที่ไม่มีสิทธิ์
// หมายเหตุ: นี่ไม่ใช่ security จริง — ตัวจริงคือ RolesGuard ฝั่ง NestJS
export function ProtectedRoute({
  roles,
  loginPath = '/login',
  fallbackPath = '/employee',
}: {
  roles?: Role[]
  /** หน้า login ที่จะเด้งไปเมื่อยังไม่ได้เข้าสู่ระบบ */
  loginPath?: string
  /** หน้าที่จะเด้งไปเมื่อ login แล้วแต่ role ไม่มีสิทธิ์ */
  fallbackPath?: string
}) {
  const user = useAuth((s) => s.user)
  const location = useLocation()

  if (!user) {
    return <Navigate to={loginPath} state={{ from: location }} replace />
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to={fallbackPath} replace />
  }

  return <Outlet />
}
