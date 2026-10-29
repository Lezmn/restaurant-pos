import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useToasts } from '@/components/ui/toast'
import { useCategories, useMenuItems } from '@/features/menu/hooks'
import { useCreateTakeawayOrder, useOrders } from '@/features/orders/hooks'
import { OrderStatus } from '@/types/enums'
import type { MenuItem, Order } from '@/types/models'
import { TakeawayPage } from '@/pages/employee/TakeawayPage'
import { closed, kaprao, menu, soldOut, tea } from './menu-fixtures'

// หน้าจริงเทสบนเบราว์เซอร์แล้ว (test/e2e/cashier/…) — ที่นี่เทส logic ตะกร้า/ตัวเลือก/คิว ที่ E2E ไล่ไม่ครบ
vi.mock('@/features/menu/hooks', () => ({ useMenuItems: vi.fn(), useCategories: vi.fn() }))
vi.mock('@/features/orders/hooks', () => ({ useCreateTakeawayOrder: vi.fn(), useOrders: vi.fn() }))
const navigate = vi.hoisted(() => vi.fn())
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
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

const categories = [
  { id: 'c-drink', name: 'เครื่องดื่ม', sortOrder: 2 },
  { id: 'c-main', name: 'จานเดียว', sortOrder: 1 },
  { id: 'c-unused', name: 'ของหวาน', sortOrder: 3 },
]

let mutate: ReturnType<typeof vi.fn>
let refetch: ReturnType<typeof vi.fn>

function setup({
  items = [soldOut, kaprao, tea, closed] as MenuItem[] | undefined,
  orders = [] as Order[],
  menuExtra = {} as Record<string, unknown>,
  createExtra = {} as Record<string, unknown>,
} = {}) {
  mutate = vi.fn()
  refetch = vi.fn()
  vi.mocked(useMenuItems).mockReturnValue({
    data: items,
    isPending: false,
    isError: false,
    error: null,
    refetch,
    ...menuExtra,
  } as never)
  vi.mocked(useCategories).mockReturnValue({ data: categories } as never)
  vi.mocked(useCreateTakeawayOrder).mockReturnValue({ mutate, isPending: false, error: null, ...createExtra } as never)
  vi.mocked(useOrders).mockReturnValue({ data: orders } as never)
  const user = userEvent.setup()
  const view = render(
    <MemoryRouter>
      <TakeawayPage />
    </MemoryRouter>,
  )
  return { user, ...view }
}

const card = (name: RegExp | string) => screen.getByRole('button', { name })
const cart = () => screen.getByRole('region', { name: 'ตะกร้า' })
const cartLines = () => within(cart()).queryAllByRole('listitem')

describe('TakeawayPage — เมนู', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useToasts.setState({ toasts: [] })
  })

  // ทดสอบ: แท็บหมวดโชว์เฉพาะหมวดที่มีเมนู เรียงตาม sortOrder และกรองเมนูได้
  it('แท็บหมวดเฉพาะที่มีเมนู เรียงตาม sortOrder แล้วกรองได้', async () => {
    const { user } = setup()
    const tabs = within(screen.getByRole('group', { name: 'หมวดเมนู' })).getAllByRole('button')
    expect(tabs.map((t) => t.textContent)).toEqual(['ทั้งหมด', 'จานเดียว', 'เครื่องดื่ม'])
    await user.click(tabs[2])
    expect(tabs[2]).toHaveAttribute('aria-pressed', 'true')
    expect(card(/^ชาเย็น/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /กะเพรา/ })).not.toBeInTheDocument()
  })

  // ทดสอบ: ของหมดอยู่ท้ายสุด กดไม่ได้ และป้ายบอก "(หมด)"
  it('เมนูหมด/ปิดขาย อยู่ท้ายสุด กดไม่ได้', () => {
    setup()
    const names = within(screen.getByRole('region', { name: 'สั่งกลับบ้าน' }))
      .getAllByRole('listitem')
      .map((li) => li.querySelector('p')?.textContent)
    expect(names.slice(0, 2)).toEqual(['กะเพรา', 'ชาเย็น'])
    expect(card('ต้มยำ ฿120 (หมด)')).toBeDisabled()
    expect(card('ปิดขายอยู่ ฿50 (หมด)')).toBeDisabled()
  })

  // ทดสอบ: ค้นหาไม่เจอ บอกคำที่ค้น / หมวดว่าง บอก "ในหมวดนี้"
  it('ค้นหาไม่พบ → บอกคำที่ค้น', async () => {
    const { user } = setup()
    await user.type(screen.getByPlaceholderText('ค้นหาเมนู'), '  พิซซ่า ')
    expect(screen.getByText('ไม่พบเมนู “พิซซ่า”')).toBeInTheDocument()
  })

  // ทดสอบ: รูปเมนูโหลดไม่ขึ้น เปลี่ยนเป็นไอคอนจาน
  it('รูปเมนูเสีย → เปลี่ยนเป็นไอคอนแทน', () => {
    const { container } = setup({ items: [menu('m-img', 'ข้าวผัด', 50, { imageUrl: '/broken.jpg' })] })
    const img = container.querySelector('img[src="/broken.jpg"]') as HTMLImageElement
    fireEvent.error(img)
    expect(container.querySelector('img[src="/broken.jpg"]')).not.toBeInTheDocument()
  })

  // ทดสอบ: โหลดเมนูไม่ได้ → แถบ error ลองใหม่ได้
  it('โหลดเมนูไม่ได้ → ลองใหม่ได้', async () => {
    const { user } = setup({ items: undefined, menuExtra: { isError: true, error: new Error('down') } })
    await user.click(within(screen.getByRole('alert')).getByRole('button', { name: 'ลองใหม่' }))
    expect(refetch).toHaveBeenCalled()
  })
})

