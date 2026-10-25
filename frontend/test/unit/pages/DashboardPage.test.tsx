import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDashboard } from '@/features/reports/hooks'
import { PaymentMethod } from '@/types/enums'
import type { DashboardData, Notification } from '@/types/reports'
import { DashboardPage } from '@/pages/owner/DashboardPage'

// ส่วน getDashboard (ประกอบข้อมูลจาก API) เทสแยกที่ features/reports/api.test.ts
// ที่นี่เทสแค่ว่าหน้าจอแสดงข้อมูลที่ได้มาครบและถูกที่
vi.mock('@/features/reports/hooks', () => ({ useDashboard: vi.fn() }))

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

const note = (i: number, method: PaymentMethod = PaymentMethod.CASH): Notification => ({
  id: `p${i}`,
  tableName: String(i),
  method,
  amount: 100 + i,
  createdAt: minutesAgo(i),
})

const base: DashboardData = {
  summary: {
    date: '2026-10-23T17:00:00.000Z',
    revenue: 1530.5,
    expenseTotal: 120.25,
    netProfit: 1410.25,
    cashTotal: 1030.5,
    promptPayTotal: 500,
    orderCount: 1234,
    paymentCount: 6,
  },
  trend: [
    { label: 'จ.', date: '2026-10-19', revenue: 150 },
    { label: 'อ.', date: '2026-10-20', revenue: 1530.5 },
  ],
  todayStatus: {
    cashCount: 4,
    promptPayCount: 2,
    tablesInUse: 3,
    tablesTotal: 7,
  },
  notifications: [note(5), note(12, PaymentMethod.PROMPTPAY)],
  slipIssues: { pending: 0, failed: 0 },
}

