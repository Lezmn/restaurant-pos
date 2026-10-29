import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { currentMonth, getSales } from '@/features/reports/api'
import type { SalesData } from '@/types/reports'
import { SalesPage } from '@/pages/owner/SalesPage'

// เวลาเปิดร้าน (VITE_OPEN_HOUR/CLOSE_HOUR) — null = ตัดตามข้อมูล, เทสต์ไหนอยากล็อกช่วงก็ตั้งเอง
const config = vi.hoisted(() => ({ businessHours: null as number[] | null }))
vi.mock('@/lib/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/config')>()),
  get BUSINESS_HOURS() {
    return config.businessHours
  },
}))

vi.mock('@/features/reports/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/reports/api')>()),
  getSales: vi.fn(),
}))

const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, orderCount: 0, quantity: 0, revenue: 0 }))
hours[12] = { hour: 12, orderCount: 9, quantity: 14, revenue: 980 }
hours[18] = { hour: 18, orderCount: 4, quantity: 6, revenue: 520 }

const data: SalesData = {
  month: '2026-10',
  orderCount: 13,
  totalQuantity: 20,
  totalRevenue: 1500,
  topItems: [
    { menuItemId: 'm1', name: 'ชาเย็น', categoryName: 'เครื่องดื่ม', quantity: 12, revenue: 300 },
    { menuItemId: 'm2', name: 'ต้มยำกุ้ง', categoryName: 'กับข้าว', quantity: 8, revenue: 1200 },
  ],
  unsoldItems: [{ menuItemId: 'm3', name: 'ยำวุ้นเส้น', categoryName: 'กับข้าว' }],
  byHour: hours,
  byWeekdayHour: Array.from({ length: 7 }, (_, day) =>
    Array.from({ length: 24 }, (_, hour) => (day === 5 && hour === 12 ? 6 : 0)),
  ),
  kitchen: {
    timedOrderCount: 10,
    avgWaitMinutes: 2.5,
    avgCookMinutes: 7.2,
    avgTotalMinutes: 9.7,
    lateMinutes: 15,
    lateOrderCount: 1,
    slowestMenus: [{ menuItemId: 'm2', name: 'ต้มยำกุ้ง', orderCount: 4, avgCookMinutes: 11 }],
  },
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      {/* การ์ดอันดับเมนูมีลิงก์ไปหน้าจัดการเมนู — ต้องมี router */}
      <MemoryRouter>
        <SalesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.mocked(getSales).mockReset()
  config.businessHours = null
})

