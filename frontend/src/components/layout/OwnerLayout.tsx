import { homeByRole } from '@/features/auth/permissions'
import { useAuth } from '@/features/auth/use-auth'
import { RESTAURANT_NAME } from '@/lib/config'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'

function IconDashboard() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </svg>
  )
}

/** กราฟแท่ง — รายงานเมนูขายดี */
function IconChart() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M4 20h16M7 16v-5M12 16V6M17 16v-8" strokeLinecap="round" />
    </svg>
  )
}

function IconMoney() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <circle cx="12" cy="12" r="9" />
      <path d="M14.5 9.5a2.5 2.5 0 0 0-2.5-1.5c-1.4 0-2.5.7-2.5 2s1.1 1.8 2.5 2 2.5.7 2.5 2-1.1 2-2.5 2a2.5 2.5 0 0 1-2.5-1.5M12 6.5v11" strokeLinecap="round" />
    </svg>
  )
}

function IconDrawer() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <rect x="3" y="11" width="18" height="9" rx="1.5" />
      <path d="M6 11V5.5A1.5 1.5 0 0 1 7.5 4h9A1.5 1.5 0 0 1 18 5.5V11M10 15.5h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconHistory() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" strokeLinecap="round" />
      <path d="M3 3.5V8h4.5M12 7.5V12l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconUsers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.5A6.5 6.5 0 0 1 21.5 20" strokeLinecap="round" />
    </svg>
  )
}

function IconChat() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-4 3v-3H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" strokeLinejoin="round" />
      <path d="M8 10h8M8 13h5" strokeLinecap="round" />
    </svg>
  )
}

function IconBack() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M10 6l-6 6 6 6M4 12h16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconLogout() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 8l4 4-4 4M14 12H4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const navItems = [
  { to: '/owner/dashboard', label: 'Dashboard', icon: <IconDashboard /> },
  { to: '/owner/finance', label: 'รายรับ-รายจ่าย', icon: <IconMoney /> },
  { to: '/owner/sales', label: 'เมนูขายดี', icon: <IconChart /> },
  { to: '/owner/cash-closes', label: 'ปิดยอดเงินสด', icon: <IconDrawer /> },
  { to: '/owner/audit', label: 'ประวัติการทำรายการ', icon: <IconHistory /> },
  { to: '/owner/line', label: 'แจ้งเตือน LINE', icon: <IconChat /> },
  { to: '/owner/users', label: 'บัญชีผู้ใช้', icon: <IconUsers /> },
]

/** หน้าตาเดียวกันทุกปุ่มใน sidebar (เมนู / กลับหน้าพนักงาน / Logout) — ใส่ flex หรือ hidden เองตามจอ */
// พื้น brand-50 + ตัว brand-500 เต็ม (5.3:1) — เดิมพื้น brand-100/70 + ตัว /80 ได้แค่ 2.9:1 · สูง 44px ตามเป้ากดของระบบ
const navItemBase = 'min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition'
const navItemClass = `${navItemBase} text-brand-500 hover:bg-brand-75/60`
const navItemActiveClass = `${navItemBase} bg-brand-500 text-white`

export function OwnerLayout() {
  const user = useAuth((s) => s.user)
  const signOut = useAuth((s) => s.signOut)
  const navigate = useNavigate()

  const handleSignOut = () => {
    signOut()
    navigate('/login')
  }

  return (
    <div className="flex min-h-dvh flex-col bg-white lg:flex-row">
      {/* จอใหญ่: sidebar ซ้ายตามดีไซน์ / จอเล็ก: แถบบนเลื่อนแนวนอน */}
      <aside className="flex shrink-0 flex-col border-b border-brand-75 bg-brand-50 lg:min-h-dvh lg:w-56 lg:border-r lg:border-b-0">
        <div className="flex items-center gap-2 px-4 py-4">
          <p className="min-w-0 text-lg leading-tight font-bold text-balance text-brand-500">{RESTAURANT_NAME}</p>
          {/* จอเล็ก: แถบเมนูเลื่อนแนวนอน ปุ่มท้ายแถวจะหลุดจอ — วางปุ่มกลับไว้แถวชื่อร้านให้เห็นตลอด */}
          {user && (
            <Link
              to={homeByRole[user.role]}
              className={`ml-auto flex lg:hidden ${navItemClass}`}
            >
              <IconBack />
              <span>หน้าพนักงาน</span>
            </Link>
          )}
        </div>

        <nav className="flex gap-2 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex ${isActive ? navItemActiveClass : navItemClass}`
              }
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}

          {/* กลับไปหน้าทำงานของร้าน (คิวครัว/เช็คบิล/โต๊ะ) — ฝั่งพนักงานมีปุ่ม Dashboard มาที่นี่อยู่แล้ว */}
          {user && (
            <Link
              to={homeByRole[user.role]}
              className={`hidden lg:flex ${navItemClass}`}
            >
              <IconBack />
              <span>กลับหน้าพนักงาน</span>
            </Link>
          )}

          <button
            type="button"
            onClick={handleSignOut}
            className={`flex lg:hidden ${navItemClass}`}
          >
            <IconLogout />
            <span>Logout</span>
          </button>
        </nav>

        <div className="hidden px-3 pb-4 lg:block">
          {user && (
            <p className="px-3 pb-2 text-xs text-brand-500">
              {user.name} · {user.role}
            </p>
          )}
          <button
            type="button"
            onClick={handleSignOut}
            className={`flex w-full ${navItemClass}`}
          >
            <IconLogout />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-x-auto px-4 py-5 sm:px-6">
        <Outlet />
      </main>
    </div>
  )
}
