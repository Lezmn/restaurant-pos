import { CallStaffAlert } from '@/components/CallStaffAlert'
import { Toaster } from '@/components/ui/Toaster'
import { pageRoles } from '@/features/auth/permissions'
import { useAuth } from '@/features/auth/use-auth'
import { useStaffLiveEvents } from '@/features/live/hooks'
import { useTables } from '@/features/tables/hooks'
import { RESTAURANT_NAME } from '@/lib/config'
import { Role, TableStatus } from '@/types/enums'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'

function IconChef() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7">
      <path d="M12 3a4.5 4.5 0 0 0-4.2 2.9A4 4 0 0 0 6 13.7V17h12v-3.3a4 4 0 0 0-1.8-7.8A4.5 4.5 0 0 0 12 3z" />
      <rect x="6" y="18.2" width="12" height="2.8" rx="0.8" />
    </svg>
  )
}

function IconReceipt() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7">
      <path d="M6 3h12v18l-3-1.6-3 1.6-3-1.6L6 21z" strokeLinejoin="round" />
      <path d="M9 8h6M9 12h6" strokeLinecap="round" />
    </svg>
  )
}

function IconFolder() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7">
      <path d="M3 18V6a1 1 0 0 1 1-1h5l2 2h7a1 1 0 0 1 1 1v2" strokeLinejoin="round" />
      <path d="M3 18l2.6-7.3a1 1 0 0 1 .9-.7H21a.6.6 0 0 1 .6.8L19 18.3a1 1 0 0 1-.9.7H4a1 1 0 0 1-1-1z" strokeLinejoin="round" />
    </svg>
  )
}

function IconTable() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7">
      <path d="M8 9h8M12 9v11M9.5 20h5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 4v16M3 14h3v6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 4v16M21 14h-3v6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconLogout() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7">
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 8l4 4-4 4M14 12H4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** นาฬิกา + วันที่แบบ พ.ศ. ตามดีไซน์ (16:30 / 20/7/2569) */
function Clock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  const time = now.toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  })
  const date = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear() + 543}`

  return (
    <div className="flex items-center gap-2 rounded-2xl bg-brand-50 px-3 py-2 text-brand-500 sm:gap-3 sm:px-4">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-6 w-6 shrink-0 sm:h-8 sm:w-8">
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9.5V13l2.5 1.5M5 4 3 6M19 4l2 2" strokeLinecap="round" />
      </svg>
      <div className="text-right leading-tight">
        <p className="text-sm font-bold tabular-nums sm:text-base">{time}</p>
        <p className="text-sm font-bold tabular-nums sm:text-base">{date}</p>
      </div>
    </div>
  )
}

interface Tab {
  to: string
  label: string
  icon: ReactNode
  roles: Role[]
}

const tabs: Tab[] = [
  { to: '/employee/order', label: 'Order', icon: <IconChef />, roles: pageRoles.order },
  { to: '/employee/check', label: 'Check', icon: <IconReceipt />, roles: pageRoles.check },
  { to: '/employee/manage', label: 'Manage', icon: <IconFolder />, roles: pageRoles.manage },
  { to: '/employee/tables', label: 'Table', icon: <IconTable />, roles: pageRoles.tables },
]

export function EmployeeLayout() {
  const user = useAuth((s) => s.user)
  const signOut = useAuth((s) => s.signOut)
  const navigate = useNavigate()
  const { data: tables } = useTables()
  // ต่อ socket ที่ layout จึงได้ event ทุกหน้าของพนักงาน (ครัว / Check / โต๊ะ / คำขอ)
  useStaffLiveEvents()

  const available =
    tables?.filter((t) => t.status === TableStatus.AVAILABLE).length ?? 0

  // โชว์เฉพาะแท็บที่ role นี้เข้าได้ (เช่น STAFF เหลือ Check กับ Table) — ไม่โชว์ปุ่มที่กดไม่ได้
  const visibleTabs = tabs.filter((tab) => user && tab.roles.includes(user.role))

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="px-4 pt-4 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2">
            <span aria-hidden className="text-2xl text-brand-400">
              🍴
            </span>
            <p className="truncate text-lg font-bold text-brand-400 sm:text-2xl">
              {RESTAURANT_NAME}
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {/* ADMIN = เจ้าของร้าน มีหน้า Dashboard แยกอีกชุด (บัญชีผู้ใช้อยู่ในนั้นด้วย) */}
            {user?.role === Role.ADMIN && (
              <Link
                to="/owner"
                className="hidden whitespace-nowrap rounded-lg border-2 border-brand-400 px-3 py-2 text-sm font-bold text-brand-500 transition hover:bg-brand-50 sm:block"
              >
                Dashboard
              </Link>
            )}
            <button
              type="button"
              onClick={() => {
                signOut()
                navigate('/login')
              }}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border-2 border-brand-400 px-3 py-2 text-sm font-bold text-brand-500 transition hover:bg-brand-50"
            >
              <span aria-hidden className="[&>svg]:h-5 [&>svg]:w-5">
                <IconLogout />
              </span>
              <span className="hidden sm:inline">ออกจากระบบ</span>
              <span className="sr-only sm:hidden">ออกจากระบบ</span>
            </button>
            <Clock />
          </div>
        </div>

        <p className="mt-3 text-right text-base font-bold text-black sm:text-xl">
          จำนวนโต๊ะที่ว่าง {tables ? available : '—'} โต๊ะ
          {user && (
            <span className="ml-3 text-sm font-normal text-gray-600">
              ({user.name} · {user.role})
            </span>
          )}
        </p>
      </header>

      <main className="flex-1 px-4 pt-4 pb-28 sm:px-8">
        <Outlet />
      </main>

      {/* GET /service-requests เป็น @Roles(ADMIN, STAFF) — ครัว mount แล้วจะยิงโดน 403 ทุก event */}
      {user && pageRoles.requests.includes(user.role) && <CallStaffAlert />}
      <Toaster />

      {/* แถบล่างตามดีไซน์ (Order · Check · Manage · Table) เฉพาะที่ role เข้าได้ — active เป็นบล็อกส้มเต็ม */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex bg-white shadow-[0_-4px_16px_rgba(0,0,0,0.08)] pb-[env(safe-area-inset-bottom)]">
        {visibleTabs.map((tab) => {
          const iconClass =
            '[&>svg]:h-6 [&>svg]:w-6 sm:[&>svg]:h-8 sm:[&>svg]:w-8'
          const base =
            // กว้าง 1/4 เสมอ (ช่องเดียวกับตอนมีครบ 4 ปุ่ม) ชิดซ้าย — role ที่มี 2 ปุ่มจะไม่ยืดเต็มแถบ ตามดีไซน์
            'flex w-1/4 items-center justify-center gap-2 py-4 text-lg font-bold transition sm:gap-3 sm:text-2xl'

          // active เป็นบล็อก brand-400 (ตัว 24px หนา = ตัวใหญ่ ผ่าน 3:1) ไอคอนต้องเป็นขาวด้วย ไม่งั้นกลืนกับพื้น
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              aria-label={tab.label}
              className={({ isActive }) =>
                `${base} ${
                  isActive
                    ? 'bg-brand-400 text-white [&_.nav-icon]:text-white'
                    : 'text-black hover:bg-brand-50'
                }`
              }
            >
              <span className={`nav-icon text-brand-500 ${iconClass}`}>{tab.icon}</span>
              <span className="hidden sm:inline">{tab.label}</span>
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}
