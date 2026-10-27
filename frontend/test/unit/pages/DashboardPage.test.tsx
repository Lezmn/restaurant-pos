import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { lastDays, previousRange, todayYmd } from '@/features/reports/api'
import { useDashboard, useDashboardPeriod, useTopItems } from '@/features/reports/hooks'
import { PaymentMethod } from '@/types/enums'
import type { DashboardData, DateRange, Notification, PeriodData, TopItems } from '@/types/reports'
import { DashboardPage } from '@/pages/owner/DashboardPage'

// ส่วน getDashboard / getDashboardPeriod (ประกอบข้อมูลจาก API) เทสแยกที่ test/unit/features/reports-api.test.ts
// ที่นี่เทสแค่ว่าหน้าจอแสดงข้อมูลที่ได้มาครบและถูกที่ — helper คิดช่วงวันที่ (lastDays/previousRange) ใช้ของจริง
vi.mock('@/features/reports/hooks', () => ({
  useDashboard: vi.fn(),
  useDashboardPeriod: vi.fn(),
  useTopItems: vi.fn(),
}))

type DashboardQuery = ReturnType<typeof useDashboard>
type PeriodQuery = ReturnType<typeof useDashboardPeriod>
type TopItemsQuery = ReturnType<typeof useTopItems>

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

/** ข้อมูลช่วง 7 วัน — รายรับรายวัน 0, 0, 1000, 2500, 1000, 1000, 1500 */
const period = (range: DateRange, overrides: Partial<PeriodData> = {}): PeriodData => {
  const revenues = [0, 0, 1000, 2500, 1000, 1000, 1500]
  const start = new Date(`${range.from}T00:00:00`)
  return {
    days: 7,
    from: range.from,
    to: range.to,
    revenue: 7000,
    expenseTotal: 500,
    netProfit: 6500,
    cashTotal: 4000,
    promptPayTotal: 3000,
    cashCount: 30,
    promptPayCount: 20,
    paymentCount: 50,
    trend: revenues.map((revenue, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
      const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      return { label: String(i), date: ymd, revenue }
    }),
    payments: [],
    ...overrides,
  }
}

const topItems: TopItems = {
  items: [
    { menuItemId: 'm1', name: 'กะเพราหมู', categoryName: 'อาหารจานเดียว', quantity: 40, revenue: 2400 },
    { menuItemId: 'm2', name: 'ชาเย็น', categoryName: 'เครื่องดื่ม', quantity: 25, revenue: 875 },
  ],
  totalQuantity: 65,
}

const idle = { data: undefined, isPending: false, isError: false, error: null, refetch: vi.fn() }