describe('TakeawayPage — ตะกร้า', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useToasts.setState({ toasts: [] })
  })

  // ทดสอบ: เมนูไม่มีตัวเลือกกดซ้ำ = เพิ่มจำนวนบรรทัดเดิม, ป้ายในตะกร้าและยอดรวมถูก
  it('กดชาเย็นสองครั้ง → บรรทัดเดียว จำนวน 2 ยอด ฿50 และการ์ดบอกว่าอยู่ในตะกร้า', async () => {
    const { user } = setup()
    expect(cart()).toHaveTextContent('ยังไม่มีรายการ')
    await user.click(card(/^ชาเย็น/))
    await user.click(card(/^ชาเย็น/))
    expect(cartLines()).toHaveLength(1)
    expect(cart()).toHaveTextContent('2 รายการ')
    expect(cart()).toHaveTextContent('฿50')
    expect(card('ชาเย็น ฿25 · ในตะกร้า 2')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('เพิ่ม ชาเย็น 1 ลงตะกร้าแล้ว')
    expect(screen.getByRole('link', { name: /ตะกร้า 2 รายการ/ })).toHaveAttribute('href', '#takeaway-cart')
  })

  // ทดสอบ: มีหมายเหตุแล้ว กดเพิ่มอีกต้องแตกบรรทัดใหม่ (ไม่รวมกับบรรทัดที่มีหมายเหตุ)
  it('บรรทัดที่มีหมายเหตุ → กดเพิ่มอีกแตกบรรทัดใหม่', async () => {
    const { user } = setup()
    await user.click(card(/^ชาเย็น/))
    await user.type(screen.getByLabelText('หมายเหตุของ ชาเย็น'), 'หวานน้อย')
    await user.click(card(/^ชาเย็น/))
    expect(cartLines()).toHaveLength(2)
  })

  // ทดสอบ: เมนูมีตัวเลือก เปิดกล่องเลือก ต้องเลือกเนื้อสัตว์ก่อน ราคาคิดรวมตัวเลือก × จำนวน
  it('กะเพรา → กล่องเลือกตัวเลือก บังคับเนื้อสัตว์ ราคา × จำนวน แล้วลงตะกร้าพร้อมชื่อตัวเลือก', async () => {
    const { user } = setup()
    await user.click(card(/^กะเพรา/))
    const dialog = screen.getByRole('dialog', { name: 'กะเพรา' })
    expect(within(dialog).getByRole('button', { name: 'เลือกเนื้อสัตว์ก่อน' })).toBeDisabled()
    expect(within(dialog).queryByText(/^เนื้อ \+/)).not.toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'ไก่' }))
    await user.click(within(dialog).getByRole('button', { name: 'กุ้ง +฿20' }))
    expect(within(dialog).getByRole('button', { name: 'ไก่' })).toHaveAttribute('aria-pressed', 'false')
    const egg = within(dialog).getByRole('button', { name: 'ไข่ดาว +฿10' })
    await user.click(egg)
    await user.click(egg)
    await user.click(egg)
    await user.click(within(dialog).getByRole('button', { name: 'เพิ่มจำนวน' }))
    await user.type(within(dialog).getByLabelText('หมายเหตุของ กะเพรา'), '  ไม่เผ็ด  ')
    await user.click(within(dialog).getByRole('button', { name: 'ใส่ตะกร้า ฿180' })) // (60+20+10) × 2

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(cartLines()[0]).toHaveTextContent('กุ้ง, ไข่ดาว')
    expect(cartLines()[0]).toHaveTextContent('฿180')
    expect(screen.getByLabelText('หมายเหตุของ กะเพรา')).toHaveValue('ไม่เผ็ด')
  })

  // ทดสอบ: ปิดกล่องเลือกตัวเลือก ไม่ลงตะกร้า
  it('ปิดกล่องเลือกตัวเลือก (Esc) → ไม่ลงตะกร้า', async () => {
    const { user } = setup()
    await user.click(card(/^กะเพรา/))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(cartLines()).toHaveLength(0)
  })

  // ทดสอบ: ปรับจำนวน/ลบบรรทัด และล้างตะกร้าแล้วเลิกทำจาก toast ได้
  it('ปรับจำนวน ลบบรรทัด ล้างตะกร้า แล้วเลิกทำได้', async () => {
    const { user } = setup()
    await user.click(card(/^ชาเย็น/))
    await user.click(card(/^ชาเย็น/))
    await user.click(within(cartLines()[0]).getByRole('button', { name: 'ลดจำนวน' }))
    expect(cart()).toHaveTextContent('1 รายการ')
    await user.click(within(cartLines()[0]).getByRole('button', { name: 'ลบ ชาเย็น' }))
    expect(cartLines()).toHaveLength(0)

    await user.click(card(/^ชาเย็น/))
    await user.click(within(cart()).getByRole('button', { name: 'ล้างตะกร้า' }))
    expect(cartLines()).toHaveLength(0)
    const [t] = useToasts.getState().toasts
    expect(t.message).toBe('ล้างตะกร้าแล้ว (1 รายการ)')
    act(() => t.action?.run())
    expect(cartLines()).toHaveLength(1)
  })

  // ทดสอบ: ของในตะกร้าหมดระหว่างจัด → เตือนที่บรรทัด และกดรับเงินไม่ได้
  it('ของในตะกร้าหมดระหว่างนั้น → เตือน "หมดแล้ว" และปุ่มจ่ายกดไม่ได้', async () => {
    const { user, rerender } = setup()
    await user.click(card(/^ชาเย็น/))
    vi.mocked(useMenuItems).mockReturnValue({
      data: [kaprao, { ...tea, isAvailable: false }],
      isPending: false,
      isError: false,
    } as never)
    rerender(
      <MemoryRouter>
        <TakeawayPage />
      </MemoryRouter>,
    )
    expect(cartLines()[0]).toHaveTextContent('หมดแล้ว — ลบออกก่อนส่ง')
    expect(within(cart()).getByRole('button', { name: 'เงินสด' })).toBeDisabled()
    expect(within(cart()).getByRole('button', { name: 'PromptPay' })).toBeDisabled()
  })

  // ทดสอบ: ตัวเลือกที่เลือกไว้หมดระหว่างจัดตะกร้า ก็ต้องเตือนเหมือนกัน
  it('ตัวเลือกในตะกร้าหมดระหว่างนั้น → เตือนที่บรรทัด', async () => {
    const { user, rerender } = setup()
    await user.click(card(/^กะเพรา/))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'หมู' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /ใส่ตะกร้า/ }))
    const noPork = {
      ...kaprao,
      optionGroups: kaprao.optionGroups.map((g) => ({ ...g, options: g.options.filter((o) => o.id !== 'o-pork') })),
    }
    vi.mocked(useMenuItems).mockReturnValue({ data: [noPork, tea], isPending: false, isError: false } as never)
    rerender(
      <MemoryRouter>
        <TakeawayPage />
      </MemoryRouter>,
    )
    expect(cartLines()[0]).toHaveTextContent('หมดแล้ว')
  })

  // ทดสอบ: กดเงินสด → ส่งบิลพร้อมชื่อลูกค้า แล้วไปหน้ารับเงินพร้อมวิธีจ่าย, ล้างตะกร้า
  it.each([
    ['เงินสด', 'CASH'],
    ['PromptPay', 'PROMPTPAY'],
  ])('กด %s → ส่งบิลแล้วไปหน้ารับเงิน method=%s และล้างตะกร้า', async (label, method) => {
    const { user } = setup()
    await user.click(card(/^ชาเย็น/))
    await user.type(screen.getByPlaceholderText('เช่น คุณเอ 081-xxx'), 'คุณเอ')
    await user.click(within(cart()).getByRole('button', { name: label }))
    expect(mutate).toHaveBeenCalledWith(
      {
        customerName: 'คุณเอ',
        lines: [{ menuItemId: 'm-tea', quantity: 1, note: '', optionIds: [] }],
        customLines: [],
      },
      expect.anything(),
    )
    act(() => mutate.mock.calls[0][1].onSuccess({ tableSessionId: 'ts9' }))
    expect(navigate).toHaveBeenCalledWith(`/employee/check?pay=ts9&method=${method}`)
    expect(cartLines()).toHaveLength(0)
    expect(screen.getByPlaceholderText('เช่น คุณเอ 081-xxx')).toHaveValue('')
  })

  // ทดสอบ: กดจ่ายซ้ำเร็ว ๆ ส่งบิลเดียว จนกว่าจะ settle
  it('กดเงินสดสองครั้งติด → ส่งบิลเดียว ปลดล็อกหลัง onSettled', async () => {
    const { user } = setup()
    await user.click(card(/^ชาเย็น/))
    const cash = within(cart()).getByRole('button', { name: 'เงินสด' })
    await user.click(cash)
    await user.click(cash)
    expect(mutate).toHaveBeenCalledTimes(1)
    act(() => mutate.mock.calls[0][1].onSettled())
    await user.click(cash)
    expect(mutate).toHaveBeenCalledTimes(2)
  })

  // ทดสอบ: กำลังส่งปุ่มจ่ายเปลี่ยนข้อความ และ error ของ backend โชว์ในตะกร้า
  it('กำลังส่ง → ปุ่ม "กำลังส่ง..." และ error โชว์ในตะกร้า', () => {
    setup({ createExtra: { isPending: true, error: new Error('ครัวปิดแล้ว') } })
    expect(within(cart()).getAllByRole('button', { name: 'กำลังส่ง...' })).toHaveLength(2)
    expect(cart()).toHaveTextContent('ครัวปิดแล้ว')
  })
})

