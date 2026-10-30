import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSession, useSessionOrders } from '@/features/public/hooks'
import { OrderStatus } from '@/types/enums'
import type { Order, OrderItem } from '@/types/models'
import { CustomerStatusPage } from '@/pages/customer/StatusPage'

// หน้าติดตามสถานะออเดอร์ของลูกค้า (สแกน QR ที่โต๊ะ) — ข้อมูลมาจาก hook ทั้งหมด
// ปุ่มเรียกพนักงานย้ายไปอยู่บน header แล้ว (ทดสอบใน CustomerLayout.test.tsx)
vi.mock('@/features/public/hooks', () => ({
  useSession: vi.fn(),
  useSessionOrders: vi.fn(),
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

function setup(
  /** null = ยังโหลดไม่เสร็จ (ออเดอร์ใหม่สุดอยู่ตัวแรก เหมือน API) */
  list: Order[] | null = [order('o1', OrderStatus.PENDING)],
) {
  vi.mocked(useSession).mockReturnValue({ data: { tableName: '5' } } as never)
  vi.mocked(useSessionOrders).mockReturnValue({ data: list ?? undefined, isPending: list === null } as never)
  return render(
    <MemoryRouter initialEntries={['/t/tok/status']}>
      <Routes>
        <Route path="/t/:token/status" element={<CustomerStatusPage />} />
        <Route path="/t/:token" element={<p>หน้าเมนู</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

/** แถบสถานะของออเดอร์ใบนั้น (การ์ดละแถบ) */
const progress = (ref: string) => screen.queryByRole('progressbar', { name: `สถานะออเดอร์ #${ref}` })
/** การ์ดของออเดอร์ใบนั้น */
const card = (ref: string) => screen.getByText(`ออเดอร์ #${ref}`).closest('li') as HTMLElement

describe('CustomerStatusPage — ติดตามสถานะออเดอร์', () => {
  beforeEach(() => vi.clearAllMocks())

  // ทดสอบ: ระหว่างโหลดออเดอร์ ต้องขึ้นข้อความกำลังโหลด ไม่ใช่หน้า "ไม่มีออเดอร์"
  // วิธี: mock useSessionOrders เป็น isPending → เช็กข้อความกำลังโหลด และไม่มีหัวข้อหน้า
  it('กำลังโหลด → ข้อความกำลังโหลด', () => {
    setup(null)
    expect(screen.getByText('กำลังโหลด...')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'ติดตามสถานะออเดอร์' })).not.toBeInTheDocument()
  })

  // ทดสอบ: ยังไม่ได้สั่ง → บอกว่าไม่มีออเดอร์ มีลิงก์กลับไปเลือกเมนู และบอกว่าเรียกพนักงานได้จาก header
  // วิธี: mock ออเดอร์ว่าง → เช็กข้อความ, ลิงก์ไป /t/tok, ไม่มีแถบสถานะ และมีคำแนะนำเรื่องปุ่มเรียกพนักงาน
  it('ยังไม่มีออเดอร์ → ลิงก์เลือกเมนู และบอกทางเรียกพนักงาน', () => {
    setup([])
    expect(screen.getByText('โต๊ะ 5 : ทั้งหมด 0 รายการ')).toBeInTheDocument()
    expect(screen.getByText('ไม่มีออเดอร์')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'เลือกเมนู' })).toHaveAttribute('href', '/t/tok')
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.getByText(/เรียกพนักงาน” ด้านบน/)).toBeInTheDocument()
  })

  // ทดสอบ: แถบสถานะของการ์ดชี้ขั้นตามสถานะ และบอกเวลารอเฉพาะตอนที่ยังไม่เสิร์ฟ (PAID นับเป็นเสิร์ฟแล้ว)
  // วิธี: วนทีละสถานะ → เช็ก aria-valuenow/aria-valuetext ของ progressbar และว่ามี/ไม่มีข้อความเวลารอ
  it.each([
    [OrderStatus.PENDING, 1, 'รับออเดอร์แล้ว', true],
    [OrderStatus.PREPARING, 2, 'กำลังปรุงอาหาร', true],
    [OrderStatus.SERVED, 3, 'เสิร์ฟแล้ว', false],
    [OrderStatus.PAID, 3, 'เสิร์ฟแล้ว', false],
  ])('สถานะ %s → ขั้นที่ %i "%s"', (status, step, label, showsEta) => {
    setup([order('o1', status)])
    const bar = progress('O1')
    expect(bar).toHaveAttribute('aria-valuenow', String(step))
    expect(bar).toHaveAttribute('aria-valuetext', label)
    if (showsEta) expect(screen.getByText('คาดว่าจะได้รับในอีก 10 - 15 นาที')).toBeInTheDocument()
    else expect(screen.queryByText(/คาดว่าจะได้รับในอีก/)).not.toBeInTheDocument()
  })

  // ทดสอบ: หลายออเดอร์ → แต่ละใบมีแถบสถานะของตัวเอง ใบเก่าที่เสิร์ฟแล้วไม่ทำให้ใบใหม่ข้ามขั้น
  // วิธี: mock ใบใหม่ (PENDING) + ใบเก่า (SERVED) → เช็กว่าแต่ละการ์ดชี้ขั้นของตัวเอง และมีลิงก์ "สั่งเพิ่ม"
  it('มีหลายออเดอร์ → แต่ละใบเดินสถานะของตัวเอง', () => {
    setup([order('o2', OrderStatus.PENDING), order('o1', OrderStatus.SERVED)])
    expect(screen.getByText('โต๊ะ 5 : ทั้งหมด 2 รายการ')).toBeInTheDocument()
    expect(progress('O2')).toHaveAttribute('aria-valuetext', 'รับออเดอร์แล้ว')
    expect(progress('O1')).toHaveAttribute('aria-valuetext', 'เสิร์ฟแล้ว')
    expect(within(card('O2')).getByText(/คาดว่าจะได้รับในอีก/)).toBeInTheDocument()
    expect(within(card('O1')).queryByText(/คาดว่าจะได้รับในอีก/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'สั่งเพิ่ม' })).toHaveAttribute('href', '/t/tok')
  })

  // ทดสอบ: รายการในออเดอร์บอกจำนวน ชื่อ ตัวเลือก หมายเหตุ และยอดรวมราคาตัวเลือก
  // วิธี: mock กะเพรา 2 จาน (+หมู/ไข่ดาว 10 บาท, หมายเหตุไม่เผ็ด) → เช็กข้อความและยอด ฿140
  it('รายการอาหาร: ตัวเลือก หมายเหตุ และยอดรวมราคาตัวเลือก', () => {
    setup([
      order('o1', OrderStatus.PREPARING, [
        item('i1', 'กะเพรา', 2, 60, { optionNames: ['หมู', 'ไข่ดาว'], optionsTotal: 10, note: 'ไม่เผ็ด' }),
      ]),
    ])
    const c = card('O1')
    expect(c).toHaveTextContent('2× กะเพรา')
    expect(c).toHaveTextContent('(หมู, ไข่ดาว)')
    expect(c).toHaveTextContent('ไม่เผ็ด')
    expect(c).toHaveTextContent('140')
  })

  // ทดสอบ: ครัวยกเลิกออเดอร์ → ลูกค้าเห็นแบนเนอร์ทันที การ์ดไม่มีแถบสถานะ และยอดขึ้น "ไม่คิดเงิน"
  // วิธี: mock ออเดอร์เป็น CANCELLED → เช็กแบนเนอร์ (role=alert) ป้าย "ยกเลิกแล้ว" คำว่าไม่คิดเงิน และไม่มี progressbar
  it('ออเดอร์ถูกยกเลิก → แบนเนอร์ ไม่มีแถบสถานะ และไม่คิดเงิน', () => {
    setup([order('o1', OrderStatus.CANCELLED)])
    expect(screen.getByRole('alert')).toHaveTextContent('ออเดอร์ #O1 ถูกยกเลิก')
    expect(progress('O1')).not.toBeInTheDocument()
    const c = card('O1')
    expect(within(c).getByText('ยกเลิกแล้ว')).toBeInTheDocument()
    expect(within(c).getByText('ไม่คิดเงิน')).toBeInTheDocument()
    expect(within(c).queryByText(/คาดว่าจะได้รับในอีก/)).not.toBeInTheDocument()
  })

  // ทดสอบ: ออเดอร์เก่าถูกยกเลิกก็ต้องบอก แม้ออเดอร์ล่าสุดยังปกติ (ลูกค้าจะได้ไม่รอของที่ไม่มีวันมา)
  // วิธี: mock ใบใหม่ PREPARING + ใบเก่า 2 ใบที่ยกเลิก → แบนเนอร์บอกทั้งสองเลข และใบใหม่ยังชี้ "กำลังปรุงอาหาร"
  it('ออเดอร์เก่าถูกยกเลิก → แบนเนอร์บอกทุกใบ และใบใหม่ยังเดินสถานะ', () => {
    setup([order('o3', OrderStatus.PREPARING), order('o2', OrderStatus.CANCELLED), order('o1', OrderStatus.CANCELLED)])
    expect(screen.getByRole('alert')).toHaveTextContent('ออเดอร์ #O2, #O1 ถูกยกเลิก')
    expect(progress('O3')).toHaveAttribute('aria-valuetext', 'กำลังปรุงอาหาร')
  })
})
