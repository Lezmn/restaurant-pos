import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDashboard, useDashboardPeriod } from '@/features/reports/hooks'
import { PaymentMethod } from '@/types/enums'
import type { DashboardData, Notification, PeriodData } from '@/types/reports'
import { DashboardPage } from '@/pages/owner/DashboardPage'

// ส่วน getDashboard (ประกอบข้อมูลจาก API) เทสแยกที่ test/unit/features/reports-api.test.ts
// ที่นี่เทสแค่ว่าหน้าจอแสดงข้อมูลที่ได้มาครบและถูกที่
vi.mock('@/features/reports/hooks', () => ({
  useDashboard: vi.fn(),
  useDashboardPeriod: vi.fn(),
}))

type DashboardQuery = ReturnType<typeof useDashboard>
type PeriodQuery = ReturnType<typeof useDashboardPeriod>

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
    { label: 'จ.', date: '2026-10-23', revenue: 150 },
    { label: 'อ.', date: '2026-10-24', revenue: 1530.5 },
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

const period7: PeriodData = {
  days: 7,
  from: '2026-10-18',
  to: '2026-10-24',
  revenue: 7000,
  expenseTotal: 500,
  netProfit: 6500,
  cashTotal: 4000,
  promptPayTotal: 3000,
  cashCount: 30,
  promptPayCount: 20,
  paymentCount: 50,
  trend: [
    { label: 'ส.', date: '2026-10-18', revenue: 0 },
    { label: 'อา.', date: '2026-10-19', revenue: 0 },
    { label: 'จ.', date: '2026-10-20', revenue: 1000 },
    { label: 'อ.', date: '2026-10-21', revenue: 2500 },
    { label: 'พ.', date: '2026-10-22', revenue: 1000 },
    { label: 'พฤ.', date: '2026-10-23', revenue: 1000 },
    { label: 'ศ.', date: '2026-10-24', revenue: 1500 },
  ],
}

