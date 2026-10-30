import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCart, type CartLine } from '@/features/public/cart-store'
import { useSession } from '@/features/public/hooks'
import { ApiError } from '@/lib/api-client'
import { TableSessionStatus } from '@/types/enums'
import { CustomerLayout } from '@/components/layout/CustomerLayout'

// layout ไม่ได้ทดสอบ socket/การดึงข้อมูลจริง — ทดสอบแค่ว่าตะกร้าถูกผูก/ล้างถูกโต๊ะ
const callStaff = vi.fn()
vi.mock('@/features/live/hooks', () => ({ useCustomerLiveEvents: vi.fn() }))
vi.mock('@/features/public/hooks', () => ({
  useSession: vi.fn(),
  // ปุ่มเรียกพนักงานบน header — ไม่ได้ทดสอบในไฟล์นี้
  useCallStaff: () => ({ mutate: callStaff, isPending: false, isSuccess: false }),
}))

type SessionResult = ReturnType<typeof useSession>

const line: CartLine = {
  lineId: 'm1|pork|',
  menuItemId: 'm1',
  name: 'กะเพรา',
  imageUrl: null,
  basePrice: 60,
  options: [],
  quantity: 2,
  note: '',
}

function mockSession(result: Partial<SessionResult>) {
  vi.mocked(useSession).mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
    error: null,
    ...result,
  } as SessionResult)
}

const openSession = (
  token: string,
  status: TableSessionStatus = TableSessionStatus.OPEN,
) => ({
  id: `s-${token}`,
  tableId: 't1',
  tableName: '1',
  token,
  status,
  openedAt: '2026-10-22T10:00:00.000Z',
  closedAt: null,
  total: 0,
  // ฟิลด์ที่เพิ่มมากับงานกลับบ้าน/แยกบิล — โต๊ะปกติ ไม่ได้หาร
  placeLabel: 'โต๊ะ 1',
  isTakeaway: false,
  takeawayNo: null,
  customerName: null,
  checkoutRequested: false,
  callStaffPending: false,
})

function renderAt(token: string) {
  return render(
    <MemoryRouter initialEntries={[`/t/${token}`]}>
      <Routes>
        <Route path="/t/:token" element={<CustomerLayout />}>
          <Route index element={<p>หน้าเมนู</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('CustomerLayout: ตะกร้าไม่หายเพราะเปิดลิงก์โต๊ะผิด', () => {
  beforeEach(() => {
    // ลูกค้านั่งโต๊ะจริง (real) และมีของค้างในตะกร้า ยังไม่ได้ส่งครัว
    useCart.setState({ token: 'real', lines: [line], repriced: [] })
  })

  it('ลิงก์โต๊ะที่ไม่มีจริง (404) → ตะกร้าโต๊ะจริงยังอยู่', async () => {
    mockSession({ isError: true, error: new ApiError(404, 'ไม่พบ QR session นี้') })
    renderAt('not-a-real-token')

    expect(await screen.findByText('เปิดโต๊ะนี้ไม่ได้')).toBeInTheDocument()
    expect(useCart.getState()).toMatchObject({ token: 'real', lines: [line] })
  })

  it('ระหว่างโหลดโต๊ะ ยังไม่ผูกตะกร้า', () => {
    mockSession({ isPending: true })
    renderAt('other')
    expect(useCart.getState()).toMatchObject({ token: 'real', lines: [line] })
  })

  it('ลิงก์โต๊ะเก่าที่ปิดบิลไปแล้ว → ไม่ล้างตะกร้าโต๊ะปัจจุบัน', async () => {
    mockSession({ data: openSession('old', TableSessionStatus.CLOSED) })
    renderAt('old')

    expect(await screen.findByText('โต๊ะนี้ปิดบิลแล้ว')).toBeInTheDocument()
    expect(useCart.getState()).toMatchObject({ token: 'real', lines: [line] })
  })

  it('โต๊ะที่ตะกร้าเป็นเจ้าของถูกปิดบิล → ล้างตะกร้า', async () => {
    mockSession({ data: openSession('real', TableSessionStatus.CLOSED) })
    renderAt('real')

    expect(await screen.findByText('โต๊ะนี้ปิดบิลแล้ว')).toBeInTheDocument()
    expect(useCart.getState().lines).toEqual([])
  })

  it('สแกน QR โต๊ะใหม่ที่เปิดอยู่จริง → ผูกตะกร้ากับโต๊ะใหม่ (ล้างของโต๊ะเก่า)', async () => {
    mockSession({ data: openSession('new') })
    renderAt('new')

    expect(await screen.findByText('หน้าเมนู')).toBeInTheDocument()
    expect(useCart.getState()).toMatchObject({ token: 'new', lines: [] })
  })

  it('กลับเข้าโต๊ะเดิมที่เปิดอยู่ → ตะกร้าอยู่ครบ', async () => {
    mockSession({ data: openSession('real') })
    renderAt('real')

    expect(await screen.findByText('หน้าเมนู')).toBeInTheDocument()
    expect(useCart.getState()).toMatchObject({ token: 'real', lines: [line] })
  })
})

describe('CustomerLayout: ปุ่มเรียกพนักงาน', () => {
  beforeEach(() => {
    callStaff.mockClear()
    useCart.setState({ token: 'real', lines: [], repriced: [] })
  })

  // ทดสอบ: ยังไม่มีคำขอค้าง → กดเรียกได้ ส่ง token ของโต๊ะนี้
  it('ไม่มีคำขอค้าง → ปุ่มเรียกพนักงานกดได้ ส่ง token', async () => {
    mockSession({ data: openSession('real') })
    renderAt('real')
    await userEvent.click(await screen.findByRole('button', { name: 'เรียกพนักงาน' }))
    expect(callStaff).toHaveBeenCalledWith({ token: 'real' })
  })

  // ทดสอบ: มีคำขอค้าง (แม้รีเฟรชหน้า) → "แจ้งแล้ว" กดซ้ำไม่ได้
  // แล้วพนักงานกดรับทราบ (session ใหม่ไม่มีคำขอค้าง) → ปุ่มกลับมาเป็นเรียกพนักงาน + บอก screen reader
  it('คำขอค้าง → แจ้งแล้ว กดไม่ได้ / พนักงานรับทราบ → กลับมากดได้', async () => {
    mockSession({ data: { ...openSession('real'), callStaffPending: true } })
    const { rerender } = renderAt('real')
    expect(await screen.findByRole('button', { name: 'แจ้งแล้ว' })).toBeDisabled()

    mockSession({ data: openSession('real') })
    rerender(
      <MemoryRouter initialEntries={['/t/real']}>
        <Routes>
          <Route path="/t/:token" element={<CustomerLayout />}>
            <Route index element={<p>หน้าเมนู</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'เรียกพนักงาน' })).toBeEnabled()
    expect(screen.getByText('พนักงานรับทราบแล้ว')).toBeInTheDocument()
  })
})