describe('SalesPage (เมนูขายดี)', () => {
  it('เรียงตามจำนวนออเดอร์ก่อน สลับเป็นยอดเงินแล้วอันดับเปลี่ยน', async () => {
    vi.mocked(getSales).mockResolvedValue(data)
    renderPage()

    const ranking = await screen.findByRole('list', { name: 'อันดับเมนู' })
    expect(within(ranking).getAllByRole('listitem')[0]).toHaveTextContent('ชาเย็น')

    await userEvent.click(screen.getByRole('button', { name: 'ยอดเงิน' }))
    expect(within(ranking).getAllByRole('listitem')[0]).toHaveTextContent('ต้มยำกุ้ง')
  })

  it('บอกชั่วโมงที่ลูกค้าสั่งมากที่สุด (รวมทุกวัน) และเมนูที่ไม่มีใครสั่ง', async () => {
    vi.mocked(getSales).mockResolvedValue(data)
    renderPage()

    const card = (await screen.findByText('ชั่วโมงที่ลูกค้าสั่งมากที่สุด')).closest('div.rounded-xl')!
    expect(card).toHaveTextContent('12:00–13:00')
    expect(card).toHaveTextContent('รวมทุกวัน 9 ออเดอร์')
    // ไม่มีใครสั่ง = ท้ายการ์ดอันดับเมนู พร้อมลิงก์ไปแก้เมนู
    const ranking = screen.getByRole('heading', { name: 'อันดับเมนู' }).closest('section')!
    // ไม่กี่เมนู = กางรายชื่อไว้เลย ไม่มีปุ่มพับ
    const unsold = within(ranking).getByLabelText('เมนูที่ไม่มีใครสั่ง แยกตามหมวด')
    expect(unsold).toHaveTextContent('ยำวุ้นเส้น')
    expect(within(ranking).queryByRole('button', { name: /ดูรายชื่อ/ })).not.toBeInTheDocument()
    expect(within(ranking).getByRole('link', { name: /ไปหน้าจัดการเมนู/ })).toHaveAttribute(
      'href',
      '/employee/manage',
    )
  })

  it('เมนูที่ไม่มีใครสั่งเยอะ ๆ พับไว้ โชว์จำนวนแยกหมวด กดแล้วค่อยเห็นรายชื่อ', async () => {
    const unsoldItems = Array.from({ length: 12 }, (_, i) => ({
      menuItemId: `u${i}`,
      name: `เมนูค้าง ${i + 1}`,
      categoryName: i < 9 ? 'อาหารจานเดียว' : 'ของหวาน',
    }))
    vi.mocked(getSales).mockResolvedValue({ ...data, unsoldItems })
    renderPage()

    const heading = await screen.findByRole('heading', { name: 'ไม่มีใครสั่งเลย 12 เมนู' })
    const section = heading.closest('div.border-t') as HTMLElement
    expect(section).toHaveTextContent('อาหารจานเดียว 9 · ของหวาน 3')
    expect(within(section).queryByText('เมนูค้าง 1')).not.toBeInTheDocument()

    await userEvent.click(within(section).getByRole('button', { name: 'ดูรายชื่อทั้ง 12 เมนู' }))
    expect(within(section).getByLabelText('เมนูที่ไม่มีใครสั่ง แยกตามหมวด')).toHaveTextContent('เมนูค้าง 12')
    expect(within(section).getByRole('button', { name: 'ซ่อนรายชื่อ' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('แสดง heatmap วันที่ยุ่งสุด และความเร็วครัว', async () => {
    vi.mocked(getSales).mockResolvedValue(data)
    renderPage()

    expect(await screen.findByText('ศุกร์ 12:00–13:00')).toBeInTheDocument()
    const kitchen = screen.getByRole('heading', { name: 'ความเร็วครัว' }).closest('section')!
    expect(kitchen).toHaveTextContent('7.2 นาที')
    expect(kitchen).toHaveTextContent('10% ของออเดอร์')
    expect(kitchen).toHaveTextContent('ต้มยำกุ้ง')
  })

  // ข้ามใน Chrome จริง (npm run test:browser): ที่นั่น mock ของ @/lib/config อ่าน getter ครั้งเดียวตอนโหลด
  // เปลี่ยน config.businessHours ระหว่างเทสต์จึงไม่มีผล — npm test (jsdom) ยังรันเทสต์นี้ตามปกติ
  it.skipIf(!navigator.userAgent.includes('jsdom'))('ตั้งเวลาเปิดร้าน → heatmap แสดงเฉพาะช่วงนั้น ยอดรวมไม่นับออเดอร์นอกเวลา', async () => {
    config.businessHours = [10, 11, 12, 13]
    vi.mocked(getSales).mockResolvedValue({
      ...data,
      byWeekdayHour: Array.from({ length: 7 }, (_, day) =>
        Array.from({ length: 24 }, (_, hour) => (day === 5 && hour === 12 ? 6 : day === 1 && hour === 2 ? 3 : 0)),
      ),
    })
    renderPage()

    const heatmap = (await screen.findByRole('heading', { name: 'วันไหน ชั่วโมงไหนยุ่ง' })).closest('section')!
    const table = within(heatmap).getByRole('table')
    const columns = within(table).getAllByRole('columnheader').map((th) => th.textContent)
    expect(columns).toEqual(['วัน', '10:00', '11:00', '12:00', '13:00', 'รวม'])
    // ยอดรวมมุมขวาล่าง = 6 (ไม่รวม 3 ออเดอร์ตอนตีสอง)
    expect(within(table).getAllByRole('row').at(-1)).toHaveTextContent(/6$/)
    expect(heatmap).toHaveTextContent('ไม่รวม 3 ออเดอร์นอกเวลาเปิดร้าน (10:00–14:00)')
  })

  it('เดือนที่ยังไม่มีบิล → บอกตรง ๆ ไม่โชว์กราฟเปล่า', async () => {
    vi.mocked(getSales).mockResolvedValue({
      ...data,
      orderCount: 0,
      totalQuantity: 0,
      totalRevenue: 0,
      topItems: [],
      byHour: hours.map((h) => ({ ...h, orderCount: 0 })),
    })
    renderPage()

    expect(await screen.findByText(/ยังไม่มีออเดอร์ที่จ่ายแล้วใน/)).toBeInTheDocument()
    expect(screen.queryByText('อันดับเมนู')).not.toBeInTheDocument()
  })

  // ทดสอบ: เปิดหน้ามาต้องโหลดเดือนปัจจุบัน และช่องเลือกเดือนเลือกเดือนในอนาคตไม่ได้
  // วิธี: render หน้า → เช็กว่า getSales ถูกเรียกด้วย currentMonth() และช่อง "เดือน" มีค่า/ค่า max เป็นเดือนนี้
  it('เปิดหน้า → โหลดเดือนนี้ และเลือกเดือนในอนาคตไม่ได้', async () => {
    vi.mocked(getSales).mockResolvedValue(data)
    renderPage()

    await screen.findByRole('list', { name: 'อันดับเมนู' })
    const month = currentMonth()
    expect(getSales).toHaveBeenCalledWith(month)
    const input = screen.getByLabelText('เดือน')
    expect(input).toHaveValue(month)
    expect(input).toHaveAttribute('max', month)
  })

  // ทดสอบ: เปลี่ยนเดือนแล้วต้องดึงรายงานของเดือนใหม่ และตัวเลขบนจอเปลี่ยนตามเดือนนั้น
  // วิธี: mock getSales ให้ตอบตามเดือน (เดือนนี้ 20 จาน / 2026-01 ไม่มีบิล) → เปลี่ยนช่องเดือนเป็น 2026-01
  //       → เช็กว่าเรียก getSales('2026-01') และจอขึ้น "ยังไม่มีออเดอร์ที่จ่ายแล้วในมกราคม 2569" แทนการ์ดเดิม
  it('เปลี่ยนเดือน → โหลดรายงานเดือนนั้น และจอเปลี่ยนตาม', async () => {
    vi.mocked(getSales).mockImplementation(async (month: string) =>
      month === '2026-01'
        ? { ...data, month, orderCount: 0, totalQuantity: 0, totalRevenue: 0, topItems: [] }
        : data,
    )
    renderPage()
    expect(await screen.findByText('20 จาน')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('เดือน'), { target: { value: '2026-01' } })

    expect(await screen.findByText('ยังไม่มีออเดอร์ที่จ่ายแล้วในมกราคม 2569')).toBeInTheDocument()
    expect(getSales).toHaveBeenLastCalledWith('2026-01')
    expect(screen.queryByText('20 จาน')).not.toBeInTheDocument()
    expect(screen.getByLabelText('เดือน')).toHaveValue('2026-01')
  })

  // ทดสอบ: ลบค่าในช่องเดือนจนว่าง (เช่นกด clear) ต้องไม่ยิงรายงานด้วยเดือนว่าง และเดือนเดิมยังอยู่
  // วิธี: รอโหลดเสร็จ → เปลี่ยนช่องเดือนเป็น '' → เช็กว่า getSales ไม่ถูกเรียกด้วย '' และการ์ดเดิมยังแสดง
  it('ล้างช่องเดือน → ไม่โหลดเดือนว่าง และยังแสดงเดือนเดิม', async () => {
    vi.mocked(getSales).mockResolvedValue(data)
    renderPage()
    expect(await screen.findByText('20 จาน')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('เดือน'), { target: { value: '' } })

    expect(getSales).not.toHaveBeenCalledWith('')
    expect(screen.getByText('20 จาน')).toBeInTheDocument()
  })
})
