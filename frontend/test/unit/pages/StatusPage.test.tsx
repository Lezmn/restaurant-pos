import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCallStaff, useSession, useSessionOrders } from '@/features/public/hooks'
import { OrderStatus } from '@/types/enums'
import type { Order, OrderItem } from '@/types/models'
import { CustomerStatusPage } from '@/pages/customer/StatusPage'

// หน้าติดตามสถานะออเดอร์ของลูกค้า (สแกน QR ที่โต๊ะ) — ข้อมูลมาจาก hook ทั้งหมด
vi.mock('@/features/public/hooks', () => ({
  useSession: vi.fn(),
  useSessionOrders: vi.fn(),
  useCallStaff: vi.fn(),
}))

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

const order = (id: string, status: OrderStatus, items: OrderItem[] = [item(`${id}-1`, 'ข้าวผัด', 1, 50)]): Order => ({
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

type CallStaff = { mutate: ReturnType<typeof vi.fn>; isPending: boolean; isSuccess: boolean }
let callStaff: CallStaff

function setup({
  /** null = ยังโหลดไม่เสร็จ (ออเดอร์ใหม่สุดอยู่ตัวแรก เหมือน API) */
  list = [order('o1', OrderStatus.PENDING)] as Order[] | null,
  callState = {} as Partial<CallStaff>,
} = {}) {
  vi.mocked(useSession).mockReturnValue({ data: { tableName: '5' } } as never)
  vi.mocked(useSessionOrders).mockReturnValue({ data: list ?? undefined, isPending: list === null } as never)
  callStaff = { mutate: vi.fn(), isPending: false, isSuccess: false, ...callState }
  vi.mocked(useCallStaff).mockReturnValue(callStaff as never)
  return render(
    <MemoryRouter initialEntries={['/t/tok/status']}>
      <Routes>
        <Route path="/t/:token/status" element={<CustomerStatusPage />} />
        <Route path="/t/:token" element={<p>หน้าเมนู</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

/** ขั้นที่ stepper บอกว่าอยู่ตอนนี้ */
const currentStep = () => screen.getAllByRole('listitem').find((li) => li.getAttribute('aria-current') === 'step')

describe('CustomerStatusPage — ติดตามสถานะออเดอร์', () => {
  beforeEach(() => vi.clearAllMocks())

  // ทดสอบ: ระหว่างโหลดออเดอร์ ต้องขึ้นข้อความกำลังโหลด ไม่ใช่หน้า "ไม่มีออเดอร์"
  // วิธี: mock useSessionOrders เป็น isPending → เช็กข้อความกำลังโหลด และไม่มีหัวข้อหน้า
  it('กำลังโหลด → ข้อความกำลังโหลด', () => {
    setup({ list: null })
    expect(screen.getByText('กำลังโหลด...')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'ติดตามสถานะออเดอร์' })).not.toBeInTheDocument()
  })

  // ทดสอบ: ยังไม่ได้สั่ง → บอกว่าไม่มีออเดอร์ มีลิงก์กลับไปเลือกเมนู และยังเรียกพนักงานได้
  // วิธี: mock ออเดอร์ว่าง → เช็กข้อความ, ลิงก์ไป /t/tok, ไม่มี stepper และมีปุ่มเรียกพนักงาน
  it('ยังไม่มีออเดอร์ → ลิงก์เลือกเมนู และปุ่มเรียกพนักงาน', () => {
    setup({ list: [] })
    expect(screen.getByText('โต๊ะ 5 : ทั้งหมด 0 รายการ')).toBeInTheDocument()
    expect(screen.getByText('ไม่มีออเดอร์')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'เลือกเมนู' })).toHaveAttribute('href', '/t/tok')
    expect(screen.queryByText('รับออเดอร์แล้ว')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /เรียกพนักงาน/ })).toBeEnabled()
  })

  // ทดสอบ: stepper ชี้ขั้นตามสถานะของออเดอร์ล่าสุด และบอกเวลารอเฉพาะตอนที่ยังไม่เสิร์ฟ (PAID นับเป็นเสิร์ฟแล้ว)
  // วิธี: วนทีละสถานะ → เช็กขั้นที่มี aria-current="step" และว่ามี/ไม่มี "คาดว่าจะได้รับในอีก"
  it.each([
    [OrderStatus.PENDING, 'รับออเดอร์แล้ว', true],
    [OrderStatus.PREPARING, 'กำลังปรุงอาหาร', true],
    [OrderStatus.SERVED, 'เสิร์ฟแล้ว', false],
    [OrderStatus.PAID, 'เสิร์ฟแล้ว', false],
  ])('สถานะ %s → ขั้นปัจจุบัน "%s"', (status, label, showsEta) => {
    setup({ list: [order('o1', status)] })
    expect(currentStep()).toHaveTextContent(label)
    expect(screen.getAllByRole('listitem').filter((li) => li.hasAttribute('aria-current'))).toHaveLength(1)
    if (showsEta) expect(screen.getByText('คาดว่าจะได้รับในอีก')).toBeInTheDocument()
    else expect(screen.queryByText('คาดว่าจะได้รับในอีก')).not.toBeInTheDocument()
  })

  // ทดสอบ: stepper ดูแค่ออเดอร์ล่าสุด — ออเดอร์เก่าที่เสิร์ฟแล้วต้องไม่ทำให้ขั้นข้ามไป
  // วิธี: mock ออเดอร์ใหม่ (PENDING) อยู่ก่อนออเดอร์เก่า (SERVED) → ขั้นปัจจุบันต้องเป็น "รับออเดอร์แล้ว"
  it('มีหลายออเดอร์ → stepper ตามออเดอร์ล่าสุด และแสดงทุกออเดอร์ในรายการ', () => {
    setup({ list: [order('o2', OrderStatus.PENDING), order('o1', OrderStatus.SERVED)] })
    expect(screen.getByText('โต๊ะ 5 : ทั้งหมด 2 รายการ')).toBeInTheDocument()
    expect(currentStep()).toHaveTextContent('รับออเดอร์แล้ว')
    expect(screen.getByText('ออเดอร์ #O2')).toBeInTheDocument()
    expect(screen.getByText('ออเดอร์ #O1')).toBeInTheDocument()
  })

  // ทดสอบ: รายการในออเดอร์บอกจำนวน ชื่อ ตัวเลือก หมายเหตุ และยอดรวมราคาตัวเลือก
  // วิธี: mock กะเพรา 2 จาน (+หมู/ไข่ดาว 10 บาท, หมายเหตุไม่เผ็ด) → เช็กข้อความและยอด ฿140
  it('รายการอาหาร: ตัวเลือก หมายเหตุ และยอดรวมราคาตัวเลือก', () => {
    setup({
      list: [
        order('o1', OrderStatus.PREPARING, [
          item('i1', 'กะเพรา', 2, 60, { optionNames: ['หมู', 'ไข่ดาว'], optionsTotal: 10, note: 'ไม่เผ็ด' }),
        ]),
      ],
    })
    const card = screen.getByText('ออเดอร์ #O1').closest('div.rounded-2xl') as HTMLElement
    expect(card).toHaveTextContent('2× กะเพรา')
    expect(card).toHaveTextContent('(หมู, ไข่ดาว)')
    expect(card).toHaveTextContent('ไม่เผ็ด')
    expect(card).toHaveTextContent('140')
  })

  // ทดสอบ: ครัวยกเลิกออเดอร์ → ลูกค้าเห็นแบนเนอร์ทันที ไม่มี stepper ของออเดอร์ที่ยกเลิก และยอดขึ้น "ไม่คิดเงิน"
  // วิธี: mock ออเดอร์ล่าสุดเป็น CANCELLED → เช็กแบนเนอร์ ป้าย "ยกเลิกแล้ว" คำว่าไม่คิดเงิน และไม่มีขั้นของ stepper
  it('ออเดอร์ล่าสุดถูกยกเลิก → แบนเนอร์ ไม่มี stepper และไม่คิดเงิน', () => {
    setup({ list: [order('o1', OrderStatus.CANCELLED)] })
    expect(screen.getByText('ออเดอร์ #O1 ถูกยกเลิก')).toBeInTheDocument()
    expect(screen.queryByText('รับออเดอร์แล้ว')).not.toBeInTheDocument()
    const card = screen.getByText('ออเดอร์ #O1').closest('div.rounded-2xl') as HTMLElement
    expect(within(card).getByText('ยกเลิกแล้ว')).toBeInTheDocument()
    expect(within(card).getByText('ไม่คิดเงิน')).toBeInTheDocument()
  })

  // ทดสอบ: ออเดอร์เก่าถูกยกเลิกก็ต้องบอก แม้ออเดอร์ล่าสุดยังปกติ (ลูกค้าจะได้ไม่รอของที่ไม่มีวันมา)
  // วิธี: mock ออเดอร์ใหม่ PREPARING + ออเดอร์เก่า 2 ใบที่ยกเลิก → แบนเนอร์บอกทั้งสองเลข และ stepper ยังโชว์ "กำลังปรุงอาหาร"
  it('ออเดอร์เก่าถูกยกเลิก → แบนเนอร์บอกทุกใบ และ stepper ยังเดินตามออเดอร์ล่าสุด', () => {
    setup({
      list: [order('o3', OrderStatus.PREPARING), order('o2', OrderStatus.CANCELLED), order('o1', OrderStatus.CANCELLED)],
    })
    expect(screen.getByText('ออเดอร์ #O2, #O1 ถูกยกเลิก')).toBeInTheDocument()
    expect(currentStep()).toHaveTextContent('กำลังปรุงอาหาร')
  })

  // ทดสอบ: กดเรียกพนักงานต้องส่ง token ของโต๊ะ และหลังส่งสำเร็จปุ่มกดซ้ำไม่ได้พร้อมบอกให้รอ
  // วิธี: กดปุ่ม → เช็ก mutate({ token: 'tok' }) → render ใหม่แบบ isSuccess → เช็กข้อความ "กรุณารอพนักงานสักครู่" และปุ่ม disabled
  it('เรียกพนักงาน: ส่ง token และกดซ้ำไม่ได้หลังส่งแล้ว', async () => {
    const { unmount } = setup()
    await userEvent.click(screen.getByRole('button', { name: /เรียกพนักงาน/ }))
    expect(callStaff.mutate).toHaveBeenCalledWith({ token: 'tok' })
    unmount()

    setup({ callState: { isSuccess: true } })
    expect(screen.getByText('กรุณารอพนักงานสักครู่')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /เรียกพนักงาน/ })).toBeDisabled()
  })
})
