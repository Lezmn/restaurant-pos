import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/features/auth/use-auth'
import { useOrders } from '@/features/orders/hooks'
import { useCreatePayment } from '@/features/payments/hooks'
import { useServiceRequests } from '@/features/service-requests/hooks'
import { useCloseSession, useSessions } from '@/features/table-sessions/hooks'
import {
  OrderStatus,
  PaymentMethod,
  Role,
  ServiceRequestStatus,
  ServiceRequestType,
  TableSessionStatus,
} from '@/types/enums'
import type { Order, Payment, ServiceRequest, TableSession } from '@/types/models'
import { CheckPage } from '@/pages/employee/CheckPage'

// ข้อมูลมาจาก hook ทั้งหมด — mock ที่ hook ตรง ๆ จะคุมสถานะโหลด/error ได้ทุกแบบ
vi.mock('@/features/table-sessions/hooks', () => ({ useSessions: vi.fn(), useCloseSession: vi.fn() }))
vi.mock('@/features/orders/hooks', () => ({ useOrders: vi.fn() }))
vi.mock('@/features/service-requests/hooks', () => ({ useServiceRequests: vi.fn() }))
vi.mock('@/features/payments/hooks', () => ({ useCreatePayment: vi.fn() }))
// ค่า PromptPay มาจาก .env ของแต่ละเครื่อง — ล็อกเป็นโหมดเดโมไว้ ผลเทสจะได้ไม่ขึ้นกับว่าเครื่องไหนตั้ง VITE_PROMPTPAY_ID
vi.mock('@/lib/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/config')>()),
  PROMPTPAY_ID: '0812345678',
  IS_DEMO_PROMPTPAY: true,
}))
// แผงข้าง/ตารางบิลมีเทสของตัวเอง (CashDrawerBar/PaidBills/SlipIssues.test.tsx)
vi.mock('@/pages/employee/CashDrawerBar', () => ({ CashDrawerBar: () => null }))
vi.mock('@/pages/employee/PaidBills', () => ({ PaidBills: () => null }))
vi.mock('@/pages/employee/SlipIssues', () => ({ SlipIssues: () => null }))
vi.mock('@/pages/employee/ReceiptDialog', () => ({
  ReceiptDialog: ({ payment, tendered }: { payment: Payment; tendered: number | null }) => (
    <p>
      ใบเสร็จ {payment.id} รับมา {String(tendered)}
    </p>
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

const session = (id: string, tableName: string, total: number, status: TableSessionStatus = TableSessionStatus.OPEN): TableSession => ({
  id,
  tableId: `t-${id}`,
  tableName,
  token: `tok-${id}`,
  status,
  openedAt: '2026-10-24T05:30:00.000Z',
  closedAt: null,
  total,
})

const order = (sessionId: string, status: OrderStatus, id = `${sessionId}-${status}`): Order => ({
  id,
  orderRef: id.slice(0, 6).toUpperCase(),
  tableSessionId: sessionId,
  tableName: '',
  status,
  createdAt: '2026-10-24T05:40:00.000Z',
  clearedAt: null,
  items: [],
})

const checkout = (sessionId: string, paymentMethod: string | null): ServiceRequest => ({
  id: `r-${sessionId}`,
  tableSessionId: sessionId,
  tableName: '',
  type: ServiceRequestType.CHECKOUT,
  status: ServiceRequestStatus.PENDING,
  paymentMethod: paymentMethod as PaymentMethod | null,
  note: null,
  createdAt: '2026-10-24T05:50:00.000Z',
})

const query = <T,>(data: T | undefined, extra: Record<string, unknown> = {}) => ({
  data,
  isPending: data === undefined && !extra.isError,
  isError: false,
  error: null,
  refetch: vi.fn(),
  dataUpdatedAt: data === undefined ? 0 : Date.parse('2026-10-24T06:00:00.000Z'),
  ...extra,
})

let createPayment: { mutate: ReturnType<typeof vi.fn>; reset: ReturnType<typeof vi.fn>; isPending: boolean; error: unknown }
let closeSession: { mutate: ReturnType<typeof vi.fn>; reset: ReturnType<typeof vi.fn>; isPending: boolean; error: unknown }

function setup({
  sessions = [] as TableSession[] | null,
  orders = [] as Order[] | undefined,
  requests = [] as ServiceRequest[] | undefined,
  sessionsQuery = {} as Record<string, unknown>,
  ordersQuery = {} as Record<string, unknown>,
  role = Role.STAFF as Role,
  paymentError = null as unknown,
} = {}) {
  vi.mocked(useSessions).mockReturnValue(query(sessions ?? undefined, sessionsQuery) as never)
  vi.mocked(useOrders).mockReturnValue(query(orders, ordersQuery) as never)
  vi.mocked(useServiceRequests).mockReturnValue(query(requests) as never)
  createPayment = { mutate: vi.fn(), reset: vi.fn(), isPending: false, error: paymentError }
  closeSession = { mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null }
  vi.mocked(useCreatePayment).mockReturnValue(createPayment as never)
  vi.mocked(useCloseSession).mockReturnValue(closeSession as never)
  useAuth.setState({ user: { id: 'u1', email: 'e', name: 'พนักงาน', role } })
  return render(
    <MemoryRouter>
      <CheckPage />
    </MemoryRouter>,
  )
}

const tile = (tableName: string) =>
  screen.getByRole('heading', { name: `โต๊ะ ${tableName}`, level: 2 }).closest('article') as HTMLElement

const tileHeadings = () =>
  screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)

/** โต๊ะ 1 ยอด 120 เสิร์ฟครบ พร้อมรับเงิน (ลูกค้าเลือกวิธีจ่ายไว้หรือยังก็ได้) */
const readyTable = (method: string | null = null) => ({
  sessions: [session('s1', '1', 120)],
  orders: [order('s1', OrderStatus.SERVED)],
  requests: method ? [checkout('s1', method)] : [],
})

async function openPayment(user: ReturnType<typeof userEvent.setup>, opts: Parameters<typeof setup>[0] = readyTable()) {
  setup(opts)
  await user.click(screen.getByRole('button', { name: /^รับเงิน โต๊ะ 1/ }))
  return screen.getByRole('dialog', { name: 'รับเงิน โต๊ะ 1' })
}

describe('CheckPage — การ์ดโต๊ะ', () => {
  beforeEach(() => vi.clearAllMocks())

  // ทดสอบ: การ์ดโต๊ะแต่ละสถานะแสดงป้าย ปุ่ม และวิธีจ่ายถูก: ขอเช็คบิล, เสิร์ฟครบ, รอเสิร์ฟ (ไม่มีปุ่มรับเงิน), จ่ายครบ (ปิดโต๊ะได้), ยังไม่ได้สั่ง และครัวยกเลิก
  // วิธี: mock hook ให้มี 6 โต๊ะในสถานะต่างกัน → เช็กข้อความและปุ่มในการ์ดแต่ละโต๊ะ
  it('แต่ละสถานะมีป้าย ปุ่ม และข้อความวิธีจ่ายของตัวเอง', () => {
    setup({
      sessions: [
        session('a', '1', 100),
        session('b', '2', 80),
        session('c', '3', 60),
        session('d', '4', 0),
        session('e', '5', 0),
        session('f', '6', 0),
      ],
      orders: [
        order('a', OrderStatus.SERVED),
        order('b', OrderStatus.SERVED),
        order('c', OrderStatus.SERVED),
        order('c', OrderStatus.PENDING),
        order('d', OrderStatus.PAID),
        order('f', OrderStatus.CANCELLED),
      ],
      requests: [checkout('a', PaymentMethod.PROMPTPAY)],
    })

    // ขอเช็คบิล: ลูกค้าเลือกวิธีจ่ายแล้ว รับเงินได้
    expect(tile('1')).toHaveTextContent('ขอเช็คบิล')
    expect(tile('1')).toHaveTextContent('ลูกค้าเลือกPromptPay')
    expect(within(tile('1')).getByRole('button', { name: 'รับเงิน โต๊ะ 1 ฿100' })).toBeEnabled()

    // เสิร์ฟครบแต่ลูกค้ายังไม่กดเช็คบิล
    expect(tile('2')).toHaveTextContent('เสิร์ฟครบแล้ว')
    expect(tile('2')).toHaveTextContent('ยังไม่เลือกวิธีจ่าย')
    expect(within(tile('2')).getByRole('button', { name: /^รับเงิน/ })).toBeInTheDocument()

    // ยังเสิร์ฟไม่ครบ — ไม่มีปุ่มรับเงิน (backend ไม่ยอมอยู่แล้ว)
    expect(tile('3')).toHaveTextContent('รอเสิร์ฟ 1 ออเดอร์')
    expect(tile('3')).toHaveTextContent('รับเงินได้เมื่อเสิร์ฟครบ')
    expect(within(tile('3')).queryByRole('button', { name: /^รับเงิน/ })).not.toBeInTheDocument()

    // จ่ายครบแล้ว — ปิดโต๊ะได้ ไม่โชว์วิธีจ่าย
    expect(tile('4')).toHaveTextContent('เก็บเงินครบแล้ว')
    expect(tile('4')).not.toHaveTextContent('วิธีจ่าย')
    expect(within(tile('4')).getByRole('button', { name: 'ปิดโต๊ะ' })).toBeEnabled()

    // เปิดโต๊ะแต่ยังไม่สั่ง / โดนยกเลิกหมด = "ยังไม่ได้สั่ง" ไม่ใช่ "เก็บเงินครบแล้ว"
    expect(tile('5')).toHaveTextContent('ยังไม่ได้สั่ง')
    expect(tile('6')).toHaveTextContent('ยังไม่ได้สั่ง')
    expect(tile('6')).toHaveTextContent('ครัวยกเลิก 1 ออเดอร์')
  })

  // ทดสอบ: การ์ดโต๊ะเรียงตามความเร่งด่วน (ขอเช็คบิล → พร้อมเก็บ → รอเสิร์ฟ → จบแล้ว) และในกลุ่มเดียวกันเรียงเลขโต๊ะแบบตัวเลข (9 มาก่อน 10)
  // วิธี: mock 5 โต๊ะคละสถานะ → เช็กลำดับหัวการ์ด
  it('เรียงตามความเร่งด่วน: ขอเช็คบิล → พร้อมเก็บ → รอเสิร์ฟ → จบแล้ว และในกลุ่มเดียวกันเรียงเลขโต๊ะแบบตัวเลข', () => {
    setup({
      sessions: [
        session('done', '1', 0),
        session('cook', '2', 50),
        session('ready10', '10', 50),
        session('ready9', '9', 50),
        session('bill', '30', 50),
      ],
      orders: [
        order('cook', OrderStatus.PREPARING),
        order('ready10', OrderStatus.SERVED),
        order('ready9', OrderStatus.SERVED),
        order('bill', OrderStatus.SERVED),
      ],
      requests: [checkout('bill', PaymentMethod.CASH)],
    })
    expect(tileHeadings()).toEqual(['โต๊ะ 30', 'โต๊ะ 9', 'โต๊ะ 10', 'โต๊ะ 2', 'โต๊ะ 1'])
  })

  // ทดสอบ: คำขอเช็คบิลเก่าที่เลือกจ่ายบัตร (ร้านเลิกรับแล้ว) ต้องนับว่ายังไม่เลือก และกล่องรับเงินเริ่มที่เงินสด
  // วิธี: mock โต๊ะที่ขอเช็คบิลด้วย CARD → เปิดกล่องรับเงิน → เช็กป้าย "ยังไม่เลือกวิธีจ่าย" ปุ่มเงินสดถูกเลือก และไม่มีคำว่า "ลูกค้าเลือก"
  it('คำขอเช็คบิลเก่าที่เลือก CARD (ร้านเลิกรับแล้ว) → ถือว่ายังไม่เลือก และกล่องรับเงินเริ่มที่เงินสด', async () => {
    const user = userEvent.setup()
    const dialog = await openPayment(user, readyTable('CARD'))
    expect(tile('1')).toHaveTextContent('ยังไม่เลือกวิธีจ่าย')
    expect(within(dialog).getByRole('button', { name: 'เงินสด' })).toHaveAttribute('aria-pressed', 'true')
    expect(dialog).not.toHaveTextContent('ลูกค้าเลือก')
  })

  // ทดสอบ: กดปิดโต๊ะแล้ว popup บอกเหตุผลตามสถานะโต๊ะ, กดย้อนกลับต้องปิด popup และล้าง error, กดยืนยันต้องส่ง id ของบิลโต๊ะ
  // วิธี: mock โต๊ะจ่ายครบและโต๊ะที่ยังไม่สั่ง → กดปิดโต๊ะ 5 เช็กข้อความ แล้วกดย้อนกลับ เช็กว่า reset ถูกเรียก → กดปิดโต๊ะ 4 แล้วยืนยัน → เช็กว่า closeSession.mutate ได้ 'paid'
  it('ปิดโต๊ะ: popup บอกเหตุผลตามสถานะ แล้วยืนยันส่ง id ของ session', async () => {
    const user = userEvent.setup()
    setup({
      sessions: [session('paid', '4', 0), session('empty', '5', 0)],
      orders: [order('paid', OrderStatus.PAID)],
    })

    await user.click(within(tile('5')).getByRole('button', { name: 'ปิดโต๊ะ' }))
    let dialog = screen.getByRole('dialog', { name: 'ปิดโต๊ะ' })
    expect(dialog).toHaveTextContent('โต๊ะ 5')
    expect(dialog).toHaveTextContent('ยังไม่ได้สั่งอาหาร')
    await user.click(within(dialog).getByRole('button', { name: 'ย้อนกลับ' }))
    expect(closeSession.reset).toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'ปิดโต๊ะ' })).not.toBeInTheDocument()

    await user.click(within(tile('4')).getByRole('button', { name: 'ปิดโต๊ะ' }))
    dialog = screen.getByRole('dialog', { name: 'ปิดโต๊ะ' })
    expect(dialog).toHaveTextContent('เก็บเงินครบแล้ว ไม่มียอดค้างชำระ')
    await user.click(within(dialog).getByRole('button', { name: 'ปิดโต๊ะ' }))
    expect(closeSession.mutate).toHaveBeenCalledWith('paid', expect.anything())
  })
})

