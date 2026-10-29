import { AlertSoundToggle } from '@/components/AlertSoundToggle'
import { CallStaffAlert } from '@/components/CallStaffAlert'
import { Toaster } from '@/components/ui/Toaster'
import { pageRoles } from '@/features/auth/permissions'
import { useAuth } from '@/features/auth/use-auth'
import { useStaffLiveEvents } from '@/features/live/hooks'
import { useTables } from '@/features/tables/hooks'
import { RESTAURANT_NAME } from '@/lib/config'
import { Role, TableStatus } from '@/types/enums'
import { useEffect, useState, type ReactNode } from 'react'
import { KitchenSoldOutButton } from '@/pages/employee/KitchenSoldOut'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'

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

function IconBag() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7">
      <path d="M5 8h14l-1.2 11.1a1 1 0 0 1-1 .9H7.2a1 1 0 0 1-1-.9z" strokeLinejoin="round" />
      <path d="M9 10V7a3 3 0 0 1 6 0v3" strokeLinecap="round" />
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

/** นาฬิกา + วันที่แบบ พ.ศ. (16:30 / พ. 29 ต.ค. 2569) — ตัวเข้มบนพื้นขาว ไม่ใช่ตัวขาวบนส้มอ่อนแบบเดิม */
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
  const date = now.toLocaleDateString('th-TH', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  return (
    <div className="hidden shrink-0 text-right leading-tight sm:block">
      <p className="text-lg font-bold text-text tabular-nums">{time}</p>
      <p className="text-xs font-semibold text-gray-600">{date}</p>
    </div>
  )
}

interface Tab {
  to: string
  label: string
  /** หัวข้อหน้าบน header */
  title: string
  icon: ReactNode
  roles: Role[]
}

const tabs: Tab[] = [
  { to: '/employee/order', label: 'คิวครัว', title: 'คิวครัว', icon: <IconChef />, roles: pageRoles.order },
  { to: '/employee/manage', label: 'เมนู/ของหมด', title: 'เมนูและของหมด', icon: <IconFolder />, roles: pageRoles.manage },
  { to: '/employee/check', label: 'รับเงิน', title: 'รับเงิน', icon: <IconReceipt />, roles: pageRoles.check },
  { to: '/employee/tables', label: 'โต๊ะ', title: 'โต๊ะ', icon: <IconTable />, roles: pageRoles.tables },
  { to: '/employee/takeaway', label: 'กลับบ้าน', title: 'สั่งกลับบ้าน', icon: <IconBag />, roles: pageRoles.takeaway },
]

const roleAccount: Record<Role, string> = {
  [Role.ADMIN]: 'เจ้าของร้าน',
  [Role.KITCHEN]: 'บัญชีครัว',
  [Role.STAFF]: 'บัญชีหน้าร้าน',
}

export function EmployeeLayout() {
  const user = useAuth((s) => s.user)
  const signOut = useAuth((s) => s.signOut)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const onOrderPage = pathname.startsWith('/employee/order')
  const { data: tables } = useTables()
  // ต่อ socket ที่ layout จึงได้ event ทุกหน้าของพนักงาน (ครัว / Check / โต๊ะ / คำขอ)
  useStaffLiveEvents()

  const available =
    tables?.filter((t) => t.status === TableStatus.AVAILABLE).length ?? 0

  // แสดงเฉพาะหน้าที่ role นี้เข้าได้ — UI ไม่พาไปเจอสิ่งที่ทำไม่ได้ (เดิมโชว์ปุ่มจางที่กดไม่ได้ปนอยู่)
  const visibleTabs = tabs.filter((tab) => Boolean(user && tab.roles.includes(user.role)))
  const title = tabs.find((tab) => pathname.startsWith(tab.to))?.title ?? ''

  const logout = () => {
    signOut()
    navigate('/login')
  }

  return (
    <div className="flex min-h-dvh bg-staff-ground">
      {/* แถบนำทาง: แท็บเล็ตขึ้นไปเป็นแถบซ้ายสีเข้ม / มือถือเป็นแถบล่าง — ส้ม = แท็บที่อยู่ */}
      <nav
        aria-label="เมนูหลักพนักงาน"
        className="fixed inset-x-0 bottom-0 z-20 flex bg-rail pb-[env(safe-area-inset-bottom)] md:sticky md:top-0 md:h-dvh md:w-26 md:shrink-0 md:flex-col md:items-center md:gap-2 md:py-4 md:pb-4"
      >
        <span
          aria-hidden
          className="mb-4 hidden h-13 w-13 items-center justify-center rounded-2xl bg-brand-300 text-xl font-bold text-rail md:flex"
        >
          ตจ
        </span>
        {visibleTabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-xs font-semibold transition md:w-20 md:flex-none md:rounded-2xl md:py-3 md:text-[13px] [&>svg]:h-6 [&>svg]:w-6 ${
                isActive ? 'bg-brand-300 text-rail' : 'text-rail-text hover:bg-white/10'
              }`
            }
          >
            {tab.icon}
            <span className="text-center leading-tight">{tab.label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          onClick={logout}
          className="flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-xs font-semibold text-rail-text transition hover:bg-white/10 md:mt-auto md:w-20 md:flex-none md:rounded-2xl md:py-3 md:text-[13px] [&>svg]:h-6 [&>svg]:w-6"
        >
          <IconLogout />
          <span>ออกจากระบบ</span>
        </button>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex min-h-19 flex-wrap items-center gap-x-4 gap-y-2 border-b-2 border-staff-line bg-white px-4 py-2 sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-brand-500 sm:text-[13px]">{RESTAURANT_NAME}</p>
            <h1 className="text-xl font-bold leading-tight text-text sm:text-2xl">{title}</h1>
          </div>

          {/* ปุ่มของหมด (เฉพาะหน้าครัว) อยู่บน header — กดได้ตลอดโดยไม่กินแถวเหนือบอร์ด */}
          {onOrderPage && <KitchenSoldOutButton />}

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <p className="hidden rounded-xl bg-staff-ground px-3 py-2 text-sm font-semibold text-gray-700 lg:block">
              จำนวนโต๊ะที่ว่าง <span className="font-bold text-text tabular-nums">{tables ? available : '—'}</span> โต๊ะ
            </p>
            <AlertSoundToggle />
            {/* ADMIN = เจ้าของร้าน มีหน้า Dashboard แยกอีกชุด (บัญชีผู้ใช้อยู่ในนั้นด้วย) */}
            {user?.role === Role.ADMIN && (
              <Link
                to="/owner"
                className="hidden min-h-11 items-center whitespace-nowrap rounded-xl border-2 border-brand-500 px-3 text-sm font-bold text-brand-500 transition hover:bg-brand-50 sm:flex"
              >
                Dashboard
              </Link>
            )}
            <Clock />
            {user && (
              <span
                title={user.name}
                className="hidden rounded-xl border-2 border-brand-75 bg-brand-50 px-3 py-2 text-sm font-bold text-brand-500 sm:block"
              >
                {roleAccount[user.role]}
              </span>
            )}
          </div>
        </header>

        <main className="flex-1 px-4 pt-4 pb-28 sm:px-6 md:pb-6">
          <Outlet />
        </main>
      </div>

      {/* GET /service-requests เป็น @Roles(ADMIN, STAFF) — ครัว mount แล้วจะยิงโดน 403 ทุก event */}
      {user && pageRoles.requests.includes(user.role) && <CallStaffAlert />}
      <Toaster />
    </div>
  )
}