function renderWith(
  state: Partial<DashboardQuery>,
  { url = '/owner/dashboard', period = {} }: { url?: string; period?: Partial<PeriodQuery> } = {},
) {
  vi.mocked(useDashboard).mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...state,
  } as unknown as DashboardQuery)
  vi.mocked(useDashboardPeriod).mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...period,
  } as unknown as PeriodQuery)
  return render(
    <MemoryRouter initialEntries={[url]}>
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
const statCard = (label: string) =>
  screen.getByText(label, { selector: 'p' }).closest('div.rounded-xl') as HTMLElement

/** แถวในกล่องสรุปด้านข้าง (dt → dd) */
const rowValue = (heading: string, label: string) => {
  const section = screen.getByRole('heading', { name: heading }).closest('section') as HTMLElement
  return within(section).getByText(label, { selector: 'dt' }).nextElementSibling?.textContent
}

const billsSection = () =>
  screen.getByRole('heading', { name: 'บิลที่รับเงินวันนี้' }).closest('section') as HTMLElement

const slipBanner = () => screen.queryByRole('link', { name: /สลิป PromptPay ที่ยังยืนยันเงินเข้าไม่ได้/ })

describe('DashboardPage — วันนี้', () => {
  beforeEach(() => {
    vi.mocked(useDashboard).mockReset()
    vi.mocked(useDashboardPeriod).mockReset()
  })

  // ทดสอบ: ระหว่างโหลดข้อมูล Dashboard ต้องขึ้นข้อความกำลังโหลด
  // วิธี: mock useDashboard เป็น isPending → เช็กข้อความ "กำลังโหลด..."
  it('กำลังโหลด → ข้อความกำลังโหลด', () => {
    renderWith({ isPending: true })
    expect(screen.getByText('กำลังโหลด...')).toBeInTheDocument()
  })

  // ทดสอบ: โหลดไม่สำเร็จและยังไม่มีข้อมูลเลย ต้องบอกว่าโหลดไม่ได้ และกด "ลองใหม่" แล้วโหลดใหม่
  // วิธี: mock error ไม่มี data → เช็กแถบแจ้ง error → กด "ลองใหม่" → เช็กว่าเรียก refetch
  it('โหลดไม่สำเร็จ (ไม่มีข้อมูลเลย) → แถบแจ้ง error และปุ่มลองใหม่เรียก refetch', async () => {
    const user = userEvent.setup()
    const refetch = vi.fn()
    renderWith({ isError: true, error: new Error('เซิร์ฟเวอร์ไม่ตอบ'), refetch } as Partial<DashboardQuery>)
    expect(screen.getByRole('alert')).toHaveTextContent('โหลดสรุปยอดไม่ได้')
    await user.click(screen.getByRole('button', { name: 'ลองใหม่' }))
    expect(refetch).toHaveBeenCalled()
  })

  // ทดสอบ: มีข้อมูลรอบก่อนอยู่แต่ดึงรอบใหม่ไม่ได้ ต้องเตือนว่าอาจไม่ใช่ล่าสุด แต่ยังแสดงตัวเลขเดิม
  // วิธี: mock data + isError → เช็กแถบเตือน "โหลดสรุปยอดล่าสุดไม่ได้" และการ์ดรายรับยังอยู่
  it('ดึงรอบใหม่ไม่ได้แต่มีข้อมูลเดิม → เตือนว่าอาจไม่ใช่ล่าสุด และยังแสดงตัวเลขเดิม', () => {
    renderWith({ data: base, isError: true, error: new Error('x') })
    expect(screen.getByRole('alert')).toHaveTextContent('โหลดสรุปยอดล่าสุดไม่ได้')
    expect(statCard('รายรับวันนี้')).toHaveTextContent('฿1,530.5')
  })

  // ทดสอบ: การ์ด 4 ใบ (รายรับ, เงินสด, PromptPay, กำไรสุทธิ) แสดงยอดและบรรทัดย่อยถูก
  // วิธี: mock ข้อมูลตัวอย่าง → เช็กยอด, จำนวนบิล, ยอดเมื่อวาน (จุดก่อนสุดท้ายของ trend) และรายจ่าย
  it('การ์ด 4 ใบ: รายรับ (+ยอดเมื่อวาน) / เงินสด / PromptPay / กำไรสุทธิ แสดงค่าตรงกับข้อมูล', () => {
    renderData()
    expect(statCard('รายรับวันนี้')).toHaveTextContent('฿1,530.5')
    expect(statCard('รายรับวันนี้')).toHaveTextContent('6 บิล · เมื่อวาน ฿150')
    expect(statCard('เงินสด')).toHaveTextContent('฿1,030.5')
    expect(statCard('เงินสด')).toHaveTextContent('4 บิล')
    expect(statCard('PromptPay')).toHaveTextContent('฿500')
    expect(statCard('PromptPay')).toHaveTextContent('2 บิล')
    expect(statCard('กำไรสุทธิวันนี้')).toHaveTextContent('฿1,410.25')
    expect(statCard('กำไรสุทธิวันนี้')).toHaveTextContent('รายจ่าย ฿120.25')
  })

  // ทดสอบ: กำไรติดลบ ป้ายการ์ดต้องเปลี่ยนเป็น "ขาดทุนวันนี้"
  // วิธี: mock netProfit -50 → เช็กว่ามีการ์ด "ขาดทุนวันนี้" และไม่มี "กำไรสุทธิวันนี้"
  it('กำไรติดลบ → การ์ดเปลี่ยนเป็น "ขาดทุนวันนี้"', () => {
    renderData({ summary: { ...base.summary, netProfit: -50 } })
    expect(statCard('ขาดทุนวันนี้')).toHaveTextContent('-฿50')
    expect(screen.queryByText('กำไรสุทธิวันนี้')).not.toBeInTheDocument()
  })

  // ทดสอบ: หัวข้อเป็น "สรุปวันนี้" และวันที่ของรายงานเป็นภาษาไทย พ.ศ.
  // วิธี: mock วันที่ 2026-10-23T17:00Z (= 24 ต.ค. เวลาไทย) → เช็กหัวข้อและข้อความ "24 ตุลาคม 2569"
  it('หัวข้อ "สรุปวันนี้" และแสดงวันที่ของรายงานเป็นภาษาไทย', () => {
    renderData()
    expect(screen.getByRole('heading', { name: 'สรุปวันนี้' })).toBeInTheDocument()
    expect(screen.getByText(/24 ตุลาคม 2569/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'วันนี้' })).toHaveAttribute('aria-pressed', 'true')
  })

  // ทดสอบ: กล่อง "ในร้านตอนนี้" แสดงโต๊ะที่ใช้งาน x จาก y, จำนวนออเดอร์ และรายจ่ายวันนี้
  // วิธี: mock ข้อมูลตัวอย่าง → อ่านค่าแต่ละแถว (dt → dd) แล้วเทียบ
  it('ในร้านตอนนี้: โต๊ะที่ใช้งาน, ออเดอร์วันนี้, รายจ่ายวันนี้', () => {
    renderData()
    expect(rowValue('ในร้านตอนนี้', 'โต๊ะที่ใช้งานอยู่')).toBe('3 จาก 7 โต๊ะ')
    expect(rowValue('ในร้านตอนนี้', 'ออเดอร์วันนี้')).toBe('1,234 ออเดอร์')
    expect(rowValue('ในร้านตอนนี้', 'รายจ่ายวันนี้')).toBe('฿120.25')
  })

  // ทดสอบ: ไม่มีสลิปค้าง ต้องไม่มีแบนเนอร์เตือน
  // วิธี: mock slipIssues เป็น 0 → เช็กว่าไม่มีแบนเนอร์
  it('ไม่มีสลิปค้าง → ไม่มีแบนเนอร์เตือน', () => {
    renderData()
    expect(slipBanner()).not.toBeInTheDocument()
  })

  // ทดสอบ: มีสลิปรอตรวจหรือไม่ผ่าน แบนเนอร์ต้องบอกจำนวน และกดแล้วไปหน้า Check
  // วิธี: mock รอตรวจ 2 ไม่ผ่าน 1 → เช็กข้อความแบนเนอร์ → กด → เช็กว่าเห็น "หน้า Check"
  it('มีสลิปรอตรวจ/ไม่ผ่าน → แบนเนอร์บอกจำนวน และกดแล้วไปหน้า Check', async () => {
    const user = userEvent.setup()
    renderData({ slipIssues: { pending: 2, failed: 1 } })
    const banner = slipBanner() as HTMLElement
    expect(banner).toHaveTextContent('รอตรวจ 2 · ไม่ผ่าน 1')
    await user.click(banner)
    expect(await screen.findByText('หน้า Check')).toBeInTheDocument()
  })

  // ทดสอบ: มีแต่สลิปไม่ผ่าน (รอตรวจ 0) ก็ต้องเตือน
  // วิธี: mock รอตรวจ 0 ไม่ผ่าน 1 → เช็กว่ามีแบนเนอร์ข้อความ "ไม่ผ่าน 1"
  it('มีแต่สลิปไม่ผ่าน (รอตรวจ 0) ก็ต้องเตือน', () => {
    renderData({ slipIssues: { pending: 0, failed: 1 } })
    expect(slipBanner()).toHaveTextContent('ไม่ผ่าน 1')
  })

  // ทดสอบ: รายการบิลที่รับเงินวันนี้บอกโต๊ะ วิธีจ่าย กี่นาทีที่แล้ว และยอด
  // วิธี: mock 2 บิล (เงินสด 5 นาทีก่อน, PromptPay 12 นาทีก่อน) → เช็กข้อความในแต่ละรายการ
  it('บิลที่รับเงินวันนี้: แต่ละบิลบอกโต๊ะ, วิธีจ่าย, กี่นาทีที่แล้ว และยอด', () => {
    renderData()
    const items = within(billsSection()).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('โต๊ะ 5')
    expect(items[0]).toHaveTextContent('เงินสด ·')
    expect(items[0]).toHaveTextContent('(5 นาทีที่แล้ว)')
    expect(items[0]).toHaveTextContent('฿105')
    expect(items[1]).toHaveTextContent('โต๊ะ 12')
    expect(items[1]).toHaveTextContent('PromptPay ·')
    expect(items[1]).toHaveTextContent('(12 นาทีที่แล้ว)')
  })

  // ทดสอบ: บิลเพิ่งจ่าย (หรือเวลาเครื่องช้ากว่า server จนดูเหมือนบิลมาจากอนาคต) ต้องขึ้น "เมื่อสักครู่" ไม่ติดลบ
  // วิธี: mock บิลที่เวลาอยู่ข้างหน้า 3 นาที → เช็กข้อความ "เมื่อสักครู่"
  it('เวลาเครื่องช้ากว่า server (บิล "อนาคต") → แสดง "เมื่อสักครู่" ไม่ติดลบ', () => {
    renderData({ notifications: [{ ...note(1), createdAt: minutesAgo(-3) }] })
    const item = within(billsSection()).getByRole('listitem')
    expect(item).toHaveTextContent('(เมื่อสักครู่)')
    expect(item).not.toHaveTextContent('-')
  })

  // ทดสอบ: ยังไม่มีบิล ต้องแสดงข้อความว่าง และไม่มีแถบแบ่งหน้า
  // วิธี: mock notifications ว่าง → เช็กข้อความ และไม่มี navigation "แบ่งหน้า"
  it('ยังไม่มีบิล → ข้อความว่าง และไม่มีแถบแบ่งหน้า', () => {
    renderData({ notifications: [] })
    expect(screen.getByText(/วันนี้ยังไม่มีบิลที่รับเงิน/)).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'แบ่งหน้า' })).not.toBeInTheDocument()
  })

  // ทดสอบ: บิลเกิน 10 ใบต้องแบ่งหน้าละ 10 และกดหน้า 2 แล้วเห็นใบที่เหลือ
  // วิธี: mock 12 บิล → เช็กว่าหน้าแรกมี 10 รายการ และ "1–10 จาก 12 บิล" → กดหน้า 2 → เช็กว่าเหลือ 2 รายการ และ "11–12 จาก 12 บิล"
  it('บิลเกิน 10 ใบ → แบ่งหน้าละ 10 กดหน้า 2 แล้วเห็นใบที่เหลือ', async () => {
    const user = userEvent.setup()
    renderData({ notifications: Array.from({ length: 12 }, (_, i) => note(i + 1)) })
    const section = billsSection()
    expect(within(section).getAllByRole('listitem')).toHaveLength(10)
    expect(within(section).getByText('1–10 จาก 12 บิล')).toBeInTheDocument()

    await user.click(within(section).getByRole('button', { name: '2' }))
    const page2 = within(section).getAllByRole('listitem')
    expect(page2).toHaveLength(2)
    expect(page2[0]).toHaveTextContent('โต๊ะ 11')
    expect(within(section).getByText('11–12 จาก 12 บิล')).toBeInTheDocument()
  })
})