describe('CheckPage — หัวหน้า, ค้นหา, หน้าว่าง และ error', () => {
  beforeEach(() => vi.clearAllMocks())

  // ทดสอบ: หัวหน้าเพจบอกจำนวนโต๊ะที่เปิด ยอดค้างรับรวม และจำนวนโต๊ะที่ขอเช็คบิล โดยไม่นับโต๊ะที่ปิดแล้ว
  // วิธี: mock 2 โต๊ะเปิด + 1 โต๊ะปิด → เช็กข้อความหัวเพจ และไม่มีการ์ดโต๊ะที่ปิด
  it('หัวหน้าบอกจำนวนโต๊ะที่เปิด ยอดค้างรับรวม และจำนวนโต๊ะที่ขอเช็คบิล (ไม่นับโต๊ะที่ปิดแล้ว)', () => {
    setup({
      sessions: [
        session('a', '1', 120.5),
        session('b', '2', 80),
        session('closed', '3', 999, TableSessionStatus.CLOSED),
      ],
      orders: [order('a', OrderStatus.SERVED), order('b', OrderStatus.SERVED)],
      requests: [checkout('a', PaymentMethod.CASH)],
    })
    const header = screen.getByRole('heading', { name: 'เช็คบิล' }).parentElement as HTMLElement
    expect(header).toHaveTextContent('เปิดอยู่ 2 โต๊ะ · ค้างรับรวม ฿200.5 · ขอเช็คบิล 1 โต๊ะ')
    expect(header).toHaveTextContent('อัปเดตเองอัตโนมัติ')
    expect(screen.queryByRole('heading', { name: 'โต๊ะ 3' })).not.toBeInTheDocument()
  })

  // ทดสอบ: ถ้าไม่มีโต๊ะไหนขอเช็คบิล ต้องไม่แสดงส่วน "ขอเช็คบิล x โต๊ะ"
  // วิธี: mock โต๊ะเสิร์ฟครบที่ไม่ได้ขอเช็คบิล → เช็กว่าหัวเพจไม่มีคำว่า "ขอเช็คบิล"
  it('ไม่มีใครขอเช็คบิล → ไม่โชว์ส่วน "ขอเช็คบิล x โต๊ะ"', () => {
    setup(readyTable())
    expect(screen.getByRole('heading', { name: 'เช็คบิล' }).parentElement).not.toHaveTextContent('ขอเช็คบิล')
  })

  // ทดสอบ: ช่องค้นหาโต๊ะโผล่เมื่อมีมากกว่า 4 โต๊ะ กรองตามเลขโต๊ะได้ และบอกเมื่อไม่พบ
  // วิธี: mock 4 โต๊ะ เช็กว่าไม่มีช่องค้นหา → mock 6 โต๊ะ พิมพ์ 1 เช็กว่าเหลือโต๊ะ 1, 12, 21 → พิมพ์ ' 99 ' เช็กว่าไม่มีการ์ดและขึ้น "ไม่พบโต๊ะ"
  it('ช่องค้นหาโผล่เมื่อมีมากกว่า 4 โต๊ะ กรองตามเลขโต๊ะ และบอกเมื่อไม่พบ', async () => {
    const user = userEvent.setup()
    const four = ['1', '2', '3', '4'].map((n) => session(n, n, 10))
    const { unmount } = setup({ sessions: four })
    expect(screen.queryByPlaceholderText('ค้นหาเลขโต๊ะ')).not.toBeInTheDocument()
    unmount()

    setup({ sessions: [...four, session('12', '12', 10), session('21', '21', 10)] })
    const search = screen.getByPlaceholderText('ค้นหาเลขโต๊ะ')
    await user.type(search, '1')
    expect(tileHeadings()).toEqual(['โต๊ะ 1', 'โต๊ะ 12', 'โต๊ะ 21'])

    await user.clear(search)
    await user.type(search, ' 99 ')
    expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(0)
    expect(screen.getByText('ไม่พบโต๊ะ “99”')).toBeInTheDocument()
  })

  // ทดสอบ: ยังไม่มีโต๊ะเปิด ต้องบอกให้เปิดโต๊ะ พร้อมลิงก์ไปหน้าเปิดโต๊ะสำหรับคนที่มีสิทธิ์
  // วิธี: mock เป็น STAFF ไม่มีโต๊ะ → เช็กข้อความ และลิงก์ "เปิดโต๊ะใหม่" ชี้ไป /employee/tables
  it('ยังไม่มีโต๊ะเปิด → บอกให้เปิดโต๊ะ พร้อมปุ่มสำหรับคนที่เปิดโต๊ะได้', () => {
    setup({ role: Role.STAFF })
    expect(screen.getByText('ยังไม่มีโต๊ะที่เปิดอยู่')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'เปิดโต๊ะใหม่' })).toHaveAttribute('href', '/employee/tables')
  })

  // ทดสอบ: role ที่เปิดโต๊ะไม่ได้ (KITCHEN) ต้องไม่เห็นลิงก์เปิดโต๊ะใหม่
  // วิธี: mock เป็น KITCHEN ไม่มีโต๊ะ → เช็กว่ามีข้อความ แต่ไม่มีลิงก์
  it('role ที่เปิดโต๊ะไม่ได้ (KITCHEN) → ไม่มีปุ่มเปิดโต๊ะใหม่', () => {
    setup({ role: Role.KITCHEN })
    expect(screen.getByText('ยังไม่มีโต๊ะที่เปิดอยู่')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'เปิดโต๊ะใหม่' })).not.toBeInTheDocument()
  })

  // ทดสอบ: ระหว่างกำลังโหลด ต้องไม่ขึ้นว่า "ไม่มีโต๊ะ" และไม่มีหัวสรุป
  // วิธี: mock รายการโต๊ะเป็นยังโหลดไม่เสร็จ → เช็กว่าไม่มีทั้งสองข้อความ
  it('กำลังโหลด → ไม่บอกว่า "ไม่มีโต๊ะ" และไม่มีหัวสรุป', () => {
    setup({ sessions: null })
    expect(screen.queryByText('ยังไม่มีโต๊ะที่เปิดอยู่')).not.toBeInTheDocument()
    expect(screen.queryByText(/เปิดอยู่/)).not.toBeInTheDocument()
  })

  // ทดสอบ: โหลดรายการโต๊ะไม่ได้ ต้องขึ้นแถบ error พร้อมปุ่มลองใหม่ และห้ามบอกว่า "ยังไม่มีโต๊ะ"
  // วิธี: mock query โต๊ะเป็น error → เช็กข้อความ alert → กดลองใหม่ → เช็กว่า refetch ถูกเรียก
  it('โหลดรายการโต๊ะไม่ได้ → แถบ error + ลองใหม่ และห้ามบอกว่า "ยังไม่มีโต๊ะ"', async () => {
    const user = userEvent.setup()
    setup({ sessions: null, sessionsQuery: { isError: true, isPending: false, error: new Error('down') } })
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('โหลดรายการโต๊ะไม่ได้')
    expect(screen.queryByText('ยังไม่มีโต๊ะที่เปิดอยู่')).not.toBeInTheDocument()
    await user.click(within(alert).getByRole('button', { name: 'ลองใหม่' }))
    expect(vi.mocked(useSessions).mock.results[0].value.refetch).toHaveBeenCalled()
  })

  // ทดสอบ: โหลดสถานะออเดอร์ไม่ได้ต้องเตือน เพราะบอกไม่ได้ว่าโต๊ะไหนเสิร์ฟครบ
  // วิธี: mock query ออเดอร์เป็น error → เช็กข้อความ "โหลดสถานะออเดอร์ไม่ได้"
  it('โหลดสถานะออเดอร์ไม่ได้ → เตือน (บอกไม่ได้ว่าโต๊ะไหนเสิร์ฟครบ)', () => {
    setup({ ...readyTable(), ordersQuery: { isError: true, error: new Error('down') } })
    expect(screen.getByRole('alert')).toHaveTextContent('โหลดสถานะออเดอร์ไม่ได้')
  })
})

