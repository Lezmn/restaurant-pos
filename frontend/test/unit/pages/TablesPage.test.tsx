import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/features/auth/use-auth'
import { useCloseSession, useOpenSession, useSessions } from '@/features/table-sessions/hooks'
import { useTables } from '@/features/tables/hooks'
import { useResolveServiceRequest, useServiceRequests } from '@/features/service-requests/hooks'
import {
  Role,
  ServiceRequestStatus,
  ServiceRequestType,
  TableSessionStatus,
  TableStatus,
} from '@/types/enums'
import type { RestaurantTable, ServiceRequest, TableSession } from '@/types/models'
import { TablesPage } from '@/pages/employee/TablesPage'

vi.mock('@/features/tables/hooks', () => ({ useTables: vi.fn() }))
vi.mock('@/features/service-requests/hooks', () => ({
  useServiceRequests: vi.fn(),
  useResolveServiceRequest: vi.fn(),
}))
vi.mock('@/features/table-sessions/hooks', () => ({
  useSessions: vi.fn(),
  useOpenSession: vi.fn(),
  useCloseSession: vi.fn(),
}))
// กล่องลูกมีเทสของตัวเองแล้ว (ManageTablesDialog.test / TakeOrderDialog.test) — ที่นี่เช็กแค่ว่าเปิดถูกโต๊ะ
vi.mock('@/pages/employee/ManageTablesDialog', () => ({
  ManageTablesDialog: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="จัดการโต๊ะ">
      <button type="button" onClick={onClose}>ปิดจัดการโต๊ะ</button>
    </div>
  ),
}))
vi.mock('@/pages/employee/TakeOrderDialog', () => ({
  TakeOrderDialog: ({ session, onClose }: { session: TableSession; onClose: () => void }) => (
    <div role="dialog" aria-label={`รับออเดอร์ โต๊ะ ${session.tableName}`}>
      <button type="button" onClick={onClose}>ปิดรับออเดอร์</button>
    </div>
  ),
}))

// jsdom ยังไม่มี showModal ของ <dialog>
beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false
  }
})

const table = (n: number, status: TableStatus = TableStatus.AVAILABLE): RestaurantTable => ({
  id: `t${n}`,
  name: String(n),
  number: n,
  status,
  isActive: true,
})

const session = (tableNo: number, extra: Partial<TableSession> = {}): TableSession =>
  ({
    id: `s${tableNo}`,
    tableId: `t${tableNo}`,
    tableName: String(tableNo),
    placeLabel: `โต๊ะ ${tableNo}`,
    isTakeaway: false,
    takeawayNo: null,
    customerName: null,
    token: `tok-${tableNo}`,
    status: TableSessionStatus.OPEN,
    openedAt: '2026-10-29T05:00:00.000Z',
    closedAt: null,
    total: 0,
    split: null,
    ...extra,
  }) as TableSession

const tables = [table(1), table(2, TableStatus.OCCUPIED), table(3, TableStatus.RESERVED)]
const sessions = [
  session(2),
  // บิลกลับบ้านอยู่บนโต๊ะเสมือน และบิลที่ปิดแล้ว ต้องไม่ทำให้โต๊ะ 1/3 ดูเหมือนเปิดอยู่
  session(1, { id: 'tk', isTakeaway: true }),
  session(3, { id: 'old', status: TableSessionStatus.CLOSED }),
]

const request = (
  id: string,
  tableSessionId: string,
  type: ServiceRequestType,
  status: ServiceRequestStatus = ServiceRequestStatus.PENDING,
): ServiceRequest => ({
  id,
  tableSessionId,
  // บิล "old" เป็นของโต๊ะ 3 ที่ปิดไปแล้ว
  tableName: tableSessionId === 'old' ? '3' : tableSessionId.slice(1),
  type,
  status,
  paymentMethod: null,
  note: null,
  createdAt: new Date().toISOString(),
})

type Mut = { mutate: ReturnType<typeof vi.fn>; reset: ReturnType<typeof vi.fn> }
let openSession: Mut
let closeSession: Mut
let resolve: Mut & { isPending: boolean; variables: string | undefined }
let refetchTables: ReturnType<typeof vi.fn>
let refetchSessions: ReturnType<typeof vi.fn>

