import { CallStaffAlert } from '@/components/CallStaffAlert'
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
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7">
      <path d="M7 21h10v-6H7z" strokeLinejoin="round" />
      <path d="M6 15a4 4 0 0 1-1-7.9A3.5 3.5 0 0 1 12 4a3.5 3.5 0 0 1 7 3.1A4 4 0 0 1 18 15" strokeLinejoin="round" />
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
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" strokeLinejoin="round" />
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
    <div className="flex items-center gap-2 rounded-2xl bg-brand-200 px-3 py-2 text-white sm:gap-3 sm:px-4">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-6 w-6 shrink-0 sm:h-8 sm:w-8">
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9.5V13l2.5 1.5M5 4 3 6M19 4l2 2" strokeLinecap="round" />
      </svg>
      <div className="text-right leading-tight">
        <p className="text-sm font-bold sm:text-base">{time}</p>
        <p className="text-sm font-bold sm:text-base">{date}</p>
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

  // ดีไซน์โชว์ปุ่มครบทุกอัน — ปุ่มที่ role นี้ไม่มีสิทธิ์จะแสดงแบบจาง ๆ และกดไม่ได้
  const canOpen = (tab: Tab) => Boolean(user && tab.roles.includes(user.role))

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
            {/* หน้าโต๊ะ/QR ไม่ได้อยู่ในแถบล่าง 4 ปุ่มตามดีไซน์ จึงวางทางเข้าไว้ที่ header */}
            {user && pageRoles.tables.includes(user.role) && (
              <Link
                to="/employee/tables"
                title="เปิดโต๊ะและสร้าง QR ให้ลูกค้า"
                className="rounded-lg border-2 border-brand-400 px-3 py-2 text-sm font-bold text-brand-400 transition hover:bg-brand-50"
              >
                โต๊ะ / QR
              </Link>
            )}

            {/* ADMIN = เจ้าของร้าน มีหน้า Dashboard แยกอีกชุด */}
            {user?.role === Role.ADMIN && (
              <Link
                to="/owner"
                className="hidden rounded-lg border-2 border-brand-400 px-3 py-2 text-sm font-bold text-brand-400 transition hover:bg-brand-50 sm:block"
              >
                Dashboard
              </Link>
            )}
            <Clock />
          </div>
        </div>

        <p className="mt-3 text-right text-base font-bold text-black sm:text-xl">
          จำนวนโต๊ะที่ว่าง {available} โต๊ะ
          {user && (
            <span className="ml-3 text-sm font-normal text-gray-500">
              ({user.name} · {user.role})
            </span>
          )}
        </p>
      </header>

      <main className="flex-1 px-4 pt-4 pb-28 sm:px-8">
        <Outlet />
      </main>

      <CallStaffAlert />

      {/* แถบล่าง 4 ปุ่มตามดีไซน์ — active เป็นบล็อกส้มเต็ม */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)]">
        {tabs.map((tab) => {
          const iconClass =
            '[&>svg]:h-6 [&>svg]:w-6 sm:[&>svg]:h-8 sm:[&>svg]:w-8'
          const base =
            'flex flex-1 items-center justify-center gap-2 py-4 text-lg font-bold transition sm:gap-3 sm:text-2xl'

          if (!canOpen(tab)) {
            return (
              <button
                key={tab.to}
                type="button"
                disabled
                aria-disabled="true"
                title={`ต้องเป็น ${tab.roles.join(' หรือ ')} จึงจะเข้าหน้านี้ได้`}
                className={`${base} cursor-not-allowed text-gray-300`}
              >
                <span className={`text-gray-300 ${iconClass}`}>{tab.icon}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            )
          }

          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                `${base} ${
                  isActive
                    ? 'bg-brand-300 text-white'
                    : 'text-black hover:bg-brand-50'
                }`
              }
            >
              <span className={`text-brand-400 ${iconClass}`}>{tab.icon}</span>
              <span className="hidden sm:inline">{tab.label}</span>
            </NavLink>
          )
        })}

        <button
          type="button"
          onClick={() => {
            signOut()
            navigate('/login')
          }}
          className="flex flex-1 items-center justify-center gap-2 py-4 text-lg font-bold text-black transition hover:bg-brand-50 sm:gap-3 sm:text-2xl"
        >
          <span className="text-brand-400">
            <IconLogout />
          </span>
          <span className="hidden sm:inline">Logout</span>
        </button>
      </nav>
    </div>
  )
}
