import { useAuth } from '@/features/auth/use-auth'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'

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
  { to: '/owner/cash-closes', label: 'ปิดยอดเงินสด', icon: <IconDrawer /> },
]

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
      <aside className="flex shrink-0 flex-col bg-brand-100/70 lg:min-h-dvh lg:w-56">
        <div className="flex items-center gap-2 px-4 py-4">
          <span aria-hidden className="text-xl text-brand-400">
            🍴
          </span>
          <p className="text-lg font-bold text-brand-400">ร้านอาหาร</p>
        </div>

        <nav className="flex gap-2 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                  isActive
                    ? 'bg-white text-brand-500 shadow-sm'
                    : 'text-brand-500/80 hover:bg-white/50'
                }`
              }
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}

          <button
            type="button"
            onClick={handleSignOut}
            className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-brand-500/80 transition hover:bg-white/50 lg:hidden"
          >
            <IconLogout />
            <span>Logout</span>
          </button>
        </nav>

        <div className="hidden px-3 pb-4 lg:block">
          {user && (
            <p className="px-3 pb-2 text-xs text-brand-500/70">
              {user.name} · {user.role}
            </p>
          )}
          <button
            type="button"
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-brand-500/80 transition hover:bg-white/50"
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