function setup({
  role = Role.ADMIN as Role | null,
  tablesQuery = {} as Record<string, unknown>,
  sessionsQuery = {} as Record<string, unknown>,
  openExtra = {} as Record<string, unknown>,
  closeExtra = {} as Record<string, unknown>,
  requests = [] as ServiceRequest[],
} = {}) {
  openSession = { mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null, ...openExtra } as never
  closeSession = { mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null, ...closeExtra } as never
  refetchTables = vi.fn()
  refetchSessions = vi.fn()
  useAuth.setState({ user: role ? { id: 'u', email: 'u@x', name: 'U', role } : null })
  vi.mocked(useTables).mockReturnValue({
    data: tables,
    isPending: false,
    isError: false,
    error: null,
    refetch: refetchTables,
    ...tablesQuery,
  } as never)
  vi.mocked(useSessions).mockReturnValue({
    data: sessions,
    isError: false,
    error: null,
    refetch: refetchSessions,
    ...sessionsQuery,
  } as never)
  vi.mocked(useServiceRequests).mockReturnValue({ data: requests } as never)
  resolve = { mutate: vi.fn(), reset: vi.fn(), isPending: false, variables: undefined } as never
  vi.mocked(useResolveServiceRequest).mockReturnValue(resolve as never)
  vi.mocked(useOpenSession).mockReturnValue(openSession as never)
  vi.mocked(useCloseSession).mockReturnValue(closeSession as never)
  const user = userEvent.setup()
  render(
    <MemoryRouter>
      <TablesPage />
    </MemoryRouter>,
  )
  return { user }
}

/** การ์ดโต๊ะในผัง (ปุ่มเลือกโต๊ะ) — ชื่อที่อ่านออกเสียงขึ้นต้นด้วย "โต๊ะ N" */
const tile = (name: string) => screen.getByRole('button', { name: new RegExp(`^โต๊ะ ${name}(?!\\d)`) })
/** แตะการ์ดแล้วคืนกล่องรายละเอียดของโต๊ะนั้น (ปุ่มเปิดโต๊ะ/QR/ปิดโต๊ะ อยู่ในนี้) */
const panel = (name: string) => {
  fireEvent.click(tile(name))
  return screen.getByRole('region', { name: `โต๊ะ ${name}` })
}

