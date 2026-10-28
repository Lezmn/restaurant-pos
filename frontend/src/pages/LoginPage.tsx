import chefImage from '@/assets/login-chef.webp'
import { useLogin } from '@/features/auth/hooks'
import { useAuth } from '@/features/auth/use-auth'
import { RESTAURANT_NAME } from '@/lib/config'
import { Role } from '@/types/enums'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

/** dev = โชว์บัญชีตัวอย่างเสมอ · build จริงต้องตั้ง VITE_SHOW_DEMO_LOGIN=true เอง (เช่น เครื่องเดโมส่งอาจารย์) */
const SHOW_DEMO_LOGIN =
  import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_LOGIN === 'true'

/** ช่องกรอกตามดีไซน์ Desktop-1 — ขอบเทาเข้ม มุมโค้งมาก · จอใหญ่ขยายตามสัดส่วนใน Figma */
const inputClass =
  'mt-2 w-full rounded-xl border border-gray-500 bg-white px-4 py-2.5 text-sm text-black outline-none transition placeholder:text-gray-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-75 lg:py-3 lg:text-base xl:rounded-2xl xl:px-5 xl:py-4'

/** ส้อม-มีดสีน้ำตาลหน้าชื่อร้าน */
function IconCutlery() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-6 w-6 shrink-0 lg:h-7 lg:w-7 xl:h-8 xl:w-8">
      <path d="M6 2a.75.75 0 0 1 .75.75V7h.75V2.75a.75.75 0 0 1 1.5 0V7h.75V2.75a.75.75 0 0 1 1.5 0V8a3 3 0 0 1-2.25 2.9V21a1 1 0 1 1-2 0V10.9A3 3 0 0 1 5.25 8V2.75A.75.75 0 0 1 6 2z" />
      <path d="M17 2c-2 1.2-3 3.6-3 7v4h2v8a1 1 0 1 0 2 0V2.8A.8.8 0 0 0 17 2z" />
    </svg>
  )
}

/**
 * หน้า login เดียวใช้ได้ทุก role ตามดีไซน์ Desktop-1:
 * ฟอร์มชิดซ้าย ภาพเชฟเต็มความสูงทางขวา (ซ่อนบนจอเล็ก ให้ฟอร์มเต็มจอ)
 */
export function LoginPage({
  redirectTo,
  allowedRoles,
  hint,
}: Readonly<{
  redirectTo: string
  /** ถ้าระบุ แล้ว role ไม่ตรง จะไม่ให้เข้าและเด้งออกทันที */
  allowedRoles?: Role[]
  hint: string
}>) {
  const user = useAuth((s) => s.user)
  const signOut = useAuth((s) => s.signOut)
  const navigate = useNavigate()
  const login = useLogin()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [denied, setDenied] = useState(false)

  // เจ้าของร้าน (ADMIN) เข้า Dashboard ก่อน — หน้าพนักงานยังเข้าได้จากปุ่มในหน้า Dashboard
  const homeFor = (role: Role) => (role === Role.ADMIN ? '/owner' : redirectTo)

  if (user && (!allowedRoles || allowedRoles.includes(user.role))) {
    return <Navigate to={homeFor(user.role)} replace />
  }

  return (
    <div className="relative flex min-h-dvh overflow-hidden bg-white">
      <div className="relative z-10 flex flex-1 items-center justify-center px-6 py-10 md:justify-start md:pl-[12%]">
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
                  navigate(homeFor(data.user.role))
                },
              },
            )
          }}
          // Figma: ฟอร์มกว้าง ~30% ของจอ — max-w-xs คงไว้บนจอเล็ก จอใหญ่ขยายตาม (1440px → 448px)
          className="w-full max-w-xs lg:max-w-sm xl:max-w-md"
        >
          <h1 className="mb-6 flex items-center gap-2 text-xl font-bold text-brand-400 lg:text-2xl xl:mb-8 xl:text-3xl">
            <IconCutlery />
            {RESTAURANT_NAME}
          </h1>

          <label className="block text-base font-bold text-black lg:text-lg xl:text-xl">
            <span>Username</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username *"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              className={inputClass}
            />
          </label>

          <label className="mt-5 block text-base font-bold text-black lg:text-lg xl:mt-6 xl:text-xl">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="password *"
              autoComplete="current-password"
              className={inputClass}
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
            className="mt-6 w-full rounded-lg border border-brand-400 bg-brand-100 py-2.5 text-sm font-bold text-black lg:py-3 lg:text-base xl:mt-8 xl:rounded-xl xl:py-4 xl:text-lg shadow-[0_3px_6px_rgba(0,0,0,0.2)] transition hover:bg-brand-200 disabled:opacity-50"
          >
            {login.isPending ? 'กำลังเข้าสู่ระบบ...' : 'Login'}
          </button>

          {/* รหัสผ่านตัวอย่างจาก seed — โชว์เฉพาะตอน dev (หรือเปิดเองตอนเดโม) ห้ามติดไปกับ build จริง */}
          {SHOW_DEMO_LOGIN && (
            <p className="mt-6 rounded-lg bg-brand-50 p-3 text-xs text-gray-600">
              บัญชีตัวอย่างจาก seed — รหัสผ่าน <b>ChangeMe123!</b>
              <br />
              {hint}
            </p>
          )}
        </form>
      </div>

      {/* ภาพประกอบเป็นของตกแต่ง — ชิดขวาล่าง สูงเต็มจอ */}
      <img
        src={chefImage}
        alt=""
        aria-hidden
        className="pointer-events-none hidden h-dvh w-auto max-w-[55%] shrink-0 self-end object-contain object-right-bottom md:block"
      />
    </div>
  )
}
