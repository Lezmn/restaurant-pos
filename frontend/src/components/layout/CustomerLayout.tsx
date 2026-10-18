import { useCustomerLiveEvents } from '@/features/live/hooks'
import { useSession } from '@/features/public/hooks'
import { cartCount, useCart } from '@/features/public/cart-store'
import { ApiError } from '@/lib/api-client'
import { RESTAURANT_NAME } from '@/lib/config'
import { TableSessionStatus } from '@/types/enums'
import { useEffect, type ReactNode } from 'react'
import { NavLink, Outlet, useParams } from 'react-router-dom'

function IconHome() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5 md:h-6 md:w-6">
      <path d="M3 10.5 12 3l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 9.5V20h13V9.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconCart() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5 md:h-6 md:w-6">
      <path d="M3 4h2l2.2 10.5h9.9L19 7H6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9.5" cy="19" r="1.4" />
      <circle cx="17" cy="19" r="1.4" />
    </svg>
  )
}

function IconBill() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5 md:h-6 md:w-6">
      <path d="M6 3h12v18l-3-1.6-3 1.6-3-1.6L6 21z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 8h6M9 12h6" strokeLinecap="round" />
    </svg>
  )
}

function IconClock() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5 md:h-6 md:w-6">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

interface Tab {
  to: string
  label: string
  icon: ReactNode
  end: boolean
  badge?: number
}

/**
 * backend ตอบ 400 เมื่อ session ปิดบิลแล้ว/หมดอายุ (token ถูกต้องแต่ใช้ต่อไม่ได้)
 * ส่วน 404 คือ token มั่ว — แยกข้อความให้ลูกค้าเข้าใจว่าเกิดอะไร
 */
const isClosedSessionError = (error: unknown) =>
  error instanceof ApiError && error.status === 400

export function CustomerLayout() {
  const { token } = useParams()
  const { data: session, isPending, isError, error } = useSession(token)
  // สถานะอาหาร / ปิดบิล อัปเดตทันทีผ่าน socket ของ session นี้
  useCustomerLiveEvents(token)
  const lines = useCart((s) => s.lines)
  const bindToken = useCart((s) => s.bindToken)
  const clearCart = useCart((s) => s.clear)
  const count = cartCount(lines)

  // ปิดบิลแล้ว = ทั้งกรณี backend ตอบ 400 และกรณี session โหลดมาแล้วสถานะไม่ใช่ OPEN
  const isClosed =
    (isError && isClosedSessionError(error)) ||
    (session !== undefined && session.status !== TableSessionStatus.OPEN)

  // สแกน QR โต๊ะใหม่บนเครื่องเดิม ต้องไม่เอาตะกร้าโต๊ะเก่ามาด้วย
  useEffect(() => {
    if (token) bindToken(token)
  }, [token, bindToken])

  // โต๊ะปิดแล้ว ของในตะกร้าสั่งไม่ได้อีก — ล้างทิ้งกันค้างใน localStorage
  useEffect(() => {
    if (isClosed) clearCart()
  }, [isClosed, clearCart])

  // แคชเชียร์ปิดบิลไปแล้ว (ทั้งตอนเปิดหน้าใหม่ และระหว่างที่ลูกค้าเปิดหน้าค้างไว้)
  if (isClosed) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <span aria-hidden className="text-4xl">
          🧾
        </span>
        <h1 className="text-lg md:text-xl font-bold text-ink">โต๊ะนี้ปิดบิลแล้ว</h1>
        <p className="text-sm md:text-base text-gray-600">
          ขอบคุณที่มาใช้บริการ หากต้องการสั่งเพิ่มกรุณาเรียกพนักงานเพื่อเปิดโต๊ะใหม่
        </p>
      </div>
    )
  }

  // token ผิด — กันตั้งแต่หน้าแรก ไม่ให้สั่งของแล้วไปพังตอนกดส่ง
  if (isError) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <span aria-hidden className="text-4xl">
          🔒
        </span>
        <h1 className="text-lg md:text-xl font-bold text-ink">เปิดโต๊ะนี้ไม่ได้</h1>
        <p className="text-sm md:text-base text-gray-600">
          {error instanceof Error ? error.message : 'ไม่พบโต๊ะนี้'}
        </p>
        <p className="text-sm md:text-base text-gray-500">
          กรุณาสแกน QR ที่โต๊ะใหม่อีกครั้ง หรือเรียกพนักงาน
        </p>
      </div>
    )
  }

  const tabs: Tab[] = [
    { to: `/t/${token}`, label: 'เมนูอาหาร', icon: <IconHome />, end: true },
    { to: `/t/${token}/cart`, label: 'รายการที่เลือก', icon: <IconCart />, end: false, badge: count },
    { to: `/t/${token}/bill`, label: 'เช็คบิลอาหาร', icon: <IconBill />, end: false },
    { to: `/t/${token}/status`, label: 'สถานะอาหาร', icon: <IconClock />, end: false },
  ]

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="sticky top-0 z-20 border-b border-brand-75 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-md items-center gap-3 px-4 py-3 md:max-w-3xl lg:max-w-6xl">
          <span aria-hidden className="text-xl md:text-2xl text-brand-400">
            🍴
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm md:text-base font-bold text-brand-400 sm:text-base">
              {RESTAURANT_NAME}
            </p>
            <p className="text-xs md:text-sm text-gray-500">
              {isPending ? 'กำลังเปิดโต๊ะ...' : `โต๊ะ ${session?.tableName ?? '-'}`}
            </p>
          </div>

          {/* md ขึ้นไปย้าย nav มาไว้บน แล้วซ่อนแถบล่าง */}
          <nav className="hidden items-center gap-1 md:flex">
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  `relative flex items-center gap-2 rounded-full px-3 py-2 text-sm md:text-base transition ${
                    isActive
                      ? 'bg-brand-300 font-semibold text-white'
                      : 'text-gray-600 hover:bg-brand-50'
                  }`
                }
              >
                {tab.icon}
                <span className="hidden lg:inline">{tab.label}</span>
                {Boolean(tab.badge) && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-xs md:text-sm font-bold text-white">
                    {tab.badge}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-4 py-4 pb-28 md:max-w-3xl md:pb-8 lg:max-w-6xl">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-brand-500 bg-brand-400 pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="mx-auto flex max-w-md">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${
                  isActive ? 'font-bold text-white' : 'text-white/70'
                }`
              }
            >
              {tab.icon}
              <span>{tab.label}</span>
              {Boolean(tab.badge) && (
                <span className="absolute top-1 right-[22%] flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                  {tab.badge}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