describe('TablesPage — ผังโต๊ะ', () => {
  beforeEach(() => vi.clearAllMocks())

  // ทดสอบ: ป้ายสถานะบนการ์ด และกล่องรายละเอียดตามสถานะบิล (กลับบ้าน/บิลปิดแล้ว ไม่นับเป็นโต๊ะเปิด)
  it('ป้ายสถานะ และเฉพาะโต๊ะที่มีบิลเปิดจริงที่มีปุ่มรับออเดอร์/QR/ปิดโต๊ะ', () => {
    setup()
    expect(tile('1')).toHaveTextContent('ว่าง')
    expect(tile('2')).toHaveTextContent('มีลูกค้า')
    expect(tile('3')).toHaveTextContent('จองแล้ว')

    const p2 = panel('2')
    expect(within(p2).getByRole('button', { name: 'ดู QR' })).toBeInTheDocument()
    expect(within(p2).getByRole('button', { name: 'รับออเดอร์แทนลูกค้า' })).toBeInTheDocument()
    expect(within(p2).getByRole('button', { name: 'ปิดโต๊ะ' })).toBeInTheDocument()
    for (const n of ['1', '3']) {
      expect(within(panel(n)).getByRole('button', { name: 'เปิดโต๊ะ/สร้าง QR' })).toBeInTheDocument()
    }
  })

  // ทดสอบ: ยังไม่เลือกโต๊ะ → กล่องรายละเอียดบอกให้แตะโต๊ะ / เลือกแล้วการ์ดนั้น aria-pressed
  it('ยังไม่เลือกโต๊ะ → บอกให้แตะ / เลือกแล้วการ์ดถูกกดค้าง', () => {
    setup()
    expect(screen.getByRole('region', { name: 'รายละเอียดโต๊ะ' })).toHaveTextContent('แตะโต๊ะในผัง')
    panel('2')
    expect(tile('2')).toHaveAttribute('aria-pressed', 'true')
    expect(tile('1')).toHaveAttribute('aria-pressed', 'false')
  })

  // ทดสอบ: คำขอค้างของบิลโต๊ะ → ป้ายบนการ์ด · คำขอที่จัดการแล้วไม่นับ
  it('คำขอค้างจากโต๊ะขึ้นป้ายขอเช็คบิลบนการ์ด คำขอที่จัดการแล้วไม่นับ', () => {
    setup({
      requests: [
        request('r1', 's2', ServiceRequestType.CHECKOUT),
        request('r2', 's2', ServiceRequestType.CALL_STAFF, ServiceRequestStatus.RESOLVED),
      ],
    })
    expect(tile('2')).toHaveTextContent('ขอเช็คบิล')
    expect(tile('2')).not.toHaveTextContent('เรียกพนักงาน')
  })

  // ทดสอบ: เรียกพนักงานสำคัญกว่าขอเช็คบิล (ลูกค้ารออยู่) — มีทั้งสองอย่างขึ้นเรียกพนักงาน
  it('เรียกพนักงานค้างอยู่ → การ์ดขึ้นเรียกพนักงาน แม้ขอบิลด้วย', () => {
    setup({
      requests: [
        request('r1', 's2', ServiceRequestType.CHECKOUT),
        request('r2', 's2', ServiceRequestType.CALL_STAFF),
      ],
    })
    expect(tile('2')).toHaveTextContent('เรียกพนักงาน')
    expect(tile('2')).not.toHaveTextContent('ขอเช็คบิล')
  })

  // ทดสอบ: สิทธิ์ — ADMIN เห็นจัดการโต๊ะ, STAFF เปิดโต๊ะได้แต่ไม่เห็นจัดการ, KITCHEN เปิดโต๊ะไม่ได้
  it.each([
    [Role.ADMIN, true, true],
    [Role.STAFF, true, false],
    [Role.KITCHEN, false, false],
    [null, false, false],
  ])('role %s → เปิดโต๊ะได้=%s, จัดการโต๊ะ=%s', (role, canOpen, canManage) => {
    setup({ role })
    const open = within(panel('1')).getByRole('button', { name: 'เปิดโต๊ะ/สร้าง QR' })
    expect(open.hasAttribute('disabled')).toBe(!canOpen)
    if (!canOpen) expect(open).toHaveAttribute('title', 'ต้องเป็น ADMIN หรือ STAFF')
    expect(Boolean(screen.queryByRole('button', { name: 'จัดการโต๊ะ' }))).toBe(canManage)
  })

  it('กำลังโหลด → "กำลังโหลด..."', () => {
    setup({ tablesQuery: { data: undefined, isPending: true } })
    expect(screen.getByText('กำลังโหลด...')).toBeInTheDocument()
  })

  // ทดสอบ: โหลดโต๊ะ/บิลที่เปิดไม่ได้ → แถบ error แยกกัน ลองใหม่ได้
  it('โหลดโต๊ะและบิลไม่ได้ → แถบ error แยกกัน ลองใหม่ได้', async () => {
    const { user } = setup({
      tablesQuery: { data: undefined, isError: true, error: new Error('down') },
      sessionsQuery: { data: undefined, isError: true, error: new Error('down') },
    })
    const alerts = screen.getAllByRole('alert')
    expect(alerts[0]).toHaveTextContent('รายการโต๊ะ')
    expect(alerts[1]).toHaveTextContent('โต๊ะที่เปิดอยู่')
    await user.click(within(alerts[0]).getByRole('button', { name: 'ลองใหม่' }))
    await user.click(within(alerts[1]).getByRole('button', { name: 'ลองใหม่' }))
    expect(refetchTables).toHaveBeenCalled()
    expect(refetchSessions).toHaveBeenCalled()
  })

  it('เปิดโต๊ะไม่สำเร็จ → error โชว์บนหน้า และกำลังเปิดกดซ้ำไม่ได้', () => {
    setup({ openExtra: { error: new Error('โต๊ะนี้เปิดอยู่แล้ว'), isPending: true } })
    expect(screen.getByText('โต๊ะนี้เปิดอยู่แล้ว')).toBeInTheDocument()
    expect(within(panel('1')).getByRole('button', { name: 'เปิดโต๊ะ/สร้าง QR' })).toBeDisabled()
  })
})

describe('TablesPage — คำขอจากโต๊ะ', () => {
  beforeEach(() => vi.clearAllMocks())

  const inbox = () => screen.getByRole('region', { name: /คำขอจากโต๊ะ/ })

  // ทดสอบ: เรียกพนักงาน → รับทราบได้ที่นี่ / ขอเช็คบิล → ลิงก์ไปหน้ารับเงิน / คำขอของบิลที่ปิดแล้วไม่ขึ้น
  it('รับทราบเรียกพนักงาน / ขอบิลพาไปหน้ารับเงิน / คำขอของบิลที่ปิดแล้วไม่ขึ้น', async () => {
    const { user } = setup({
      requests: [
        request('call', 's2', ServiceRequestType.CALL_STAFF),
        request('bill', 's2', ServiceRequestType.CHECKOUT),
        request('stale', 'old', ServiceRequestType.CALL_STAFF),
      ],
    })
    expect(inbox()).toHaveTextContent('(2)')
    expect(within(inbox()).getAllByText(/^โต๊ะ 2 ·/)).toHaveLength(2)
    expect(inbox()).not.toHaveTextContent('โต๊ะ 3')

    expect(within(inbox()).getByRole('link', { name: 'ไปที่บิล' })).toHaveAttribute('href', '/employee/check')
    await user.click(within(inbox()).getByRole('button', { name: 'รับทราบ' }))
    expect(resolve.mutate).toHaveBeenCalledWith('call')
  })

  it('ไม่มีคำขอค้าง → บอกว่าไม่มี', () => {
    setup()
    expect(inbox()).toHaveTextContent('ไม่มีคำขอค้าง')
  })
})