function renderWith(state: Partial<ReturnType<typeof useDashboard>>) {
  vi.mocked(useDashboard).mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
    error: null,
    ...state,
  } as ReturnType<typeof useDashboard>)
  return render(
    <MemoryRouter initialEntries={['/owner/dashboard']}>
      <Routes>
        <Route path="/owner/dashboard" element={<DashboardPage />} />
        <Route path="/employee/check" element={<p>หน้า Check</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const renderData = (overrides: Partial<DashboardData> = {}) =>
  renderWith({ data: { ...base, ...overrides } })

/** การ์ดตัวเลข: ป้ายกับค่าอยู่ใน div เดียวกัน (StatCard) */
const statCard = (label: string) => screen.getByText(label, { selector: 'p' }).closest('div.rounded-xl') as HTMLElement

/** แถวในกล่อง "สถานะวันนี้" (dt → dd) */
const statusValue = (label: string) => {
  const section = screen.getByRole('heading', { name: 'สถานะวันนี้' }).closest('section') as HTMLElement
  return within(section).getByText(label, { selector: 'dt' }).nextElementSibling?.textContent
}

const notificationsSection = () =>
  screen.getByRole('heading', { name: 'การแจ้งเตือน' }).closest('section') as HTMLElement

describe('DashboardPage', () => {
  beforeEach(() => vi.mocked(useDashboard).mockReset())

  // ทดสอบ: ระหว่างโหลดข้อมูล Dashboard ต้องขึ้นข้อความกำลังโหลด
  // วิธี: mock useDashboard เป็น isPending → เช็กข้อความ "กำลังโหลด..."
  it('กำลังโหลด → ข้อความกำลังโหลด', () => {
    renderWith({ isPending: true })
    expect(screen.getByText('กำลังโหลด...')).toBeInTheDocument()
  })

  // ทดสอบ: โหลด Dashboard ไม่สำเร็จ ต้องแสดงข้อความ error จาก API
  // วิธี: mock useDashboard เป็น error พร้อมข้อความ → เช็กว่าเห็นข้อความนั้น
  it('โหลดไม่สำเร็จ → แสดงข้อความ error จาก API', () => {
    renderWith({ isError: true, error: new Error('เซิร์ฟเวอร์ไม่ตอบ') })
    expect(screen.getByText('เซิร์ฟเวอร์ไม่ตอบ')).toBeInTheDocument()
  })

  // ทดสอบ: error ที่ไม่ใช่ Error object ต้องได้ข้อความสำรอง
  // วิธี: mock error เป็นสตริง 'x' → เช็กข้อความ "โหลดข้อมูลไม่สำเร็จ"
  it('error ที่ไม่ใช่ Error object → ข้อความสำรอง', () => {
    renderWith({ isError: true, error: 'x' as unknown as Error })
    expect(screen.getByText('โหลดข้อมูลไม่สำเร็จ')).toBeInTheDocument()
  })

  // ทดสอบ: การ์ด 4 ใบ (รายรับ, เงินสด, PromptPay, จำนวนออเดอร์) แสดงค่าตรงกับข้อมูล
  // วิธี: mock ข้อมูลตัวอย่าง → เช็กข้อความในแต่ละการ์ด
  it('การ์ด 4 ใบ: รายรับ / เงินสด / PromptPay / จำนวนออเดอร์ แสดงค่าตรงกับข้อมูล', () => {
    renderData()
    expect(statCard('รายรับวันนี้')).toHaveTextContent('฿1,530.5')
    expect(statCard('จ่ายเงินสด')).toHaveTextContent('฿1,030.5')
    expect(statCard('จ่าย PromptPay')).toHaveTextContent('฿500')
    expect(statCard('จำนวนออเดอร์')).toHaveTextContent('1,234')
  })

  // ทดสอบ: วันที่ของรายงานแสดงเป็นภาษาไทย พ.ศ.
  // วิธี: mock วันที่ 2026-10-23T17:00Z (= 24 ต.ค. เวลาไทย) → เช็กข้อความ "24 ตุลาคม 2569"
  it('แสดงวันที่ของรายงานเป็นภาษาไทย', () => {
    renderData()
    expect(screen.getByText(/24 ตุลาคม 2569/)).toBeInTheDocument()
  })

  // ทดสอบ: กราฟรายรับได้ข้อมูลจริง (ป้ายบอกจำนวนวัน) และถ้าไม่มีข้อมูลต้องบอกว่าไม่มี
  // วิธี: render ข้อมูล 2 วัน เช็กป้ายกราฟ → render ใหม่ด้วย trend ว่าง → เช็กข้อความ "ไม่มีข้อมูล"
  it('กราฟ 7 วันได้ข้อมูลจริง (ป้ายบอกจำนวนวันและยอดเพดาน) / ไม่มีข้อมูล → บอกว่าไม่มี', () => {
    const { unmount } = renderData()
    expect(screen.getByRole('img', { name: /แนวโน้มรายรับ 2 วัน/ })).toBeInTheDocument()
    unmount()
    renderData({ trend: [] })
    const chart = screen.getByRole('heading', { name: 'แนวโน้มรายรับ 7 วันที่ผ่านมา' }).closest('section') as HTMLElement
    expect(within(chart).getByText('ไม่มีข้อมูล')).toBeInTheDocument()
  })

  // ทดสอบ: กล่องสถานะวันนี้แสดงจำนวนบิลเงินสด/PromptPay โต๊ะที่ใช้งาน x/y และรายจ่ายวันนี้ถูก
  // วิธี: mock ข้อมูลตัวอย่าง → อ่านค่าแต่ละแถว (dt → dd) แล้วเทียบ
  it('สถานะวันนี้: จำนวนบิลเงินสด/PromptPay, โต๊ะที่ใช้งาน x/y, รายจ่ายวันนี้', () => {
    renderData()
    expect(statusValue('จ่ายเงินสด')).toBe('4 บิล')
    expect(statusValue('จ่าย PromptPay')).toBe('2 บิล')
    expect(statusValue('โต๊ะที่ใช้งานอยู่')).toBe('3/7')
    expect(statusValue('รายจ่ายวันนี้')).toBe('฿120.25')
  })

  // ทดสอบ: ไม่มีสลิปค้าง ต้องไม่มีแบนเนอร์เตือน
  // วิธี: mock slipIssues เป็น 0 → เช็กว่าไม่มีแบนเนอร์
  it('ไม่มีสลิปค้าง → ไม่มีแบนเนอร์เตือน', () => {
    renderData()
    expect(screen.queryByText(/สลิป PromptPay ที่ต้องตาม/)).not.toBeInTheDocument()
  })

  // ทดสอบ: มีสลิปรอตรวจหรือไม่ผ่าน แบนเนอร์ต้องบอกจำนวน และกดแล้วไปหน้า Check
  // วิธี: mock รอตรวจ 2 ไม่ผ่าน 1 → เช็กข้อความแบนเนอร์ → กด → เช็กว่าเห็น "หน้า Check"
  it('มีสลิปรอตรวจ/ไม่ผ่าน → แบนเนอร์บอกจำนวน และกดแล้วไปหน้า Check', async () => {
    const user = userEvent.setup()
    renderData({ slipIssues: { pending: 2, failed: 1 } })
    const banner = screen.getByRole('link', { name: /สลิป PromptPay ที่ต้องตาม/ })
    expect(banner).toHaveTextContent('รอตรวจ 2 · ไม่ผ่าน 1')
    await user.click(banner)
    expect(await screen.findByText('หน้า Check')).toBeInTheDocument()
  })

  // ทดสอบ: มีแต่สลิปไม่ผ่าน (รอตรวจ 0) ก็ต้องเตือน
  // วิธี: mock รอตรวจ 0 ไม่ผ่าน 1 → เช็กว่ามีแบนเนอร์ข้อความ "ไม่ผ่าน 1"
  it('มีแต่สลิปไม่ผ่าน (รอตรวจ 0) ก็ต้องเตือน', () => {
    renderData({ slipIssues: { pending: 0, failed: 1 } })
    expect(screen.getByRole('link', { name: /สลิป PromptPay ที่ต้องตาม/ })).toHaveTextContent('ไม่ผ่าน 1')
  })

  // ทดสอบ: การแจ้งเตือนแต่ละบิลบอกโต๊ะ + วิธีจ่าย กี่นาทีที่แล้ว และยอด
  // วิธี: mock 2 บิล (เงินสด 5 นาทีก่อน, PromptPay 12 นาทีก่อน) → เช็กข้อความในแต่ละรายการ
  it('การแจ้งเตือน: แต่ละบิลบอกโต๊ะ + วิธีจ่าย, กี่นาทีที่แล้ว และยอด', () => {
    renderData()
    const items = within(notificationsSection()).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('โต๊ะ 5 จ่ายเงินสด')
    expect(items[0]).toHaveTextContent('5 นาทีที่แล้ว')
    expect(items[0]).toHaveTextContent('฿105')
    expect(items[1]).toHaveTextContent('โต๊ะ 12 จ่าย PromptPay')
    expect(items[1]).toHaveTextContent('12 นาทีที่แล้ว')
  })

  // ทดสอบ: ถ้าเวลาเครื่องช้ากว่า server (บิลดูเหมือนมาจากอนาคต) ต้องแสดง 0 นาที ไม่ติดลบ
  // วิธี: mock บิลที่เวลาอยู่ข้างหน้า 3 นาที → เช็กข้อความ "0 นาทีที่แล้ว"
  it('เวลาเครื่องช้ากว่า server (บิล "อนาคต") → แสดง 0 นาที ไม่ติดลบ', () => {
    renderData({ notifications: [{ ...note(1), createdAt: minutesAgo(-3) }] })
    expect(within(notificationsSection()).getByText('0 นาทีที่แล้ว')).toBeInTheDocument()
  })

  // ทดสอบ: ยังไม่มีบิล ต้องแสดงข้อความว่าง และไม่มีแถบแบ่งหน้า
  // วิธี: mock notifications ว่าง → เช็กข้อความ และไม่มี navigation "แบ่งหน้า"
  it('ยังไม่มีบิล → ข้อความว่าง และไม่มีแถบแบ่งหน้า', () => {
    renderData({ notifications: [] })
    expect(screen.getByText('วันนี้ยังไม่มีบิลที่รับเงิน')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'แบ่งหน้า' })).not.toBeInTheDocument()
  })

  // ทดสอบ: บิลเกิน 10 ใบต้องแบ่งหน้าละ 10 และกดหน้า 2 แล้วเห็นใบที่เหลือ
  // วิธี: mock 12 บิล → เช็กว่าหน้าแรกมี 10 รายการ และ "1–10 จาก 12 บิล" → กดหน้า 2 → เช็กว่าเหลือ 2 รายการ และ "11–12 จาก 12 บิล"
  it('บิลเกิน 10 ใบ → แบ่งหน้าละ 10 กดหน้า 2 แล้วเห็นใบที่เหลือ', async () => {
    const user = userEvent.setup()
    renderData({ notifications: Array.from({ length: 12 }, (_, i) => note(i + 1)) })
    const section = notificationsSection()
    expect(within(section).getAllByRole('listitem')).toHaveLength(10)
    expect(within(section).getByText('1–10 จาก 12 บิล')).toBeInTheDocument()

    await user.click(within(section).getByRole('button', { name: '2' }))
    const page2 = within(section).getAllByRole('listitem')
    expect(page2).toHaveLength(2)
    expect(page2[0]).toHaveTextContent('โต๊ะ 11')
    expect(within(section).getByText('11–12 จาก 12 บิล')).toBeInTheDocument()
  })
})
