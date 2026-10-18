import { homeByRole } from '@/features/auth/permissions'
import { useAuth } from '@/features/auth/use-auth'
import { Navigate } from 'react-router-dom'

/** หน้าแรกหลัง login — ส่งไปหน้าที่ role นั้นเข้าได้ (ครัวเข้า Check ไม่ได้ เป็นต้น) */
export function EmployeeHome() {
  const user = useAuth((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={homeByRole[user.role]} replace />
}