describe('TablesPage — การกระทำ', () => {
  beforeEach(() => vi.clearAllMocks())

  // ทดสอบ: เปิดโต๊ะสำเร็จ → เด้ง QR ของบิลใหม่ทันที
  it('เปิดโต๊ะ 1 → ส่ง table id แล้วเด้งกล่อง QR ของบิลใหม่', async () => {
    const { user } = setup()
    await user.click(within(panel('1')).getByRole('button', { name: 'เปิดโต๊ะ/สร้าง QR' }))
    expect(openSession.mutate).toHaveBeenCalledWith('t1', expect.anything())
    act(() => openSession.mutate.mock.calls[0][1].onSuccess(session(1, { token: 'new-tok' })))
    const dialog = screen.getByRole('dialog', { name: 'QR โต๊ะ 1' })
    expect(within(dialog).getByRole('textbox')).toHaveValue(`${window.location.origin}/t/new-tok`)
  })

  // ทดสอบ: กด ดู QR → กล่อง QR ใหญ่, คัดลอกลิงก์แล้วปุ่มเปลี่ยนเป็น "คัดลอกแล้ว", พิมพ์ได้
  it('กล่อง QR: คัดลอกลิงก์ และพิมพ์', async () => {
    const { user } = setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText')
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    await user.click(within(panel('2')).getByRole('button', { name: 'ดู QR' }))
    const dialog = screen.getByRole('dialog', { name: 'QR โต๊ะ 2' })
    await user.click(within(dialog).getByRole('button', { name: 'คัดลอกลิงก์' }))
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/t/tok-2`)
    expect(within(dialog).getByRole('button', { name: 'คัดลอกแล้ว' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'พิมพ์' }))
    expect(print).toHaveBeenCalled()
  })

  // ทดสอบ: เบราว์เซอร์บล็อก clipboard → ไม่พัง ปุ่มยังเป็น "คัดลอกลิงก์"
  it('clipboard ถูกบล็อก → ไม่พัง ปุ่มยังเป็นคัดลอกลิงก์', async () => {
    const { user } = setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'))
    await user.click(within(panel('2')).getByRole('button', { name: 'ดู QR' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'คัดลอกลิงก์' }))
    expect(within(dialog).getByRole('button', { name: 'คัดลอกลิงก์' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  // ทดสอบ: ปิดโต๊ะต้องยืนยันก่อน → ส่ง session id แล้วปิดกล่อง / ย้อนกลับล้าง error
  it('ปิดโต๊ะ → ยืนยัน → ส่ง session id / ย้อนกลับ → ไม่ปิด', async () => {
    const { user } = setup()
    const p2 = panel('2')
    await user.click(within(p2).getByRole('button', { name: 'ปิดโต๊ะ' }))
    await user.click(within(screen.getByRole('dialog', { name: 'ปิดโต๊ะ' })).getByRole('button', { name: 'ย้อนกลับ' }))
    expect(closeSession.reset).toHaveBeenCalled()
    expect(closeSession.mutate).not.toHaveBeenCalled()

    await user.click(within(p2).getByRole('button', { name: 'ปิดโต๊ะ' }))
    const dialog = screen.getByRole('dialog', { name: 'ปิดโต๊ะ' })
    expect(dialog).toHaveTextContent('โต๊ะ 2')
    await user.click(within(dialog).getByRole('button', { name: 'ปิดโต๊ะ' }))
    expect(closeSession.mutate).toHaveBeenCalledWith('s2', expect.anything())
    act(() => closeSession.mutate.mock.calls[0][1].onSuccess())
    expect(screen.queryByRole('dialog', { name: 'ปิดโต๊ะ' })).not.toBeInTheDocument()
  })

  // ทดสอบ: ปุ่มรับออเดอร์ / จัดการโต๊ะ เปิดกล่องของมัน และปิดได้
  it('รับออเดอร์แทนลูกค้า และจัดการโต๊ะ → เปิดกล่องถูกตัว ปิดได้', async () => {
    const { user } = setup()
    await user.click(within(panel('2')).getByRole('button', { name: 'รับออเดอร์แทนลูกค้า' }))
    await user.click(within(screen.getByRole('dialog', { name: 'รับออเดอร์ โต๊ะ 2' })).getByRole('button'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'จัดการโต๊ะ' }))
    await user.click(within(screen.getByRole('dialog', { name: 'จัดการโต๊ะ' })).getByRole('button'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