describe('TakeawayPage — คิวกลับบ้าน', () => {
  beforeEach(() => vi.clearAllMocks())

  const order = (id: string, sessionId: string, extra: Partial<Order> = {}): Order => ({
    id,
    orderRef: id,
    tableSessionId: sessionId,
    tableName: '',
    placeLabel: `กลับบ้าน #${sessionId}`,
    isTakeaway: true,
    paid: false,
    status: OrderStatus.PENDING,
    createdAt: '2026-10-29T05:00:00.000Z',
    clearedAt: null,
    items: [],
    ...extra,
  })

  // ทดสอบ: ไม่มีคิว ไม่ต้องโชว์ส่วนคิว
  it('ไม่มีคิว → ไม่แสดงส่วนคิว', () => {
    setup({ orders: [order('x', '1', { isTakeaway: false })] })
    expect(screen.queryByRole('region', { name: /คิวกลับบ้าน/ })).not.toBeInTheDocument()
  })

  // ทดสอบ: รวมออเดอร์ตามบิล เรียงตามเวลาสั่ง สถานะ/จ่ายแล้ว ถูก และตัดของที่ยกไปแล้ว/ยกเลิก/ไม่ใช่กลับบ้าน
  it('จับกลุ่มตามบิล เรียงตามเวลาสั่ง บอกสถานะครัวและการจ่าย', () => {
    setup({
      orders: [
        order('a1', '2', { status: OrderStatus.SERVED, paid: true, createdAt: '2026-10-29T05:10:00.000Z' }),
        order('b1', '1', { status: OrderStatus.PREPARING }),
        order('b2', '1', { status: OrderStatus.PENDING }),
        order('c1', '3', { createdAt: '2026-10-29T05:20:00.000Z' }),
        order('d1', '4', { clearedAt: '2026-10-29T05:30:00.000Z' }),
        order('e1', '5', { status: OrderStatus.CANCELLED }),
        order('f1', '6', { isTakeaway: false }),
      ],
    })
    const queue = screen.getByRole('region', { name: /คิวกลับบ้าน/ })
    expect(queue).toHaveTextContent('(3)')
    const rows = within(queue).getAllByRole('listitem')
    expect(rows.map((r) => r.querySelector('p')?.textContent)).toEqual(['กลับบ้าน #1', 'กลับบ้าน #2', 'กลับบ้าน #3'])
    expect(rows[0]).toHaveTextContent('กำลังทำ')
    expect(within(rows[0]).getByRole('link', { name: 'รับเงิน' })).toHaveAttribute('href', '/employee/check?pay=1')
    expect(rows[1]).toHaveTextContent('เสร็จแล้ว รอรับ')
    expect(rows[1]).toHaveTextContent('จ่ายแล้ว')
    expect(rows[2]).toHaveTextContent('รอคิวครัว')
  })
})
