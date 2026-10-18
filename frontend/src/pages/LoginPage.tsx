import { useLogin } from '@/features/auth/hooks'
import { useAuth } from '@/features/auth/use-auth'
import type { Role } from '@/types/enums'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

/**
 * ใช้ร่วมกันทั้งหน้า login ของพนักงานและของเจ้าของร้าน
 * ดีไซน์แยกไว้เป็น 2 หน้า (Desktop-9 กับ Desktop-16) แต่หน้าตาเหมือนกัน
 * ต่างแค่ข้อความ ปลายทางหลัง login และ role ที่อนุญาต
 */
export function LoginPage({
  title,
  subtitle,
  redirectTo,
  allowedRoles,
  hint,
}: {
  title: string
  subtitle: string
  redirectTo: string
  /** ถ้าระบุ แล้ว role ไม่ตรง จะไม่ให้เข้าและเด้งออกทันที */
  allowedRoles?: Role[]
  hint: string
}) {
  const user = useAuth((s) => s.user)
  const signOut = useAuth((s) => s.signOut)
  const navigate = useNavigate()
  const login = useLogin()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [denied, setDenied] = useState(false)

  if (user && (!allowedRoles || allowedRoles.includes(user.role))) {
    return <Navigate to={redirectTo} replace />
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-brand-50 p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setDenied(false)
          login.mutate(
            { username, password },
            {
              onSuccess: (data) => {
                if (allowedRoles && !allowedRoles.includes(data.user.role)) {
                  // login ถูกต้องแต่ไม่ใช่บัญชีของหน้านี้ — ออกให้เลย ไม่ค้าง session ไว้
                  signOut()
                  setDenied(true)
                  return
                }
                navigate(redirectTo)
              },
            },
          )
        }}
        className="w-full max-w-sm rounded-xl border-2 border-brand-75 bg-white p-6 shadow-sm"
      >
        <div className="mb-6 flex items-center gap-2">
          <span aria-hidden className="text-2xl text-brand-400">
            🍴
          </span>
          <div>
            <h1 className="text-xl font-bold text-brand-400">{title}</h1>
            <p className="text-sm text-gray-500">{subtitle}</p>
          </div>
        </div>

        <label className="block text-sm font-semibold text-gray-700">
          ผู้ใช้
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-300"
          />
        </label>

        <label className="mt-4 block text-sm font-semibold text-gray-700">
          รหัสผ่าน
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-300"
          />
        </label>

        {login.isError && (
          <p role="alert" className="mt-3 text-sm font-semibold text-danger">
            {login.error.message}
          </p>
        )}

        {denied && (
          <p role="alert" className="mt-3 text-sm font-semibold text-danger">
            บัญชีนี้ไม่มีสิทธิ์เข้าหน้านี้
          </p>
        )}

        <button
          type="submit"
          disabled={login.isPending}
          className="mt-6 w-full rounded-lg bg-brand-300 py-2.5 text-sm font-bold text-white transition hover:bg-brand-400 disabled:opacity-50"
        >
          {login.isPending ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
        </button>

        <p className="mt-4 rounded-lg bg-brand-50 p-3 text-xs text-gray-600">
          บัญชีตัวอย่างจาก seed — รหัสผ่าน <b>ChangeMe123!</b>
          <br />
          {hint}
        </p>
      </form>
    </div>
  )
}
