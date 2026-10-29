import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/features/auth/use-auth'
import { useCloseSession, useOpenSession, useSessions } from '@/features/table-sessions/hooks'
import { useTables } from '@/features/tables/hooks'
import { Role, TableSessionStatus, TableStatus } from '@/types/enums'
import type { RestaurantTable, TableSession } from '@/types/models'
import { TablesPage } from '@/pages/employee/TablesPage'

vi.mock('@/features/tables/hooks', () => ({ useTables: vi.fn() }))
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

type Mut = { mutate: ReturnType<typeof vi.fn>; reset: ReturnType<typeof vi.fn> }
let openSession: Mut
let closeSession: Mut
let refetchTables: ReturnType<typeof vi.fn>
let refetchSessions: ReturnType<typeof vi.fn>

function setup({
  role = Role.ADMIN as Role | null,
  tablesQuery = {} as Record<string, unknown>,
  sessionsQuery = {} as Record<string, unknown>,
  openExtra = {} as Record<string, unknown>,
  closeExtra = {} as Record<string, unknown>,
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
  vi.mocked(useOpenSession).mockReturnValue(openSession as never)
  vi.mocked(useCloseSession).mockReturnValue(closeSession as never)
  const user = userEvent.setup()
  render(<TablesPage />)
  return { user }
}

const card = (name: string) => screen.getByText(`โต๊ะ ${name}`, { selector: 'p' }).closest('article') as HTMLElement

describe('TablesPage — การ์ดโต๊ะ', () => {
  beforeEach(() => vi.clearAllMocks())

  // ทดสอบ: ป้ายสถานะ และโต๊ะที่มีบิลเปิด (ไม่ใช่กลับบ้าน/ปิดแล้ว) โชว์ QR + ปุ่มรับออเดอร์/ปิดโต๊ะ
  it('ป้ายสถานะ และเฉพาะโต๊ะที่มีบิลเปิดจริงที่โชว์ QR', () => {
    setup()
    expect(card('1')).toHaveTextContent('ว่าง')
    expect(card('2')).toHaveTextContent('มีลูกค้า')
    expect(card('3')).toHaveTextContent('จองแล้ว')

    expect(card('2')).toHaveTextContent('tok-2')
    expect(within(card('2')).getByRole('button', { name: 'รับออเดอร์แทนลูกค้า' })).toBeInTheDocument()
    expect(within(card('2')).getByRole('button', { name: 'ปิดโต๊ะ' })).toBeInTheDocument()
    for (const n of ['1', '3']) {
      expect(within(card(n)).getByRole('button', { name: 'เปิดโต๊ะ/สร้าง QR' })).toBeInTheDocument()
    }
  })

  // ทดสอบ: สิทธิ์ — ADMIN เห็นจัดการโต๊ะ, STAFF เปิดโต๊ะได้แต่ไม่เห็นจัดการ, KITCHEN เปิดโต๊ะไม่ได้
  it.each([
    [Role.ADMIN, true, true],
    [Role.STAFF, true, false],
    [Role.KITCHEN, false, false],
    [null, false, false],
  ])('role %s → เปิดโต๊ะได้=%s, จัดการโต๊ะ=%s', (role, canOpen, canManage) => {
    setup({ role })
    const open = within(card('1')).getByRole('button', { name: 'เปิดโต๊ะ/สร้าง QR' })
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
    expect(within(card('1')).getByRole('button', { name: 'เปิดโต๊ะ/สร้าง QR' })).toBeDisabled()
  })
})

describe('TablesPage — การกระทำ', () => {
  beforeEach(() => vi.clearAllMocks())

  // ทดสอบ: เปิดโต๊ะสำเร็จ → เด้ง QR ของบิลใหม่ทันที
  it('เปิดโต๊ะ 1 → ส่ง table id แล้วเด้งกล่อง QR ของบิลใหม่', async () => {
    const { user } = setup()
    await user.click(within(card('1')).getByRole('button', { name: 'เปิดโต๊ะ/สร้าง QR' }))
    expect(openSession.mutate).toHaveBeenCalledWith('t1', expect.anything())
    act(() => openSession.mutate.mock.calls[0][1].onSuccess(session(1, { token: 'new-tok' })))
    const dialog = screen.getByRole('dialog', { name: 'QR โต๊ะ 1' })
    expect(within(dialog).getByRole('textbox')).toHaveValue(`${window.location.origin}/t/new-tok`)
  })

  // ทดสอบ: กด QR บนการ์ด → กล่อง QR ใหญ่, คัดลอกลิงก์แล้วปุ่มเปลี่ยนเป็น "คัดลอกแล้ว", พิมพ์ได้
  it('กล่อง QR: คัดลอกลิงก์ และพิมพ์', async () => {
    const { user } = setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText')
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    await user.click(within(card('2')).getByTitle('กดเพื่อดู QR ขนาดใหญ่'))
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
    await user.click(within(card('2')).getByTitle('กดเพื่อดู QR ขนาดใหญ่'))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'คัดลอกลิงก์' }))
    expect(within(dialog).getByRole('button', { name: 'คัดลอกลิงก์' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  // ทดสอบ: ปิดโต๊ะต้องยืนยันก่อน → ส่ง session id แล้วปิดกล่อง / ย้อนกลับล้าง error
  it('ปิดโต๊ะ → ยืนยัน → ส่ง session id / ย้อนกลับ → ไม่ปิด', async () => {
    const { user } = setup()
    await user.click(within(card('2')).getByRole('button', { name: 'ปิดโต๊ะ' }))
    await user.click(within(screen.getByRole('dialog', { name: 'ปิดโต๊ะ' })).getByRole('button', { name: 'ย้อนกลับ' }))
    expect(closeSession.reset).toHaveBeenCalled()
    expect(closeSession.mutate).not.toHaveBeenCalled()

    await user.click(within(card('2')).getByRole('button', { name: 'ปิดโต๊ะ' }))
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
    await user.click(within(card('2')).getByRole('button', { name: 'รับออเดอร์แทนลูกค้า' }))
    await user.click(within(screen.getByRole('dialog', { name: 'รับออเดอร์ โต๊ะ 2' })).getByRole('button'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'จัดการโต๊ะ' }))
    await user.click(within(screen.getByRole('dialog', { name: 'จัดการโต๊ะ' })).getByRole('button'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
