import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCustomerLiveEvents, useStaffLiveEvents } from '@/features/live/hooks'
import { useAuth } from '@/features/auth/use-auth'
import { useLiveStatus } from '@/lib/live'
import { Role } from '@/types/enums'

// socket ปลอม — เก็บ handler ไว้ให้เทสยิง event เองได้
type Handler = () => void
const sockets: { url: string; opts: { auth: Record<string, string>; withCredentials?: boolean }; handlers: Map<string, Handler[]>; close: ReturnType<typeof vi.fn> }[] = []
vi.mock('socket.io-client', () => ({
  io: vi.fn((url: string, opts: { auth: Record<string, string> }) => {
    const handlers = new Map<string, Handler[]>()
    const socket = {
      url,
      opts,
      handlers,
      close: vi.fn(),
      on: (event: string, fn: Handler) => handlers.set(event, [...(handlers.get(event) ?? []), fn]),
    }
    sockets.push(socket)
    return socket
  }),
}))

const emit = (event: string) => act(() => sockets.at(-1)!.handlers.get(event)?.forEach((fn) => fn()))

let qc: QueryClient
let invalidated: unknown[][]

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => {
  sockets.length = 0
  qc = new QueryClient()
  invalidated = []
  vi.spyOn(qc, 'invalidateQueries').mockImplementation(async (filters) => {
    invalidated.push(filters?.queryKey as unknown[])
  })
  useLiveStatus.setState({ connected: false })
  useAuth.setState({ user: null })
})

describe('useStaffLiveEvents', () => {
  // ทดสอบ: ยังไม่ login → ไม่ต่อ socket
  it('ยังไม่ login → ไม่ต่อ socket', () => {
    renderHook(() => useStaffLiveEvents(), { wrapper })
    expect(sockets).toHaveLength(0)
  })

  describe('login แล้ว', () => {
    beforeEach(() => useAuth.setState({ user: { id: 'u', email: 'u@x', name: 'U', role: Role.STAFF } }))

    // ทดสอบ: ต่อด้วย cookie (withCredentials) ไม่ส่ง JWT ใน auth, connect → สถานะต่ออยู่ + ดึงข้อมูลที่อาจพลาด, หลุด/ต่อไม่ได้ → สถานะหลุด
    it('ต่อด้วย cookie และรายงานสถานะ connect/disconnect/connect_error', () => {
      renderHook(() => useStaffLiveEvents(), { wrapper })
      expect(sockets[0].opts.withCredentials).toBe(true)
      expect(sockets[0].opts.auth).toEqual({ userId: 'u' })

      emit('connect')
      expect(useLiveStatus.getState().connected).toBe(true)
      expect(invalidated).toEqual([['orders'], ['service-requests'], ['table-sessions'], ['tables']])

      emit('disconnect')
      expect(useLiveStatus.getState().connected).toBe(false)
      emit('connect')
      emit('connect_error')
      expect(useLiveStatus.getState().connected).toBe(false)
    })

    // ทดสอบ: แต่ละ event สั่งดึง query ที่เกี่ยวข้องใหม่ (ตัวอย่างที่กระทบหลายจอ)
    it.each([
      ['order.created', [['orders'], ['table-sessions'], ['tables'], ['ingredients']]],
      ['payment.voided', [['payments'], ['orders'], ['service-requests'], ['table-sessions'], ['tables'], ['reports'], ['cash-closes']]],
      ['payment.slip-updated', [['payments'], ['reports']]],
      ['table-session.updated', [['table-sessions'], ['tables'], ['orders'], ['service-requests']]],
      ['menu.updated', [['menu-items'], ['ingredients'], ['public', 'menu']]],
    ])('%s → invalidate query ที่เกี่ยวข้อง', (event, keys) => {
      renderHook(() => useStaffLiveEvents(), { wrapper })
      emit(event)
      expect(invalidated).toEqual(keys)
    })

    // ทดสอบ: ฟังครบทุก event ที่ backend ส่ง (ตรงกับ events.gateway.ts)
    it('ฟังครบ 11 event', () => {
      renderHook(() => useStaffLiveEvents(), { wrapper })
      const events = [...sockets[0].handlers.keys()].filter((e) => !e.startsWith('connect') && e !== 'disconnect')
      expect(events).toHaveLength(11)
    })

    // ทดสอบ: ออกจากหน้า → ปิด socket และตั้งสถานะหลุด (กลับไป poll สำรอง)
    it('unmount → ปิด socket และสถานะเป็นหลุด', () => {
      const { unmount } = renderHook(() => useStaffLiveEvents(), { wrapper })
      emit('connect')
      unmount()
      expect(sockets[0].close).toHaveBeenCalled()
      expect(useLiveStatus.getState().connected).toBe(false)
    })

    // ทดสอบ: render ซ้ำด้วยบัญชีเดิม ไม่ต่อ socket ใหม่
    it('render ซ้ำบัญชีเดิม → ไม่ต่อใหม่', () => {
      const { rerender } = renderHook(() => useStaffLiveEvents(), { wrapper })
      rerender()
      expect(sockets).toHaveLength(1)
    })
  })
})

describe('useCustomerLiveEvents', () => {
  const orders = ['public', 'orders', 'tok']
  const session = ['public', 'session', 'tok']

  it('ไม่มี sessionToken → ไม่ต่อ socket', () => {
    renderHook(() => useCustomerLiveEvents(undefined), { wrapper })
    expect(sockets).toHaveLength(0)
  })

  // ทดสอบ: ต่อด้วย sessionToken, connect → ดึงออเดอร์และ session ใหม่
  it('ต่อด้วย sessionToken และ connect → ดึงออเดอร์ + session', () => {
    renderHook(() => useCustomerLiveEvents('tok'), { wrapper })
    expect(sockets[0].opts.auth).toEqual({ sessionToken: 'tok' })
    emit('connect')
    expect(invalidated).toEqual([orders, session])
  })

  // ทดสอบ: แต่ละ event ของลูกค้าดึงเฉพาะของโต๊ะตัวเอง
  it.each([
    ['order.created', [orders]],
    ['order.updated', [orders]],
    ['payment.created', [orders, session]],
    ['payment.voided', [orders, session]],
    ['table-session.closed', [session]],
    ['table-session.updated', [session, orders]],
    ['menu.updated', [['public', 'menu']]],
  ])('%s → invalidate ของโต๊ะตัวเอง', (event, keys) => {
    renderHook(() => useCustomerLiveEvents('tok'), { wrapper })
    emit(event)
    expect(invalidated).toEqual(keys)
  })

  // ทดสอบ: เปลี่ยนโต๊ะ (token ใหม่) → ปิด socket เดิมแล้วต่อใหม่
  it('token เปลี่ยน → ปิด socket เดิม ต่อใหม่ด้วย token ใหม่', () => {
    const { rerender } = renderHook(({ token }) => useCustomerLiveEvents(token), {
      wrapper,
      initialProps: { token: 'tok' },
    })
    rerender({ token: 'tok2' })
    expect(sockets[0].close).toHaveBeenCalled()
    expect(sockets[1].opts.auth).toEqual({ sessionToken: 'tok2' })
  })
})