describe('CheckPage — กล่องรับเงิน', () => {
  beforeEach(() => vi.clearAllMocks())

  // ทดสอบ: ลูกค้าเลือก PromptPay ไว้ กล่องรับเงินต้องเริ่มที่ PromptPay บอกว่าลูกค้าเลือก และเปลี่ยนเป็นเงินสดได้
  // วิธี: เปิดกล่องรับเงินของโต๊ะที่ขอจ่าย PromptPay → เช็กข้อความและปุ่มที่ถูกเลือก → กดเงินสด → เช็กว่า QR หาย และเห็นช่อง "รับเงินมา"
  it('ลูกค้าเลือก PromptPay ไว้ → กล่องเริ่มที่ PromptPay บอกว่าลูกค้าเลือก และเปลี่ยนเป็นเงินสดได้', async () => {
    const user = userEvent.setup()
    const dialog = await openPayment(user, readyTable(PaymentMethod.PROMPTPAY))
    expect(dialog).toHaveTextContent('ลูกค้าเลือกPromptPayไว้ เปลี่ยนได้ถ้าจ่ายจริงต่างจากนี้')
    expect(within(dialog).getByRole('button', { name: 'PromptPay' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(within(dialog).getByRole('button', { name: 'เงินสด' }))
    expect(within(dialog).getByRole('button', { name: 'เงินสด' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(dialog).queryByText('ให้ลูกค้าสแกนเพื่อจ่าย')).not.toBeInTheDocument()
    expect(within(dialog).getByText('รับเงินมา')).toBeInTheDocument()
  })

  // ทดสอบ: ปุ่มเงินด่วน (พอดี + ปัดขึ้นเป็นแบงก์ถัดไป) คิดเงินทอนถูก และยอดที่รับมาไปแสดงบนใบเสร็จ (ไม่ได้ส่งไป backend)
  // วิธี: เปิดกล่องโต๊ะยอด 120 → เช็กปุ่ม พอดี ฿120, ฿150, ฿200, ฿500 → กด ฿500 เช็กเงินทอน ฿380 → กดรับเงิน เช็ก payload ที่ส่ง mutate → เรียก onSuccess เช็กว่าใบเสร็จขึ้น "รับมา 500"
  it('ปุ่มเงินด่วน: พอดี + ปัดขึ้นเป็นแบงก์ถัดไป · กดแล้วคิดเงินทอน · บันทึกแล้วใบเสร็จได้ยอดที่รับมา', async () => {
    const user = userEvent.setup()
    const dialog = await openPayment(user)
    const quick = within(dialog).getByRole('group', { name: 'จำนวนเงินที่รับมา' })
    expect(within(quick).getAllByRole('button').map((b) => b.textContent)).toEqual(['พอดี ฿120', '฿150', '฿200', '฿500'])

    await user.click(within(quick).getByRole('button', { name: '฿500' }))
    expect(within(quick).getByRole('button', { name: '฿500' })).toHaveAttribute('aria-pressed', 'true')
    expect(dialog).toHaveTextContent('เงินทอน฿380')

    await user.click(within(dialog).getByRole('button', { name: 'รับเงิน ฿120' }))
    expect(createPayment.mutate).toHaveBeenCalledWith(
      { tableSessionId: 's1', method: PaymentMethod.CASH, tableName: '1', note: '', expectedTotal: 120, amount: undefined },
      expect.anything(),
    )
    // ยอดรับมาไม่ได้ส่งไป backend แต่ต้องไปโผล่บนใบเสร็จ (เงินทอน)
    const { onSuccess } = createPayment.mutate.mock.calls[0][1]
    onSuccess({ id: 'pay-1' })
    expect(await screen.findByText('ใบเสร็จ pay-1 รับมา 500')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'รับเงิน โต๊ะ 1' })).not.toBeInTheDocument()
  })

  // ทดสอบ: ไม่กรอกเงินที่รับมา ใบเสร็จต้องไม่มียอดรับมา (null) และไม่แสดงเงินทอน
  // วิธี: เปิดกล่อง → เช็กว่าไม่มีเงินทอน → กดรับเงิน → เรียก onSuccess → เช็กว่าใบเสร็จขึ้น "รับมา null"
  it('ไม่กรอกเงินที่รับมา → ใบเสร็จไม่มียอดรับมา (null) และไม่มีเงินทอน', async () => {
    const user = userEvent.setup()
    const dialog = await openPayment(user)
    expect(dialog).not.toHaveTextContent(/เงินทอน฿/)
    await user.click(within(dialog).getByRole('button', { name: 'รับเงิน ฿120' }))
    createPayment.mutate.mock.calls[0][1].onSuccess({ id: 'pay-2' })
    expect(await screen.findByText('ใบเสร็จ pay-2 รับมา null')).toBeInTheDocument()
  })

  // ทดสอบ: รับเงินมาไม่พอต้องเตือนว่าขาดเท่าไร แต่ยังกดบันทึกได้
  // วิธี: เปิดกล่องโต๊ะ 120 → พิมพ์รับมา 100 → เช็กข้อความ "ขาดอีก ฿20" และปุ่มรับเงินยังกดได้
  it('รับเงินมาไม่พอ → เตือนว่าขาดเท่าไร แต่ยังบันทึกได้', async () => {
    const user = userEvent.setup()
    const dialog = await openPayment(user)
    await user.type(within(dialog).getByPlaceholderText('ไม่กรอกก็ได้'), '100')
    expect(dialog).toHaveTextContent('รับเงินมาไม่พอ ขาดอีก ฿20')
    expect(within(dialog).getByRole('button', { name: 'รับเงิน ฿120' })).toBeEnabled()
  })

  // ทดสอบ: ให้ส่วนลดต้องใส่เหตุผลก่อนบันทึก และเหตุผลถูกรวมกับหมายเหตุลงบิล (ตัดช่องว่างหัวท้าย)
  // วิธี: กดให้ส่วนลด กรอกราคา 100 → เช็กว่า "ลด ฿20" และปุ่มกดไม่ได้ → ใส่เหตุผลและหมายเหตุ → กดรับเงิน → เช็ก note = 'ส่วนลด ฿20: ลูกค้าประจำ · แยกถุง', amount 100
  it('ส่วนลด: ต้องใส่เหตุผลก่อนบันทึก และเหตุผลถูกรวมกับหมายเหตุลงบิล', async () => {
    const user = userEvent.setup()
    const dialog = await openPayment(user)
    await user.click(within(dialog).getByRole('button', { name: 'ให้ส่วนลด' }))
    const charged = within(dialog).getByLabelText(/ราคาที่เก็บจริง/)
    await user.clear(charged)
    await user.type(charged, '100')

    expect(dialog).toHaveTextContent('ลด ฿20')
    const submit = within(dialog).getByRole('button', { name: 'รับเงิน ฿100' })
    expect(submit).toBeDisabled()
    expect(dialog).toHaveTextContent('ใส่เหตุผลที่ลดก่อนรับเงิน')

    await user.type(within(dialog).getByLabelText(/เหตุผลที่ลด/), '  ลูกค้าประจำ ')
    await user.type(within(dialog).getByLabelText(/หมายเหตุ/), ' แยกถุง ')
    expect(submit).toBeEnabled()
    await user.click(submit)
    expect(createPayment.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ note: 'ส่วนลด ฿20: ลูกค้าประจำ · แยกถุง', amount: 100, expectedTotal: 120 }),
      expect.anything(),
    )
  })

  // ทดสอบ: กรอกราคาที่เก็บจริงเกินยอดบิลต้องเตือน และบันทึกไม่ได้
  // วิธี: กดให้ส่วนลด กรอก 130 ในโต๊ะยอด 120 → เช็กข้อความเตือน, aria-invalid และปุ่มรับเงินกดไม่ได้
  it('กรอกราคาเกินยอดบิล → เตือน และบันทึกไม่ได้', async () => {
    const user = userEvent.setup()
    const dialog = await openPayment(user)
    await user.click(within(dialog).getByRole('button', { name: 'ให้ส่วนลด' }))
    const charged = within(dialog).getByLabelText(/ราคาที่เก็บจริง/)
    await user.clear(charged)
    await user.type(charged, '130')
    expect(dialog).toHaveTextContent('เก็บเกินยอดบิลไม่ได้ สูงสุด ฿120')
    expect(charged).toHaveAttribute('aria-invalid', 'true')
    expect(within(dialog).getByRole('button', { name: /^รับเงิน ฿/ })).toBeDisabled()
  })

  // ทดสอบ: กด "ไม่ลดแล้ว" ราคาต้องกลับเป็นยอดเต็ม เหตุผลหาย และปิดส่วนลด
  // วิธี: กดให้ส่วนลด กรอก 90 และเหตุผล → กดไม่ลดแล้ว → เช็กว่าช่องราคาหาย → กดรับเงิน ฿120 → เช็กว่า note ว่าง และ amount เป็น undefined
  it('"ไม่ลดแล้ว" → ราคากลับเป็นยอดเต็ม เหตุผลหาย และปิดส่วนลด', async () => {
    const user = userEvent.setup()
    const dialog = await openPayment(user)
    await user.click(within(dialog).getByRole('button', { name: 'ให้ส่วนลด' }))
    const charged = within(dialog).getByLabelText(/ราคาที่เก็บจริง/)
    await user.clear(charged)
    await user.type(charged, '90')
    await user.type(within(dialog).getByLabelText(/เหตุผลที่ลด/), 'x')
    await user.click(within(dialog).getByRole('button', { name: 'ไม่ลดแล้ว' }))

    expect(within(dialog).queryByLabelText(/ราคาที่เก็บจริง/)).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'รับเงิน ฿120' }))
    expect(createPayment.mutate).toHaveBeenCalledWith(expect.objectContaining({ note: '', amount: undefined }), expect.anything())
  })

  // ทดสอบ: PromptPay: แสดง QR พร้อมยอดและป้ายโหมดเดโม, ต้องสแกนสลิปก่อนถึงบันทึกได้, และ Enter จากเครื่องสแกนต้องไม่ส่งฟอร์ม
  // วิธี: ล็อก config เป็นโหมดเดโมไว้ด้านบนไฟล์ → เปิดกล่อง PromptPay เช็ก QR (svg) และป้ายเดโม → ปุ่มกดไม่ได้ → พิมพ์สลิปแล้ว Enter เช็กว่ายังไม่ส่ง และขึ้น "อ่าน QR ได้แล้ว" → กดบันทึก เช็กว่าส่ง slipPayload ที่ตัดช่องว่างแล้ว
  it('PromptPay: QR พร้อมยอด + คำเตือนโหมดเดโม · ต้องสแกนสลิปก่อน · Enter จากเครื่องสแกนไม่ submit', async () => {
    const user = userEvent.setup()
    const dialog = await openPayment(user, readyTable(PaymentMethod.PROMPTPAY))
    expect(within(dialog).getByText('ให้ลูกค้าสแกนเพื่อจ่าย')).toBeInTheDocument()
    expect(dialog.querySelector('svg')).not.toBeNull()
    expect(dialog).toHaveTextContent('โหมดเดโม')

    const submit = within(dialog).getByRole('button', { name: 'รับเงิน ฿120' })
    expect(submit).toBeDisabled()

    const slip = within(dialog).getByPlaceholderText(/ยิงเครื่องสแกน/)
    await user.type(slip, '  SLIP-QR-123  {Enter}')
    expect(createPayment.mutate).not.toHaveBeenCalled()
    expect(dialog).toHaveTextContent('อ่าน QR ได้แล้ว')
    await user.click(submit)
    expect(createPayment.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ method: PaymentMethod.PROMPTPAY, slipPayload: 'SLIP-QR-123', expectedTotal: 120 }),
      expect.anything(),
    )
  })

  // ทดสอบ: PromptPay: ปุ่ม "ล้าง" ลบสลิปที่สแกนไว้ แล้วกลับไปบันทึกไม่ได้อีก
  // วิธี: เปิดกล่อง PromptPay พิมพ์สลิป → กดล้าง → เช็กว่าช่องว่าง และปุ่มรับเงินกดไม่ได้
  it('PromptPay: ปุ่ม "ล้าง" ลบสลิปที่สแกนไว้ แล้วบันทึกไม่ได้อีก', async () => {
    const user = userEvent.setup()
    const dialog = await openPayment(user, readyTable(PaymentMethod.PROMPTPAY))
    await user.type(within(dialog).getByPlaceholderText(/ยิงเครื่องสแกน/), 'SLIP')
    await user.click(within(dialog).getByRole('button', { name: 'ล้าง' }))
    expect(within(dialog).getByPlaceholderText(/ยิงเครื่องสแกน/)).toHaveValue('')
    expect(within(dialog).getByRole('button', { name: 'รับเงิน ฿120' })).toBeDisabled()
  })

  // ทดสอบ: STAFF ไม่มีตัวเลือกยืนยันรับเงิน PromptPay เองโดยไม่มีสลิป
  // วิธี: เปิดกล่อง PromptPay เป็น STAFF → เช็กว่าไม่มี checkbox ยืนยันเอง
  it('STAFF ไม่มีตัวเลือกยืนยันรับเงินเองโดยไม่มีสลิป', async () => {
    const user = userEvent.setup()
    const dialog = await openPayment(user, { ...readyTable(PaymentMethod.PROMPTPAY), role: Role.STAFF })
    expect(within(dialog).queryByRole('checkbox', { name: /ยืนยันรับเงินเอง/ })).not.toBeInTheDocument()
  })

  // ทดสอบ: ADMIN รับ PromptPay โดยไม่มีสลิปได้ ถ้าติ๊กยืนยันเองและใส่เหตุผล แล้วส่งเหตุผลไปแทนสลิป
  // วิธี: เปิดกล่อง PromptPay เป็น ADMIN → ติ๊กยืนยันเอง เช็กว่าช่องสแกนถูกปิด และปุ่มกดไม่ได้ → ใส่เหตุผลแล้วกด → เช็กว่า payload มี slipOverrideReason (ตัดช่องว่างแล้ว) และไม่มี slipPayload
  it('ADMIN ไม่มีสลิป → ติ๊กยืนยันเอง ต้องใส่เหตุผล แล้วส่งเหตุผลแทนสลิป', async () => {
    const user = userEvent.setup()
    const dialog = await openPayment(user, { ...readyTable(PaymentMethod.PROMPTPAY), role: Role.ADMIN })
    await user.click(within(dialog).getByRole('checkbox', { name: /ยืนยันรับเงินเอง \(ADMIN\)/ }))
    expect(within(dialog).getByPlaceholderText(/ยิงเครื่องสแกน/)).toBeDisabled()

    const submit = within(dialog).getByRole('button', { name: 'รับเงิน ฿120' })
    expect(submit).toBeDisabled()
    await user.type(within(dialog).getByPlaceholderText(/เช็คยอดเข้าในแอปธนาคาร/), ' เช็คแอปแล้ว ')
    await user.click(submit)

    const payload = createPayment.mutate.mock.calls[0][0]
    expect(payload).toMatchObject({ method: PaymentMethod.PROMPTPAY, slipOverrideReason: 'เช็คแอปแล้ว' })
    expect(payload).not.toHaveProperty('slipPayload')
  })

  // ทดสอบ: error จาก backend (เช่น ยอดเปลี่ยน) ต้องแสดงในกล่องรับเงิน ไม่ไปซ่อนอยู่หลังกล่อง
  // วิธี: mock useCreatePayment ให้มี error → เปิดกล่อง → เช็กว่า alert ในกล่องมีข้อความนั้น
  it('error จาก backend (เช่น ยอดเปลี่ยน) ต้องเห็นในกล่องรับเงิน ไม่ใช่หลังกล่อง', async () => {
    const user = userEvent.setup()
    const dialog = await openPayment(user, { ...readyTable(), paymentError: new Error('ยอดเปลี่ยนไปแล้ว กรุณาเปิดใหม่') })
    expect(within(dialog).getByRole('alert')).toHaveTextContent('ยอดเปลี่ยนไปแล้ว กรุณาเปิดใหม่')
  })

  // ทดสอบ: กด "ย้อนกลับ" ต้องปิดกล่องโดยไม่บันทึก และล้าง error เดิม
  // วิธี: เปิดกล่อง → กดย้อนกลับ → เช็กว่ากล่องหาย, reset ถูกเรียก และ mutate ไม่ถูกเรียก
  it('"ย้อนกลับ" → ปิดกล่องโดยไม่บันทึก และล้าง error เดิม', async () => {
    const user = userEvent.setup()
    const dialog = await openPayment(user)
    await user.click(within(dialog).getByRole('button', { name: 'ย้อนกลับ' }))
    expect(screen.queryByRole('dialog', { name: 'รับเงิน โต๊ะ 1' })).not.toBeInTheDocument()
    expect(createPayment.reset).toHaveBeenCalled()
    expect(createPayment.mutate).not.toHaveBeenCalled()
  })
})