describe('DashboardPage — 7 / 30 วัน', () => {
  beforeEach(() => {
    vi.mocked(useDashboard).mockReset()
    vi.mocked(useDashboardPeriod).mockReset()
  })

  // ทดสอบ: กดแท็บ "7 วัน" แล้วหน้าเปลี่ยนไปดึงสรุป 7 วัน
  // วิธี: render หน้าวันนี้ → กด "7 วัน" → เช็กว่า useDashboardPeriod ถูกเรียกด้วย 7 และปุ่มถูกเลือก
  it('กดแท็บ "7 วัน" → ดึงสรุป 7 วัน และปุ่มถูกเลือก', async () => {
    const user = userEvent.setup()
    renderData()
    expect(vi.mocked(useDashboardPeriod)).toHaveBeenLastCalledWith(null)
    await user.click(screen.getByRole('button', { name: '7 วัน' }))
    expect(vi.mocked(useDashboardPeriod)).toHaveBeenLastCalledWith(7)
    expect(screen.getByRole('button', { name: '7 วัน' })).toHaveAttribute('aria-pressed', 'true')
  })

  // ทดสอบ: เปิดด้วย ?range=7 ต้องแสดงสรุป 7 วัน: หัวข้อ ช่วงวันที่ การ์ด 4 ใบ และภาพรวมช่วงนี้
  // วิธี: mock ข้อมูล 7 วัน → เช็กหัวข้อ, การ์ด, เฉลี่ยต่อวัน/ต่อบิล, วันที่ขายดีที่สุด, วันที่ไม่มีรายรับ
  it('?range=7 → หัวข้อ, การ์ด 4 ใบ และภาพรวมช่วงนี้คำนวณถูก', () => {
    renderWith({ data: base }, { url: '/owner/dashboard?range=7', period: { data: period7 } })
    expect(screen.getByRole('heading', { name: 'สรุป 7 วันล่าสุด' })).toBeInTheDocument()
    expect(screen.getByText(/\(รวมวันนี้\)/)).toBeInTheDocument()
    expect(statCard('รายรับ 7 วัน')).toHaveTextContent('฿7,000')
    expect(statCard('รายรับ 7 วัน')).toHaveTextContent('50 บิล')
    expect(statCard('เงินสด')).toHaveTextContent('30 บิล')
    expect(statCard('PromptPay')).toHaveTextContent('20 บิล')
    expect(statCard('กำไรสุทธิ 7 วัน')).toHaveTextContent('฿6,500')
    expect(rowValue('ภาพรวมช่วงนี้', 'เฉลี่ยต่อวัน')).toBe('฿1,000')
    expect(rowValue('ภาพรวมช่วงนี้', 'เฉลี่ยต่อบิล')).toBe('฿140')
    expect(rowValue('ภาพรวมช่วงนี้', 'วันที่ขายดีที่สุด')).toContain('฿2,500')
    expect(rowValue('ภาพรวมช่วงนี้', 'วันที่ไม่มีรายรับ')).toBe('2 จาก 7 วัน')
    // หน้าวันนี้ต้องไม่โผล่ในแท็บ 7 วัน
    expect(screen.queryByRole('heading', { name: 'บิลที่รับเงินวันนี้' })).not.toBeInTheDocument()
  })

  // ทดสอบ: ช่วงที่ไม่มีบิลเลย ต้องไม่หารศูนย์ — เฉลี่ยต่อบิลและวันขายดีเป็น "–"
  // วิธี: mock ข้อมูล 7 วันที่ยอดเป็น 0 ทั้งหมด → เช็กค่า "–"
  it('ไม่มีบิลในช่วงนั้น → เฉลี่ยต่อบิลและวันขายดีเป็น "–"', () => {
    const empty: PeriodData = {
      ...period7,
      revenue: 0,
      paymentCount: 0,
      trend: period7.trend.map((p) => ({ ...p, revenue: 0 })),
    }
    renderWith({ data: base }, { url: '/owner/dashboard?range=7', period: { data: empty } })
    expect(rowValue('ภาพรวมช่วงนี้', 'เฉลี่ยต่อบิล')).toBe('–')
    expect(rowValue('ภาพรวมช่วงนี้', 'วันที่ขายดีที่สุด')).toBe('–')
    expect(rowValue('ภาพรวมช่วงนี้', 'วันที่ไม่มีรายรับ')).toBe('7 จาก 7 วัน')
  })

  // ทดสอบ: ระหว่างโหลดสรุปหลายวันขึ้นกำลังโหลด และโหลดไม่ได้ต้องบอกพร้อมปุ่มลองใหม่
  // วิธี: mock period isPending → เช็ก "กำลังโหลด..." → render ใหม่เป็น error → เช็กแถบ "โหลดสรุป 30 วันไม่ได้" และกดลองใหม่
  it('สรุปหลายวัน: กำลังโหลด / โหลดไม่ได้พร้อมปุ่มลองใหม่', async () => {
    const user = userEvent.setup()
    const { unmount } = renderWith(
      { data: base },
      { url: '/owner/dashboard?range=30', period: { isPending: true } },
    )
    expect(screen.getByText('กำลังโหลด...')).toBeInTheDocument()
    unmount()

    const refetch = vi.fn()
    renderWith(
      { data: base },
      { url: '/owner/dashboard?range=30', period: { isError: true, error: new Error('x'), refetch } as Partial<PeriodQuery> },
    )
    expect(screen.getByRole('alert')).toHaveTextContent('โหลดสรุป 30 วันไม่ได้')
    await user.click(screen.getByRole('button', { name: 'ลองใหม่' }))
    expect(refetch).toHaveBeenCalled()
  })
})
