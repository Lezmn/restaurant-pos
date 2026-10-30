import { useCustomerLiveEvents } from '@/features/live/hooks'
import { useCallStaff, useSession } from '@/features/public/hooks'
import { cartCount, useCart } from '@/features/public/cart-store'
import { ApiError } from '@/lib/api-client'
import { RESTAURANT_NAME } from '@/lib/config'
import { TableSessionStatus } from '@/types/enums'
import { useEffect, useState, type ReactNode } from 'react'
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

function IconBell() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-5 w-5 shrink-0">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" strokeLinecap="round" />
    </svg>
  )
}

/**
 * ปุ่มเรียกพนักงานอยู่บน header ทุกหน้า — ลูกค้าต้องเรียกได้ตลอด (ถามเมนู แพ้อาหาร ขอช้อนส้อม)
 * ไม่ใช่เฉพาะหน้าสถานะ กดแล้วล็อกปุ่มเป็น "แจ้งแล้ว" (backend คืนคำขอเดิมอยู่แล้วถ้ากดซ้ำ)
 */
function CallStaffButton({ token, pending }: Readonly<{ token: string; pending: boolean }>) {
  const callStaff = useCallStaff()
  // "แจ้งแล้ว" = มีคำขอค้างอยู่จริงที่ backend — พนักงานกดรับทราบแล้ว (socket ดึง session ใหม่) ปุ่มกลับมากดได้
  // ระหว่างส่ง mutation ยัง pending จนดึง session ใหม่เสร็จ (onSuccess คืน promise) ปุ่มจึงไม่กระพริบกลับ
  const done = pending || callStaff.isPending
  // บอก screen reader ตอนพนักงานรับเรื่องแล้ว — ตาเห็นจากปุ่มที่เปลี่ยนกลับ
  const [acknowledged, setAcknowledged] = useState(false)
  const [wasPending, setWasPending] = useState(pending)
  if (pending !== wasPending) {
    setWasPending(pending)
    setAcknowledged(wasPending && !pending)
  }

  return (
    <>
      <button
        type="button"
        disabled={done}
        onClick={() => callStaff.mutate({ token })}
        className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border-2 px-3 text-sm font-bold transition md:text-base ${
          done
            ? 'border-success-ink bg-success/10 text-success-ink'
            : 'border-brand-500 bg-white text-brand-500 hover:bg-brand-50'
        }`}
      >
        <IconBell />
        {done ? 'แจ้งแล้ว' : 'เรียกพนักงาน'}
      </button>
      <output className="sr-only">
        {staffCallAnnouncement(done, acknowledged)}
      </output>
    </>
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
  const releaseToken = useCart((s) => s.releaseToken)
  const count = cartCount(lines)

  // ปิดบิลแล้ว = ทั้งกรณี backend ตอบ 400 และกรณี session โหลดมาแล้วสถานะไม่ใช่ OPEN
  const isClosed =
    (isError && isClosedSessionError(error)) ||
    (session !== undefined && session.status !== TableSessionStatus.OPEN)

  const isOpen = session?.status === TableSessionStatus.OPEN

  // สแกน QR โต๊ะใหม่บนเครื่องเดิม ต้องไม่เอาตะกร้าโต๊ะเก่ามาด้วย
  // แต่ผูกเฉพาะเมื่อยืนยันแล้วว่าโต๊ะมีจริงและยังเปิดอยู่ — เดิมผูกทันทีจาก URL
  // เปิดลิงก์ผิด/QR เก่าที่หมดอายุแล้ว ตะกร้าของโต๊ะที่นั่งอยู่จริงหายไปด้วย
  useEffect(() => {
    if (token && isOpen) bindToken(token)
  }, [token, isOpen, bindToken])

  // โต๊ะปิดแล้ว ของในตะกร้าสั่งไม่ได้อีก — ล้างทิ้งกันค้างใน localStorage
  // เฉพาะตะกร้าของโต๊ะนี้ เปิดลิงก์โต๊ะเก่าที่ปิดไปแล้วต้องไม่ล้างตะกร้าโต๊ะปัจจุบัน
  useEffect(() => {
    if (isClosed && token) releaseToken(token)
  }, [isClosed, token, releaseToken])

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
    <div className="flex min-h-dvh flex-col bg-cream">
      <header className="sticky top-0 z-20 border-b-2 border-brand-75 bg-white">
        <div className="mx-auto flex w-full max-w-md items-center gap-3 px-4 py-3 md:max-w-3xl lg:max-w-6xl">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-brand-500 md:text-sm">
              {RESTAURANT_NAME}
            </p>
            <p className="truncate text-lg font-bold text-ink md:text-xl">
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
                  `relative flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm md:text-base transition ${
                    isActive
                      ? 'bg-brand-500 font-bold text-white'
                      : 'font-semibold text-gray-700 hover:bg-brand-50'
                  }`
                }
              >
                {tab.icon}
                <span className="hidden lg:inline">{tab.label}</span>
                {Boolean(tab.badge) && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger-ink px-1 text-xs md:text-sm font-bold text-white">
                    {tab.badge}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          {token && isOpen && <CallStaffButton token={token} pending={Boolean(session?.callStaffPending)} />}
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-4 py-4 pb-32 md:max-w-3xl md:pb-8 lg:max-w-6xl">
        <Outlet />
      </main>

      {/* สูงตายตัว h-16 (64px) — แถบลอยของหน้าเมนู/รายละเอียดเมนูวางชิดบนตัวนี้ด้วยค่าเดียวกัน
          (bottom-[calc(4rem+env(safe-area-inset-bottom))]) ไม่งั้นมีช่องว่างโผล่ระหว่างกัน */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-brand-75 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="mx-auto flex h-16 max-w-md">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `relative flex flex-1 flex-col items-center justify-center gap-0.5 text-xs ${
                  isActive ? 'font-bold text-brand-500' : 'font-semibold text-gray-600'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {/* ขีดบนแท็บที่เลือก — บอกตำแหน่งด้วยรูปทรง ไม่ใช่แค่สี */}
                  {isActive && (
                    <span aria-hidden className="absolute inset-x-[22%] top-0 h-1 rounded-b-full bg-brand-500" />
                  )}
                  {tab.icon}
                  <span>{tab.label}</span>
                  {Boolean(tab.badge) && (
                    <span className="absolute top-1.5 right-[22%] flex h-5 min-w-5 items-center justify-center rounded-full bg-danger-ink px-1 text-[11px] font-bold text-white">
                      {tab.badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

function staffCallAnnouncement(done: boolean, acknowledged: boolean) {
  if (done) return 'แจ้งพนักงานแล้ว กรุณารอสักครู่'
  return acknowledged ? 'พนักงานรับทราบแล้ว' : ''
}