function renderWith(
  state: Partial<DashboardQuery>,
  {
    url = '/owner/dashboard',
    current = {},
    previous = {},
    top = { data: topItems },
  }: {
    url?: string
    /** ผลของช่วงที่ดูอยู่ */
    current?: Partial<PeriodQuery>
    /** ผลของช่วงก่อนหน้า (ไว้เทียบ) */
    previous?: Partial<PeriodQuery>
    top?: Partial<TopItemsQuery>
  } = {},
) {
  vi.mocked(useDashboard).mockReturnValue({
    ...idle,
    refetch: vi.fn(),
    ...state,
  } as unknown as DashboardQuery)
  // หน้าเรียก useDashboardPeriod 2 ครั้ง: ช่วงที่ดู และช่วงก่อนหน้า — แยกด้วยวันสุดท้าย (ช่วงก่อนหน้าจบก่อนวันนี้เสมอ)
  let currentRange: DateRange | null = null
  vi.mocked(useDashboardPeriod).mockImplementation(((range: DateRange | null) => {
    if (range === null) return idle
    if (currentRange === null || range.to >= currentRange.to) {
      currentRange = range
      return { ...idle, ...current }
    }
    return { ...idle, ...previous }
  }) as never)
  vi.mocked(useTopItems).mockReturnValue({ ...idle, ...top } as unknown as TopItemsQuery)
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

const sectionOf = (heading: string) =>
  screen.getByRole('heading', { name: heading }).closest('section') as HTMLElement

const slipBanner = () => screen.queryByRole('link', { name: /สลิป PromptPay ที่ยังยืนยันเงินเข้าไม่ได้/ })

beforeEach(() => {
  vi.mocked(useDashboard).mockReset()
  vi.mocked(useDashboardPeriod).mockReset()
  vi.mocked(useTopItems).mockReset()
})

describe('DashboardPage — วันนี้', () => {
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
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent('โหลดสรุปยอดล่าสุดไม่ได้')
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

  // ทดสอบ: หัวข้อเป็น "สรุปวันนี้" วันที่เป็นภาษาไทย ปุ่ม "วันนี้" ถูกเลือก และช่องวันที่ทั้งสองเป็นวันนี้
  // วิธี: mock วันที่ 2026-10-23T17:00Z (= 24 ต.ค. เวลาไทย) → เช็กหัวข้อ, "24 ตุลาคม 2569", ปุ่ม และค่าช่องวันที่
  it('หัวข้อ "สรุปวันนี้" วันที่ภาษาไทย และช่องวันที่เป็นวันนี้', () => {
    renderData()
    expect(screen.getByRole('heading', { name: 'สรุปวันนี้' })).toBeInTheDocument()
    expect(screen.getByText(/24 ตุลาคม 2569/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'วันนี้' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('ตั้งแต่')).toHaveValue(todayYmd())
    expect(screen.getByLabelText('ถึง')).toHaveValue(todayYmd())
    // ดูวันนี้ไม่ต้องดึงสรุปช่วง
    expect(vi.mocked(useDashboardPeriod)).toHaveBeenCalledWith(null)
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
    const items = within(sectionOf('บิลที่รับเงินวันนี้')).getAllByRole('listitem')
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
    const item = within(sectionOf('บิลที่รับเงินวันนี้')).getByRole('listitem')
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
    const section = sectionOf('บิลที่รับเงินวันนี้')
    expect(within(section).getAllByRole('listitem')).toHaveLength(10)
    expect(within(section).getByText('1–10 จาก 12 บิล')).toBeInTheDocument()

    await user.click(within(section).getByRole('button', { name: '2' }))
    const page2 = within(section).getAllByRole('listitem')
    expect(page2).toHaveLength(2)
    expect(page2[0]).toHaveTextContent('โต๊ะ 11')
    expect(within(section).getByText('11–12 จาก 12 บิล')).toBeInTheDocument()
  })
})

describe('DashboardPage — เมนูขายดี', () => {
  // ทดสอบ: เมนูขายดีเรียงอันดับ บอกจำนวนจาน หมวด และยอดขาย และหน้าวันนี้ดึงของวันนี้
  // วิธี: mock 2 เมนู → เช็กลำดับและข้อความในแต่ละอันดับ และ useTopItems ถูกเรียกด้วยช่องวันนี้ถึงวันนี้
  it('เรียงอันดับ บอกจำนวนจาน หมวด และยอดขาย ของวันนี้', () => {
    renderData()
    const items = within(sectionOf('เมนูขายดี')).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('1กะเพราหมู40 จาน')
    expect(items[0]).toHaveTextContent('อาหารจานเดียว · ฿2,400')
    expect(items[1]).toHaveTextContent('2ชาเย็น25 จาน')
    expect(vi.mocked(useTopItems)).toHaveBeenCalledWith({ from: todayYmd(), to: todayYmd() })
  })

  // ทดสอบ: ยังไม่มีเมนูที่ขายได้ ต้องบอกว่าไม่มี / โหลดไม่ได้ต้องมีแถบ error พร้อมลองใหม่
  // วิธี: mock รายการว่าง → เช็กข้อความ → render ใหม่เป็น error → กดลองใหม่ เช็ก refetch
  it('ยังไม่มีเมนูที่ขายได้ / โหลดไม่ได้พร้อมปุ่มลองใหม่', async () => {
    const user = userEvent.setup()
    const { unmount } = renderWith({ data: base }, { top: { data: { items: [], totalQuantity: 0 } } })
    expect(within(sectionOf('เมนูขายดี')).getByText('ยังไม่มีเมนูที่ขายได้ในช่วงนี้')).toBeInTheDocument()
    unmount()

    const refetch = vi.fn()
    renderWith({ data: base }, { top: { isError: true, error: new Error('x'), refetch } as Partial<TopItemsQuery> })
    const section = sectionOf('เมนูขายดี')
    expect(within(section).getByRole('alert')).toHaveTextContent('โหลดเมนูขายดีไม่ได้')
    await user.click(within(section).getByRole('button', { name: 'ลองใหม่' }))
    expect(refetch).toHaveBeenCalled()
  })
})

describe('DashboardPage — 7 / 30 วัน', () => {
  // ทดสอบ: กดปุ่ม "7 วัน" แล้วดึงสรุป 7 วันล่าสุด (รวมวันนี้) และช่วงก่อนหน้าที่ยาวเท่ากันไว้เทียบ
  // วิธี: render หน้าวันนี้ → กด "7 วัน" → เช็กว่า useDashboardPeriod ถูกเรียกด้วยช่วง 7 วันและช่วงก่อนหน้า และปุ่มถูกเลือก
  it('กด "7 วัน" → ดึงสรุป 7 วันล่าสุดและช่วงก่อนหน้า ปุ่มถูกเลือก', async () => {
    const user = userEvent.setup()
    renderData()
    await user.click(screen.getByRole('button', { name: '7 วัน' }))
    const range = lastDays(7)
    expect(vi.mocked(useDashboardPeriod)).toHaveBeenCalledWith(range)
    expect(vi.mocked(useDashboardPeriod)).toHaveBeenCalledWith(previousRange(range))
    expect(screen.getByRole('button', { name: '7 วัน' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('ตั้งแต่')).toHaveValue(range.from)
  })

  // ทดสอบ: เปิดด้วย ?range=7 ต้องแสดงสรุป 7 วัน: หัวข้อ การ์ด 4 ใบ ภาพรวมช่วงนี้ และไม่มีส่วนของหน้าวันนี้
  // วิธี: mock ข้อมูล 7 วัน → เช็กหัวข้อ, การ์ด, เฉลี่ยต่อวัน/ต่อบิล, วันที่ขายดีที่สุด, วันที่ไม่มีรายรับ
  it('?range=7 → หัวข้อ การ์ด 4 ใบ และภาพรวมช่วงนี้คำนวณถูก', () => {
    renderWith({ data: base }, { url: '/owner/dashboard?range=7', current: { data: period(lastDays(7)) } })
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
    expect(screen.getByRole('heading', { name: 'รายรับรายวัน' })).toBeInTheDocument()
    // ส่วนของหน้าวันนี้ต้องไม่โผล่
    expect(screen.queryByRole('heading', { name: 'ในร้านตอนนี้' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /บิลที่รับเงิน/ })).not.toBeInTheDocument()
  })

  // ทดสอบ: เทียบกับช่วงก่อนหน้าที่ยาวเท่ากัน: รายรับบอกเป็น % (▲ เพิ่มขึ้น) กำไรบอกเป็นบาท (▼ ลดลง)
  // วิธี: mock ช่วงนี้รายรับ 7,000 กำไร 6,500 / ช่วงก่อนรายรับ 5,000 กำไร 7,000 → เช็ก "เพิ่มขึ้น 40% จาก 7 วันก่อนหน้า" และ "ลดลง ฿500"
  it('เทียบช่วงก่อนหน้า: รายรับเพิ่มเป็น % และกำไรลดเป็นบาท', () => {
    const range = lastDays(7)
    renderWith(
      { data: base },
      {
        url: '/owner/dashboard?range=7',
        current: { data: period(range) },
        previous: { data: period(previousRange(range), { revenue: 5000, netProfit: 7000 }) },
      },
    )
    expect(statCard('รายรับ 7 วัน')).toHaveTextContent('เพิ่มขึ้น 40% จาก 7 วันก่อนหน้า')
    expect(statCard('กำไรสุทธิ 7 วัน')).toHaveTextContent('ลดลง ฿500 จาก 7 วันก่อนหน้า')
  })

  // ทดสอบ: ช่วงก่อนหน้ารายรับเป็น 0 คิด % ไม่ได้ ต้องบอกเป็นบาทแทน / ยอดเท่ากันต้องบอก "เท่ากับ"
  // วิธี: mock ช่วงก่อนรายรับ 0 → เช็ก "เพิ่มขึ้น ฿7,000" → render ใหม่ให้กำไรเท่ากัน → เช็ก "เท่ากับ 7 วันก่อนหน้า"
  it('ช่วงก่อนหน้าเป็น 0 → บอกเป็นบาท / ยอดเท่ากัน → "เท่ากับ"', () => {
    const range = lastDays(7)
    const prevRange = previousRange(range)
    const { unmount } = renderWith(
      { data: base },
      {
        url: '/owner/dashboard?range=7',
        current: { data: period(range) },
        previous: { data: period(prevRange, { revenue: 0 }) },
      },
    )
    expect(statCard('รายรับ 7 วัน')).toHaveTextContent('เพิ่มขึ้น ฿7,000 จาก 7 วันก่อนหน้า')
    expect(statCard('กำไรสุทธิ 7 วัน')).toHaveTextContent('เท่ากับ 7 วันก่อนหน้า')
    unmount()
  })

  // ทดสอบ: ข้อมูลช่วงก่อนหน้ายังไม่มา (หรือเป็นของช่วงอื่นที่ค้างอยู่) ต้องไม่โชว์ส่วนเทียบ
  // วิธี: mock previous เป็น undefined → เช็กว่าไม่มีคำว่า "ก่อนหน้า" ในการ์ด
  it('ยังไม่มีข้อมูลช่วงก่อนหน้า → ไม่โชว์ส่วนเทียบ', () => {
    renderWith({ data: base }, { url: '/owner/dashboard?range=7', current: { data: period(lastDays(7)) } })
    expect(statCard('รายรับ 7 วัน')).not.toHaveTextContent('ก่อนหน้า')
  })

  // ทดสอบ: ช่วงที่ไม่มีบิลเลย ต้องไม่หารศูนย์ — เฉลี่ยต่อบิลและวันขายดีเป็น "–"
  // วิธี: mock ข้อมูล 7 วันที่ยอดเป็น 0 ทั้งหมด → เช็กค่า "–"
  it('ไม่มีบิลในช่วงนั้น → เฉลี่ยต่อบิลและวันขายดีเป็น "–"', () => {
    const range = lastDays(7)
    const empty = period(range)
    renderWith(
      { data: base },
      {
        url: '/owner/dashboard?range=7',
        current: {
          data: { ...empty, revenue: 0, paymentCount: 0, trend: empty.trend.map((p) => ({ ...p, revenue: 0 })) },
        },
      },
    )
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
      { url: '/owner/dashboard?range=30', current: { isPending: true } },
    )
    expect(screen.getByText('กำลังโหลด...')).toBeInTheDocument()
    unmount()

    const refetch = vi.fn()
    renderWith(
      { data: base },
      { url: '/owner/dashboard?range=30', current: { isError: true, error: new Error('x'), refetch } as Partial<PeriodQuery> },
    )
    expect(screen.getByRole('alert')).toHaveTextContent('โหลดสรุป 30 วันไม่ได้')
    await user.click(screen.getByRole('button', { name: 'ลองใหม่' }))
    expect(refetch).toHaveBeenCalled()
  })
})

describe('DashboardPage — เลือกวันที่เอง', () => {
  const day = '2026-10-20'
  const singleDay = (overrides: Partial<PeriodData> = {}) =>
    period(
      { from: day, to: day },
      {
        days: 1,
        revenue: 450,
        paymentCount: 3,
        expenseTotal: 80,
        netProfit: 370,
        trend: [{ label: 'จ.', date: day, revenue: 450 }],
        payments: [
          { id: 'b1', title: 'ใบเสร็จ R-0003', method: PaymentMethod.PROMPTPAY, amount: 200, paidAt: `${day}T18:20:00+07:00` },
          { id: 'b2', title: 'ใบเสร็จ R-0002', method: PaymentMethod.CASH, amount: 150, paidAt: `${day}T12:40:00+07:00` },
          { id: 'b3', title: 'ใบเสร็จ R-0001', method: PaymentMethod.CASH, amount: 100, paidAt: `${day}T12:10:00+07:00` },
        ],
        ...overrides,
      },
    )

  // ทดสอบ: เปิด ?from=วันเดียว ต้องเป็นมุมมองวันเดียว: หัวข้อวันที่ กราฟรายชั่วโมง ภาพรวมวันนั้น (ชั่วโมงขายดี) และรายการบิลของวันนั้น
  // วิธี: mock บิล 3 ใบ (12:10, 12:40, 18:20) → เช็กหัวข้อ, "รายรับวันนั้น", ชั่วโมงที่ขายดีที่สุด 12:00–12:59 ฿250, จำนวนบิล และรายการบิล
  it('วันเดียว → หัวข้อวันที่ ภาพรวมวันนั้น ชั่วโมงขายดี และรายการบิลของวันนั้น', () => {
    renderWith({ data: base }, { url: `/owner/dashboard?from=${day}`, current: { data: singleDay() } })
    expect(screen.getByRole('heading', { name: 'สรุปวันที่ 20 ต.ค. 2569' })).toBeInTheDocument()
    expect(screen.getByText(/20 ตุลาคม 2569/)).toBeInTheDocument()
    // ไม่มีปุ่มช่วงเวลาไหนถูกเลือก
    for (const name of ['วันนี้', '7 วัน', '30 วัน']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false')
    }
    expect(statCard('รายรับวันนั้น')).toHaveTextContent('฿450')
    expect(statCard('กำไรสุทธิวันนั้น')).toHaveTextContent('฿370')
    expect(screen.getByRole('heading', { name: 'รายรับรายชั่วโมง' })).toBeInTheDocument()
    expect(rowValue('ภาพรวมวันนั้น', 'จำนวนบิล')).toBe('3 บิล')
    expect(rowValue('ภาพรวมวันนั้น', 'เฉลี่ยต่อบิล')).toBe('฿150')
    expect(rowValue('ภาพรวมวันนั้น', 'ชั่วโมงที่ขายดีที่สุด')).toBe('12:00–12:59 · ฿250')
    expect(rowValue('ภาพรวมวันนั้น', 'รายจ่าย')).toBe('฿80')

    const bills = within(sectionOf('บิลที่รับเงินวันนั้น')).getAllByRole('listitem')
    expect(bills).toHaveLength(3)
    expect(bills[0]).toHaveTextContent('ใบเสร็จ R-0003')
    expect(bills[0]).toHaveTextContent('PromptPay · 18:20')
    expect(bills[0]).toHaveTextContent('฿200')
    // เมนูขายดีดึงของวันนั้น
    expect(vi.mocked(useTopItems)).toHaveBeenCalledWith({ from: day, to: day })
  })

  // ทดสอบ: วันที่เลือกไม่มีบิลเลย ต้องบอกว่าไม่มี และชั่วโมงขายดีเป็น "–"
  // วิธี: mock วันเดียวที่ payments ว่าง → เช็กข้อความ "วันนั้นไม่มีบิลที่รับเงิน" และ "–"
  it('วันที่เลือกไม่มีบิล → บอกว่าไม่มี และชั่วโมงขายดีเป็น "–"', () => {
    renderWith(
      { data: base },
      { url: `/owner/dashboard?from=${day}`, current: { data: singleDay({ payments: [], revenue: 0, paymentCount: 0 }) } },
    )
    expect(screen.getByText('วันนั้นไม่มีบิลที่รับเงิน')).toBeInTheDocument()
    expect(rowValue('ภาพรวมวันนั้น', 'ชั่วโมงที่ขายดีที่สุด')).toBe('–')
  })

  // ทดสอบ: ดูวันเดียวเทียบกับ "วันก่อนหน้า"
  // วิธี: mock วันก่อนหน้ารายรับ 300 → เช็ก "เพิ่มขึ้น 50% จากวันก่อนหน้า"
  it('วันเดียว → เทียบกับวันก่อนหน้า', () => {
    renderWith(
      { data: base },
      {
        url: `/owner/dashboard?from=${day}`,
        current: { data: singleDay() },
        previous: { data: period({ from: '2026-10-19', to: '2026-10-19' }, { days: 1, revenue: 300, netProfit: 370 }) },
      },
    )
    expect(statCard('รายรับวันนั้น')).toHaveTextContent('เพิ่มขึ้น 50% จากวันก่อนหน้า')
    expect(statCard('กำไรสุทธิวันนั้น')).toHaveTextContent('เท่ากับวันก่อนหน้า')
  })

  // ทดสอบ: ช่วงหลายวันที่เลือกเอง หัวข้อบอกช่วงวันที่และจำนวนวัน และดึงข้อมูลตามช่วงนั้น
  // วิธี: เปิด ?from=2026-10-01&to=2026-10-10 → เช็กหัวข้อ "สรุป 1 ต.ค. – 10 ต.ค. 2569", "10 วัน" และ useDashboardPeriod ถูกเรียกด้วยช่วงนั้น
  it('ช่วงที่เลือกเองหลายวัน → หัวข้อบอกช่วงและจำนวนวัน', () => {
    renderWith({ data: base }, { url: '/owner/dashboard?from=2026-10-01&to=2026-10-10', current: { isPending: true } })
    expect(screen.getByRole('heading', { name: 'สรุป 1 ต.ค. – 10 ต.ค. 2569' })).toBeInTheDocument()
    expect(screen.getByText('10 วัน')).toBeInTheDocument()
    expect(vi.mocked(useDashboardPeriod)).toHaveBeenCalledWith({ from: '2026-10-01', to: '2026-10-10' })
  })

  // ทดสอบ: URL ที่ใส่วันเริ่มหลังวันจบ ต้องสลับให้ถูก / วันที่ในอนาคตต้องตัดเหลือวันนี้
  // วิธี: เปิด ?from=2026-10-10&to=2026-10-01 → เช็กว่าดึงช่วง 1–10 → เปิด ?from=2999-01-01 → เช็กว่าดึงวันนี้ถึงวันนี้
  it('วันเริ่มหลังวันจบ → สลับให้ / วันที่ในอนาคต → ตัดเหลือวันนี้', () => {
    const { unmount } = renderWith(
      { data: base },
      { url: '/owner/dashboard?from=2026-10-10&to=2026-10-01', current: { isPending: true } },
    )
    expect(vi.mocked(useDashboardPeriod)).toHaveBeenCalledWith({ from: '2026-10-01', to: '2026-10-10' })
    unmount()

    vi.mocked(useDashboardPeriod).mockClear()
    renderWith({ data: base }, { url: '/owner/dashboard?from=2999-01-01', current: { isPending: true } })
    expect(vi.mocked(useDashboardPeriod)).toHaveBeenCalledWith({ from: todayYmd(), to: todayYmd() })
  })

  // ทดสอบ: แก้ช่อง "ตั้งแต่" แล้วเปลี่ยนเป็นช่วงที่เลือกเอง (วันเดียว ถ้าช่อง "ถึง" อยู่ก่อนวันที่เลือก)
  // วิธี: เปิดหน้าวันนี้ → เปลี่ยนช่องตั้งแต่เป็น 2026-10-20 → เช็กว่าดึงช่วง 20 ต.ค. ถึงวันนี้ และไม่มีปุ่มไหนถูกเลือก
  it('แก้ช่องวันที่ → เปลี่ยนเป็นช่วงที่เลือกเอง', () => {
    renderWith({ data: base }, { current: { isPending: true } })
    fireEvent.change(screen.getByLabelText('ตั้งแต่'), { target: { value: day } })
    expect(vi.mocked(useDashboardPeriod)).toHaveBeenCalledWith({ from: day, to: todayYmd() })
    expect(screen.getByRole('button', { name: 'วันนี้' })).toHaveAttribute('aria-pressed', 'false')
  })
})
