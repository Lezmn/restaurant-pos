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
vi.mock('@/features/payments/hooks', () => ({
  useCreatePayment: vi.fn(),
  // ใช้ตัดสิน layout เท่านั้น (ตารางบิลกว้างเต็มเมื่อไม่มีสลิปค้าง) — แผงสลิปเองถูก mock ทิ้งด้านล่าง
  useSlipIssuePayments: () => ({ data: [] }),
}))
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
  ReceiptDialog: ({ payment, tendered, onPrinted }: { payment: Payment; tendered: number | null; onPrinted?: () => void }) => (
    <p>
      ใบเสร็จ {payment.id} รับมา {String(tendered)}
      {/* แทนการสั่งพิมพ์อัตโนมัติจบ */}
      {onPrinted && <button onClick={onPrinted}>พิมพ์เสร็จ</button>}
    </p>
  ),
}))
vi.mock('@/pages/employee/AttachSlipDialog', () => ({
  AttachSlipDialog: ({ payment }: { payment: Payment }) => <p>ตรวจสลิปของ {payment.id}</p>,
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
  placeLabel: `โต๊ะ ${tableName}`,
  isTakeaway: false,
  takeawayNo: null,
  customerName: null,
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
  placeLabel: '',
  isTakeaway: false,
  paid: status === OrderStatus.PAID,
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

/** โต๊ะ 1 ยอด 120 เสิร์ฟครบ พร้อมรับเงิน (ส่ง method มา = ลูกค้ากดเช็คบิลแล้ว) */
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

/** ลูกค้าไม่ได้เลือกวิธีจ่ายแล้ว — กล่องเริ่มที่เงินสดเสมอ แคชเชียร์กดเปลี่ยนเป็น PromptPay เอง */
async function openPromptPay(user: ReturnType<typeof userEvent.setup>, opts: Parameters<typeof setup>[0] = readyTable()) {
  const dialog = await openPayment(user, opts)
  await user.click(within(dialog).getByRole('button', { name: 'PromptPay' }))
  return dialog
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

    // ขอเช็คบิล: รับเงินได้ — ลูกค้าไม่ได้เลือกวิธีจ่ายแล้ว การ์ดจึงไม่บอกวิธีจ่าย
    expect(tile('1')).toHaveTextContent('ขอเช็คบิล')
    expect(tile('1')).not.toHaveTextContent('ลูกค้าเลือก')
    expect(within(tile('1')).getByRole('button', { name: 'รับเงิน โต๊ะ 1 ฿100' })).toBeEnabled()

    // เสิร์ฟครบแต่ลูกค้ายังไม่กดเช็คบิล — ก็รับเงินได้
    expect(tile('2')).toHaveTextContent('เสิร์ฟครบแล้ว')
    expect(tile('2')).not.toHaveTextContent('ยังไม่เลือกวิธีจ่าย')
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

  // ทดสอบ: ลูกค้าขอเช็คบิลตอนยังเสิร์ฟไม่ครบ → แคชเชียร์ต้องเห็นทันที แต่ยังรับเงินไม่ได้ (backend ไม่ยอม)
  // วิธี: mock โต๊ะรอเสิร์ฟที่ขอบิล + โต๊ะรอเสิร์ฟเฉย ๆ + โต๊ะเสิร์ฟครบ → เช็กป้ายสองอัน ไม่มีปุ่มรับเงิน ตัวนับหัวเพจ และลำดับการ์ด
  it('ขอเช็คบิลตอนยังรอเสิร์ฟ: ขึ้นป้ายขอเช็คบิล + รอเสิร์ฟ, นับในหัวเพจ, ขึ้นก่อนโต๊ะรอเสิร์ฟอื่น แต่ยังรับเงินไม่ได้', () => {
    setup({
      sessions: [session('cook', '1', 50), session('ready', '2', 50), session('wait', '3', 60)],
      orders: [
        order('cook', OrderStatus.PREPARING),
        order('ready', OrderStatus.SERVED),
        order('wait', OrderStatus.SERVED),
        order('wait', OrderStatus.PENDING),
      ],
      requests: [checkout('wait', null)],
    })

    expect(tile('3')).toHaveTextContent('ขอเช็คบิล')
    expect(tile('3')).toHaveTextContent('รอเสิร์ฟ 1 ออเดอร์')
    expect(tile('3')).toHaveTextContent('รับเงินได้เมื่อเสิร์ฟครบ')
    expect(within(tile('3')).queryByRole('button', { name: /^รับเงิน/ })).not.toBeInTheDocument()
    expect(tile('1')).not.toHaveTextContent('ขอเช็คบิล')

    const header = screen.getByRole('heading', { name: 'เช็คบิล' }).parentElement as HTMLElement
    expect(header).toHaveTextContent('ขอเช็คบิล 1 โต๊ะ')
    // ลูกค้ารอจ่ายอยู่ ขึ้นก่อนโต๊ะที่พร้อมเก็บแต่ไม่มีใครขอ — เรียงแค่การ์ดหน้านี้ ไม่ใช่คิวครัว
    expect(tileHeadings()).toEqual(['โต๊ะ 3', 'โต๊ะ 2', 'โต๊ะ 1'])
  })

  // ทดสอบ: คำขอเช็คบิลเก่าที่ยังมีวิธีจ่ายติดมา (ก่อนเลิกให้ลูกค้าเลือก) ต้องไม่มีผล กล่องรับเงินเริ่มที่เงินสดเสมอ
  // วิธี: mock คำขอเช็คบิลที่มี paymentMethod เป็น PROMPTPAY และ CARD → เปิดกล่องรับเงิน → เช็กว่าปุ่มเงินสดถูกเลือก และไม่มีคำว่า "ลูกค้าเลือก"
  it.each([PaymentMethod.PROMPTPAY, 'CARD'])(
    'คำขอเช็คบิลเก่าที่มีวิธีจ่าย %s ติดมา → กล่องรับเงินเริ่มที่เงินสดเสมอ',
    async (method) => {
      const user = userEvent.setup()
      const dialog = await openPayment(user, readyTable(method))
      expect(within(dialog).getByRole('button', { name: 'เงินสด' })).toHaveAttribute('aria-pressed', 'true')
      expect(dialog).not.toHaveTextContent('ลูกค้าเลือก')
    },
  )

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

  // ทดสอบ: กล่องรับเงินเริ่มที่เงินสด แคชเชียร์สลับเป็น PromptPay (เห็น QR) และกลับเป็นเงินสดได้
  // วิธี: เปิดกล่อง → เช็กเงินสดถูกเลือก → กด PromptPay เช็ก QR → กดเงินสด → เช็กว่า QR หาย และเห็นช่อง "รับเงินมา"
  it('กล่องรับเงินเริ่มที่เงินสด สลับเป็น PromptPay แล้วกลับเป็นเงินสดได้', async () => {
    const user = userEvent.setup()
    const dialog = await openPayment(user, readyTable(PaymentMethod.CASH))
    expect(within(dialog).getByRole('button', { name: 'เงินสด' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(dialog).getByRole('button', { name: 'PromptPay' }))
    expect(within(dialog).getByRole('button', { name: 'PromptPay' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(dialog).getByText('ให้ลูกค้าสแกนเพื่อจ่าย')).toBeInTheDocument()

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

    await user.click(within(dialog).getByRole('button', { name: 'รับเงิน' }))
    expect(createPayment.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        tableSessionId: 's1',
        method: PaymentMethod.CASH,
        tableName: '1',
        isTakeaway: false,
        note: '',
        expectedTotal: 120,
        discountPercent: undefined,
      }),
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
    await user.click(within(dialog).getByRole('button', { name: 'รับเงิน' }))
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
    expect(within(dialog).getByRole('button', { name: 'รับเงิน' })).toBeEnabled()
  })

  // ทดสอบ: ส่วนลดเป็น % — คิดยอดเก็บจริงถูก ต้องใส่เหตุผลก่อนบันทึก และเหตุผลถูกรวมกับหมายเหตุลงบิล (ตัดช่องว่างหัวท้าย)
  // วิธี: กดให้ส่วนลด กรอก 20% ในโต๊ะยอด 120 → เช็กแถบยอดเห็น ฿96 และปุ่มกดไม่ได้ → ใส่เหตุผลและหมายเหตุ → กดรับเงิน → เช็ก note, discountPercent 20 และ expectedTotal เป็นยอดก่อนลด
  it('ส่วนลด %: คิดยอดลดถูก ต้องใส่เหตุผลก่อนบันทึก และเหตุผลถูกรวมกับหมายเหตุลงบิล', async () => {
    const user = userEvent.setup()
    const dialog = await openPayment(user)
    await user.click(within(dialog).getByRole('button', { name: 'ให้ส่วนลด' }))
    await user.type(within(dialog).getByLabelText(/ลดกี่ %/), '20')

    expect(within(dialog).getByText('ยอดที่ต้องจ่าย').parentElement).toHaveTextContent('฿96')
    const submit = within(dialog).getByRole('button', { name: 'รับเงิน' })
    expect(submit).toBeDisabled()
    expect(dialog).toHaveTextContent('ใส่เหตุผลที่ลดก่อนรับเงิน')

    await user.type(within(dialog).getByLabelText(/เหตุผลที่ลด/), '  ลูกค้าประจำ ')
    await user.click(within(dialog).getByRole('button', { name: 'เพิ่มหมายเหตุ' }))
    await user.type(within(dialog).getByLabelText(/หมายเหตุ/), ' แยกถุง ')
    expect(submit).toBeEnabled()
    await user.click(submit)
    expect(createPayment.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        note: 'ส่วนลด 20% (฿24): ลูกค้าประจำ · แยกถุง',
        discountPercent: 20,
        expectedTotal: 120,
      }),
      expect.anything(),
    )
  })

  // ทดสอบ: เงินสดที่มีส่วนลด ยอดเก็บปัดครึ่งขึ้นเป็นบาทเต็ม (ทอนสตางค์ไม่ได้) แต่ PromptPay เก็บตามสตางค์จริง
  // วิธี: โต๊ะยอด 120 ลด 7% (= 8.40 เก็บ 111.60) → แถบยอดเงินสดต้องเห็น ฿112 → เปลี่ยนเป็น PromptPay ต้องเห็น ฿111.60
  it('ส่วนลด % เงินสด: ปัดยอดเก็บครึ่งขึ้นเป็นบาทเต็ม PromptPay ไม่ปัด', async () => {
    const user = userEvent.setup()
    const dialog = await openPayment(user)
    await user.click(within(dialog).getByRole('button', { name: 'ให้ส่วนลด' }))
    await user.type(within(dialog).getByLabelText(/ลดกี่ %/), '7')

    expect(within(dialog).getByText('ยอดที่ต้องจ่าย').parentElement).toHaveTextContent('฿112')
    expect(within(dialog).getByRole('button', { name: 'รับเงิน' })).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'PromptPay' }))
    expect(within(dialog).getByText('ยอดที่ต้องจ่าย').parentElement).toHaveTextContent('฿111.6')
  })

  // ทดสอบ: แถบยอดด้านบนโชว์ยอดเก็บจริงหลังลด และขีดฆ่ายอดเดิม — ปุ่มรับเงินไม่มียอดแล้ว ยอดต้องอยู่จุดเดียว
  // วิธี: โต๊ะยอด 120 → แถบเห็น ฿120 ไม่มีขีดฆ่า → ลด 10% → แถบเห็น ฿108 ตัวใหญ่ ฿120 ขีดฆ่า → ไม่ลดแล้ว → กลับเป็น ฿120
  it('แถบยอดด้านบน: มีส่วนลดโชว์ยอดเก็บจริง ยอดเดิมขีดฆ่า', async () => {
    const user = userEvent.setup()
    const dialog = await openPayment(user)
    const banner = within(dialog).getByText('ยอดที่ต้องจ่าย').parentElement!
    expect(banner).toHaveTextContent('฿120')
    expect(banner.querySelector('s')).toBeNull()

    await user.click(within(dialog).getByRole('button', { name: 'ให้ส่วนลด' }))
    await user.type(within(dialog).getByLabelText(/ลดกี่ %/), '10')
    expect(banner.querySelector('s')).toHaveTextContent('฿120')
    expect(banner).toHaveTextContent('฿108')

    await user.click(within(dialog).getByRole('button', { name: 'ไม่ลดแล้ว' }))
    expect(banner.querySelector('s')).toBeNull()
    expect(banner).toHaveTextContent('฿120')
  })

  // ทดสอบ: ช่องหมายเหตุซ่อนอยู่หลังปุ่ม กดแล้วเปิด พิมพ์ได้ และ "ไม่ใส่หมายเหตุ" ล้างข้อความแล้วปิดกลับ
  // วิธี: เปิดกล่อง → ยังไม่มีช่องหมายเหตุ → กดเพิ่มหมายเหตุ → พิมพ์ → กดไม่ใส่หมายเหตุ → ช่องหาย → กดรับเงิน → note ว่าง
  it('หมายเหตุซ่อนหลังปุ่ม: เปิดแล้วพิมพ์ได้ "ไม่ใส่หมายเหตุ" ล้างแล้วปิด', async () => {
    const user = userEvent.setup()
    const dialog = await openPayment(user)
    expect(within(dialog).queryByLabelText(/หมายเหตุ/)).not.toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'เพิ่มหมายเหตุ' }))
    const field = within(dialog).getByLabelText(/หมายเหตุ/)
    expect(field).toHaveFocus()
    await user.type(field, 'ขอใบกำกับภาษี')

    await user.click(within(dialog).getByRole('button', { name: 'ไม่ใส่หมายเหตุ' }))
    expect(within(dialog).queryByLabelText(/หมายเหตุ/)).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'รับเงิน' }))
    expect(createPayment.mutate).toHaveBeenCalledWith(expect.objectContaining({ note: '' }), expect.anything())
  })

  // ทดสอบ: ปุ่ม % ที่ใช้บ่อย กดทีเดียวได้ส่วนลดเลย และปุ่มที่เลือกอยู่ถูกกดค้าง
  // วิธี: กดให้ส่วนลด → กด "10%" → เช็กช่อง % เป็น 10, ปุ่ม aria-pressed และแถบยอดเห็น ฿108
  it('ปุ่ม % ด่วน: กด 10% แล้วได้ส่วนลด 10% ทันที', async () => {
    const user = userEvent.setup()
    const dialog = await openPayment(user)
    await user.click(within(dialog).getByRole('button', { name: 'ให้ส่วนลด' }))
    await user.click(within(dialog).getByRole('button', { name: '10%' }))
    expect(within(dialog).getByLabelText(/ลดกี่ %/)).toHaveValue(10)
    expect(within(dialog).getByRole('button', { name: '10%' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(dialog).getByText('ยอดที่ต้องจ่าย').parentElement).toHaveTextContent('฿108')
    expect(within(dialog).getByRole('button', { name: 'รับเงิน' })).toBeDisabled()
  })

  // ทดสอบ: กรอก % ที่ไม่ใช่จำนวนเต็ม 1-100 ต้องเตือน และบันทึกไม่ได้
  // วิธี: กดให้ส่วนลด กรอก 150 → เช็กข้อความเตือน, aria-invalid และปุ่มรับเงินกดไม่ได้
  it('กรอก % เกิน 100 → เตือน และบันทึกไม่ได้', async () => {
    const user = userEvent.setup()
    const dialog = await openPayment(user)
    await user.click(within(dialog).getByRole('button', { name: 'ให้ส่วนลด' }))
    const percent = within(dialog).getByLabelText(/ลดกี่ %/)
    await user.type(percent, '150')
    expect(dialog).toHaveTextContent('ใส่เป็นจำนวนเต็ม 1-100')
    expect(percent).toHaveAttribute('aria-invalid', 'true')
    expect(within(dialog).getByRole('button', { name: 'รับเงิน' })).toBeDisabled()
  })

  // ทดสอบ: กด "ไม่ลดแล้ว" ยอดต้องกลับเป็นยอดเต็ม เหตุผลหาย และปิดส่วนลด
  // วิธี: กดให้ส่วนลด กรอก 10% และเหตุผล → กดไม่ลดแล้ว → เช็กว่าช่อง % หาย → กดรับเงิน → เช็กว่า note ว่าง และ discountPercent เป็น undefined
  it('"ไม่ลดแล้ว" → ยอดกลับเป็นยอดเต็ม เหตุผลหาย และปิดส่วนลด', async () => {
    const user = userEvent.setup()
    const dialog = await openPayment(user)
    await user.click(within(dialog).getByRole('button', { name: 'ให้ส่วนลด' }))
    await user.type(within(dialog).getByLabelText(/ลดกี่ %/), '10')
    await user.type(within(dialog).getByLabelText(/เหตุผลที่ลด/), 'x')
    await user.click(within(dialog).getByRole('button', { name: 'ไม่ลดแล้ว' }))

    expect(within(dialog).queryByLabelText(/ลดกี่ %/)).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'รับเงิน' }))
    expect(createPayment.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ note: '', discountPercent: undefined }),
      expect.anything(),
    )
  })

  // ทดสอบ: PromptPay: แสดง QR พร้อมยอดและป้ายโหมดเดโม ไม่มีช่องสแกนสลิปในกล่องแล้ว — ปุ่มเป็น "พิมพ์ใบเสร็จ" ส่ง slipLater
  // วิธี: ล็อก config เป็นโหมดเดโมไว้ด้านบนไฟล์ → เปิดกล่อง PromptPay เช็ก QR (svg) ป้ายเดโม และไม่มีช่องสแกนสลิป → กดพิมพ์ใบเสร็จ → เช็ก payload มี slipLater ไม่มี slipPayload → onSuccess แล้วขึ้นใบเสร็จ
  it('PromptPay: QR พร้อมยอด + คำเตือนโหมดเดโม · ไม่ต้องสแกนสลิป · "พิมพ์ใบเสร็จ" ส่ง slipLater', async () => {
    const user = userEvent.setup()
    const dialog = await openPromptPay(user)
    expect(within(dialog).getByText('ให้ลูกค้าสแกนเพื่อจ่าย')).toBeInTheDocument()
    expect(dialog.querySelector('svg')).not.toBeNull()
    expect(dialog).toHaveTextContent('โหมดเดโม')
    expect(within(dialog).queryByPlaceholderText(/ยิงเครื่องสแกน/)).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: /^รับเงิน/ })).not.toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'พิมพ์ใบเสร็จ' }))
    const payload = createPayment.mutate.mock.calls[0][0]
    expect(payload).toMatchObject({ method: PaymentMethod.PROMPTPAY, slipLater: true, expectedTotal: 120 })
    expect(payload).not.toHaveProperty('slipPayload')
    createPayment.mutate.mock.calls[0][1].onSuccess({ id: 'pay-pp' })
    expect(await screen.findByText('ใบเสร็จ pay-pp รับมา null')).toBeInTheDocument()

    // พิมพ์ใบเสร็จ (QR) เสร็จ → ไปหน้าตรวจสลิปของบิลนี้ต่อเลย
    await user.click(screen.getByRole('button', { name: 'พิมพ์เสร็จ' }))
    expect(screen.getByText('ตรวจสลิปของ pay-pp')).toBeInTheDocument()
    expect(screen.queryByText(/ใบเสร็จ pay-pp/)).not.toBeInTheDocument()
  })

  // ทดสอบ: เงินสดไม่ส่ง slipLater (backend จะได้ไม่ตั้งสถานะสลิปให้บิลเงินสด)
  // วิธี: เปิดกล่อง (เงินสด) → กดรับเงิน → เช็ก slipLater เป็น false
  it('เงินสด: ไม่ส่ง slipLater', async () => {
    const user = userEvent.setup()
    const dialog = await openPayment(user)
    await user.click(within(dialog).getByRole('button', { name: 'รับเงิน' }))
    expect(createPayment.mutate.mock.calls[0][0]).toMatchObject({ method: PaymentMethod.CASH, slipLater: false })
  })

  // ทดสอบ: error จาก backend (เช่น ยอดเปลี่ยน) ต้องแสดงในกล่องรับเงิน ไม่ไปซ่อนอยู่หลังกล่อง
  // วิธี: mock useCreatePayment ให้มี error → เปิดกล่อง → เช็กว่า alert ในกล่องมีข้อความนั้น
  it('error จาก backend (เช่น ยอดเปลี่ยน) ต้องเห็นในกล่องรับเงิน ไม่ใช่หลังกล่อง', async () => {
    const user = userEvent.setup()
    const dialog = await openPayment(user, { ...readyTable(), paymentError: new Error('ยอดเปลี่ยนไปแล้ว กรุณาเปิดใหม่') })
    expect(within(dialog).getByRole('alert')).toHaveTextContent('ยอดเปลี่ยนไปแล้ว กรุณาเปิดใหม่')
  })

  // ทดสอบ: error (เช่น สลิปซ้ำ) ต้องอยู่ใต้ปุ่มเพิ่มหมายเหตุ ติดปุ่มรับเงิน — กล่อง PromptPay ยาวเกินจอ ถ้าอยู่หัวกล่องจะพ้นจอตอนกดปุ่มล่างสุด
  // วิธี: mock useCreatePayment ให้มี error สลิปซ้ำ → เปิดกล่อง เลือก PromptPay → เช็กลำดับในหน้า: ปุ่มเพิ่มหมายเหตุ → alert → ปุ่มรับเงิน
  it('error อยู่ใต้ปุ่มเพิ่มหมายเหตุ ติดปุ่มรับเงิน', async () => {
    const user = userEvent.setup()
    const dialog = await openPayment(user, {
      ...readyTable(),
      paymentError: new Error('ตรวจสลิปไม่ผ่าน: สลิปนี้ถูกใช้กับบิลอื่นแล้ว'),
    })
    await user.click(within(dialog).getByRole('button', { name: 'PromptPay' }))
    const note = within(dialog).getByRole('button', { name: 'เพิ่มหมายเหตุ' })
    const alert = within(dialog).getByRole('alert')
    const submit = within(dialog).getByRole('button', { name: /^พิมพ์ใบเสร็จ/ })
    expect(alert).toHaveTextContent('สลิปนี้ถูกใช้กับบิลอื่นแล้ว')
    expect(note.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(alert.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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
