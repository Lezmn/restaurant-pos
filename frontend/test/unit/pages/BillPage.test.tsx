import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRequestCheckout, useSession, useSessionOrders } from '@/features/public/hooks'
import { OrderStatus } from '@/types/enums'
import type { Order, OrderItem } from '@/types/models'
import { CustomerBillPage } from '@/pages/customer/BillPage'

// หน้าบิลของลูกค้า (สแกน QR ที่โต๊ะ) — ข้อมูลมาจาก hook ทั้งหมด
vi.mock('@/features/public/hooks', () => ({
  useSession: vi.fn(),
  useSessionOrders: vi.fn(),
  useRequestCheckout: vi.fn(),
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

const item = (id: string, name: string, quantity: number, unitPrice: number, overrides: Partial<OrderItem> = {}): OrderItem => ({
  id,
  menuItemId: `m-${id}`,
  menuItemName: name,
  imageUrl: null,
  quantity,
  unitPrice,
  note: null,
  optionNames: [],
  optionsTotal: 0,
  ...overrides,
})

const order = (id: string, status: OrderStatus, items: OrderItem[]): Order => ({
  id,
  orderRef: id.toUpperCase(),
  tableSessionId: 's1',
  tableName: '5',
  placeLabel: 'โต๊ะ 5',
  isTakeaway: false,
  paid: false,
  status,
  createdAt: '2026-10-27T05:00:00.000Z',
  clearedAt: null,
  items,
})

const orders = [
  order('o1', OrderStatus.SERVED, [
    item('i1', 'กะเพรา', 2, 60, { optionNames: ['หมู', 'ไข่ดาว'], optionsTotal: 10 }),
    item('i2', 'ชาเย็น', 1, 35),
  ]),
  order('o2', OrderStatus.CANCELLED, [item('i3', 'ต้มยำ', 1, 120)]),
]

type Checkout = {
  mutate: ReturnType<typeof vi.fn>
  isPending: boolean
  isSuccess: boolean
  isError: boolean
  error: Error | null
}
let checkout: Checkout

function setup({
  /** null = ยังโหลดไม่เสร็จ */
  list = orders as Order[] | null,
  checkoutRequested = false,
  checkoutState = {} as Partial<Checkout>,
} = {}) {
  vi.mocked(useSession).mockReturnValue({ data: { tableName: '5', checkoutRequested } } as never)
  vi.mocked(useSessionOrders).mockReturnValue({ data: list ?? undefined, isPending: list === null } as never)
  checkout = { mutate: vi.fn(), isPending: false, isSuccess: false, isError: false, error: null, ...checkoutState }
  vi.mocked(useRequestCheckout).mockReturnValue(checkout as never)
  return render(
    <MemoryRouter initialEntries={['/t/tok/bill']}>
      <Routes>
        <Route path="/t/:token/bill" element={<CustomerBillPage />} />
        <Route path="/t/:token" element={<p>หน้าเมนู</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('CustomerBillPage — สรุปรายการและแจ้งชำระเงิน', () => {
  beforeEach(() => vi.clearAllMocks())

  // ทดสอบ: สรุปรายการบอกโต๊ะ จำนวนรายการ ตัวเลือก ยอดต่อรายการ (รวมราคาตัวเลือก) และยอดรวม โดยไม่คิดออเดอร์ที่ครัวยกเลิก
  // วิธี: mock ออเดอร์เสิร์ฟแล้ว (กะเพรา 2 จาน +ตัวเลือก 10, ชาเย็น) และออเดอร์ที่ถูกยกเลิก → เช็กข้อความ ยอด ฿175 และแจ้งว่ามีออเดอร์ถูกยกเลิก
  it('สรุปรายการ: ยอดรวมราคาตัวเลือก และไม่คิดออเดอร์ที่ถูกยกเลิก', () => {
    setup()
    expect(screen.getByText('โต๊ะ 5 : ทั้งหมด 2 รายการ')).toBeInTheDocument()
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('2กะเพรา (หมู, ไข่ดาว)฿140')
    expect(rows[1]).toHaveTextContent('1ชาเย็น฿35')
    expect(screen.queryByText(/ต้มยำ/)).not.toBeInTheDocument()
    expect(screen.getByText('มี 1 ออเดอร์ที่ถูกยกเลิก — ไม่ได้รวมอยู่ในยอดนี้')).toBeInTheDocument()
    expect(screen.getByText('รวมสุทธิ').parentElement).toHaveTextContent('฿175')
  })

  // ทดสอบ: ยังไม่มีรายการที่สั่ง (หรือถูกยกเลิกหมด) ต้องบอกว่ายังไม่มี ไม่มีปุ่มแจ้งชำระเงิน และพาไปเลือกเมนูได้
  // วิธี: mock เฉพาะออเดอร์ที่ถูกยกเลิก → เช็กข้อความ ไม่มีปุ่มแจ้งชำระเงิน → กด "เลือกเมนู" → เห็นหน้าเมนู
  it('ยังไม่มีรายการ (หรือถูกยกเลิกหมด) → ไม่มีปุ่มแจ้งชำระเงิน และกลับไปเลือกเมนูได้', async () => {
    const user = userEvent.setup()
    setup({ list: [orders[1]] })
    expect(screen.getByText('ยังไม่มีรายการที่สั่ง')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'แจ้งชำระเงิน' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'เลือกเมนู' }))
    expect(screen.getByText('หน้าเมนู')).toBeInTheDocument()
  })

  // ทดสอบ: กดแจ้งชำระเงินต้องมีกล่องยืนยันก่อน (บอกโต๊ะและยอด) และไม่ส่งวิธีจ่าย — แคชเชียร์เลือกเองที่เคาน์เตอร์
  // วิธี: กดปุ่ม → เช็กกล่องยืนยันบอก "โต๊ะ 5" และ ฿175 → กดยืนยัน → เช็กว่าส่งแค่ token
  it('แจ้งชำระเงิน: ต้องยืนยันก่อน และส่งแค่ token (ไม่มีวิธีจ่าย)', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'แจ้งชำระเงิน' }))
    expect(checkout.mutate).not.toHaveBeenCalled()

    const dialog = screen.getByRole('dialog', { name: 'ยืนยันการแจ้งชำระเงิน' })
    expect(dialog).toHaveTextContent('แจ้งพนักงานว่าโต๊ะ 5 ต้องการชำระเงิน ใช่ไหม?')
    expect(dialog).toHaveTextContent('฿175')
    expect(dialog).toHaveTextContent('แจ้งได้ครั้งเดียว')
    await user.click(within(dialog).getByRole('button', { name: 'ยืนยัน' }))
    expect(checkout.mutate).toHaveBeenCalledWith({ token: 'tok' }, expect.anything())
  })

  // ทดสอบ: กด "ยกเลิก" ในกล่องยืนยัน ต้องปิดกล่องโดยไม่แจ้ง
  // วิธี: กดปุ่มแจ้งชำระเงิน → กดยกเลิก → เช็กว่ากล่องหาย และไม่ได้เรียก mutate
  it('กดยกเลิกในกล่องยืนยัน → ไม่แจ้ง', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'แจ้งชำระเงิน' }))
    await user.click(screen.getByRole('button', { name: 'ยกเลิก' }))
    expect(screen.queryByRole('dialog', { name: 'ยืนยันการแจ้งชำระเงิน' })).not.toBeInTheDocument()
    expect(checkout.mutate).not.toHaveBeenCalled()
  })

  // ทดสอบ: แจ้งไปแล้ว (สำเร็จในหน้านี้ หรือ session บอกว่ามีคำขอค้าง เช่น รีเฟรช/อีกเครื่อง) ต้องไม่มีปุ่มให้แจ้งซ้ำ และบอกให้ไปจ่ายที่เคาน์เตอร์
  // วิธี: render ด้วย isSuccess และด้วย checkoutRequested → เช็กข้อความยืนยัน และไม่มีปุ่มแจ้งชำระเงิน
  it.each([
    ['แจ้งสำเร็จในหน้านี้', { checkoutState: { isSuccess: true } }],
    ['มีคำขอค้างอยู่ (รีเฟรช/อีกเครื่อง)', { checkoutRequested: true }],
  ])('แจ้งแล้ว (%s) → ไม่มีปุ่มแจ้งซ้ำ บอกให้จ่ายที่เคาน์เตอร์', (_label, opts) => {
    setup(opts)
    expect(screen.getByText('แจ้งพนักงานแล้วว่าต้องการชำระเงิน')).toBeInTheDocument()
    expect(screen.getByText('กรุณาชำระเงินที่เคาน์เตอร์')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'แจ้งชำระเงิน' })).not.toBeInTheDocument()
  })

  // ทดสอบ: ระหว่างส่งคำขอ ปุ่มต้องกดไม่ได้ (กันกดซ้ำ) และแจ้งไม่สำเร็จต้องเห็นข้อความ error
  // วิธี: render ด้วย isPending → ปุ่ม disabled → render ใหม่ด้วย error → เช็กข้อความ
  it('กำลังส่ง → ปุ่มกดไม่ได้ / แจ้งไม่สำเร็จ → เห็นข้อความ error', () => {
    const { unmount } = setup({ checkoutState: { isPending: true } })
    expect(screen.getByRole('button', { name: 'แจ้งชำระเงิน' })).toBeDisabled()
    unmount()

    setup({ checkoutState: { isError: true, error: new Error('โต๊ะนี้ปิดไปแล้ว') } })
    expect(screen.getByText('โต๊ะนี้ปิดไปแล้ว')).toBeInTheDocument()
  })

  // ทดสอบ: ระหว่างโหลดรายการ ต้องขึ้นกำลังโหลด
  // วิธี: mock orders ยังโหลดไม่เสร็จ (isPending) → เช็กข้อความ "กำลังโหลด..."
  it('กำลังโหลด → ข้อความกำลังโหลด', () => {
    setup({ list: null })
    expect(screen.getByText('กำลังโหลด...')).toBeInTheDocument()
  })
})
