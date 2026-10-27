import { afterEach, describe, expect, it, vi } from 'vitest'
import { PaymentMethod } from '@/types/enums'
import {
  daysInRange,
  getDashboardPeriod,
  getTopItems,
  lastDays,
  previousRange,
  todayYmd,
} from '@/features/reports/api'

// ช่วงวันที่บน Dashboard (7 / 30 วัน / เลือกเอง) — helper คิดวัน และการแปลงข้อมูลจาก API
// TZ ของเทสล็อกเป็น Asia/Bangkok (vitest.config.ts)

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

function mockFetch(body: unknown) {
  const fetchMock = vi.fn(() => Promise.resolve(json(body)))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const calledUrl = (fetchMock: ReturnType<typeof mockFetch>) => String((fetchMock.mock.calls[0] as unknown[])[0])

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('ช่วงวันที่: daysInRange / lastDays / previousRange', () => {
  // ทดสอบ: นับจำนวนวันรวมวันแรกและวันสุดท้าย ข้ามเดือนและข้ามปีได้
  // วิธี: เทียบผลของหลายช่วง (วันเดียว, 7 วัน, ข้ามเดือน, ข้ามปี, ปีอธิกสุรทิน)
  it('daysInRange นับรวมทั้งสองวัน ข้ามเดือน/ปีได้', () => {
    expect(daysInRange({ from: '2026-10-20', to: '2026-10-20' })).toBe(1)
    expect(daysInRange({ from: '2026-10-20', to: '2026-10-26' })).toBe(7)
    expect(daysInRange({ from: '2026-09-28', to: '2026-10-03' })).toBe(6)
    expect(daysInRange({ from: '2026-12-30', to: '2027-01-02' })).toBe(4)
    expect(daysInRange({ from: '2028-02-28', to: '2028-03-01' })).toBe(3)
  })

  // ทดสอบ: lastDays(N) = N วันล่าสุดรวมวันนี้ ตามเวลาเครื่อง (ไม่ใช่ UTC)
  // วิธี: ตั้งเวลาเป็น 27 ต.ค. 00:30 เวลาไทย (= 26 ต.ค. UTC) → เช็กว่าวันนี้คือ 27 และ 7 วัน = 21–27
  it('lastDays / todayYmd ใช้วันตามเวลาไทย (หลังเที่ยงคืนยังไม่ใช่เมื่อวาน)', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-26T17:30:00.000Z'))
    expect(todayYmd()).toBe('2026-10-27')
    expect(lastDays(7)).toEqual({ from: '2026-10-21', to: '2026-10-27' })
    expect(lastDays(30)).toEqual({ from: '2026-09-28', to: '2026-10-27' })
    expect(lastDays(1)).toEqual({ from: '2026-10-27', to: '2026-10-27' })
  })

  // ทดสอบ: ช่วงก่อนหน้ายาวเท่ากันและติดกันพอดี ทั้งวันเดียว หลายวัน และข้ามเดือน
  // วิธี: เทียบผล previousRange ของ 20–26 ต.ค., วันเดียว และ 1–10 ต.ค. (ย้อนข้ามไปเดือน ก.ย.)
  it('previousRange ยาวเท่ากันและติดกันพอดี', () => {
    expect(previousRange({ from: '2026-10-20', to: '2026-10-26' })).toEqual({ from: '2026-10-13', to: '2026-10-19' })
    expect(previousRange({ from: '2026-10-20', to: '2026-10-20' })).toEqual({ from: '2026-10-19', to: '2026-10-19' })
    expect(previousRange({ from: '2026-10-01', to: '2026-10-10' })).toEqual({ from: '2026-09-21', to: '2026-09-30' })
  })
})

const income = (id: string, date: string, method: PaymentMethod, amount: number) => ({
  type: 'INCOME' as const,
  id,
  date,
  title: `ใบเสร็จ ${id}`,
  category: method,
  amount,
  paidFromDrawer: false,
  createdByName: null,
})

const report = (transactions: unknown[], overrides: Record<string, unknown> = {}) => ({
  range: { from: null, to: null },
  totalIncome: 650,
  totalExpense: 80,
  netProfit: 570,
  incomeByMethod: { CASH: 450, PROMPTPAY: 200 },
  expenseByCategory: {},
  transactions,
  ...overrides,
})

describe('getDashboardPeriod', () => {
  // ทดสอบ: ดึงตามช่วงที่ขอ รวมยอดรายวันตามวันเวลาไทย เติมวันที่ไม่มีบิลเป็น 0 นับบิลตามวิธีจ่าย และไม่นับรายจ่ายเป็นบิล
  // วิธี: mock รายรับ 3 บิล (บิลหนึ่ง 23:30Z = เช้าวันถัดไปเวลาไทย) + รายจ่าย 1 → เช็ก URL, trend 3 วัน, จำนวนบิล และ payments
  it('รวมยอดรายวันตามเวลาไทย เติมวันที่ไม่มีบิล และนับบิลตามวิธีจ่าย', async () => {
    const fetchMock = mockFetch(
      report([
        income('R3', '2026-10-21T23:30:00.000Z', PaymentMethod.CASH, 200), // = 22 ต.ค. 06:30 เวลาไทย
        { type: 'EXPENSE', id: 'E1', date: '2026-10-21T05:00:00.000Z', title: 'น้ำแข็ง', category: 'SUPPLIES', amount: 80, paidFromDrawer: true, createdByName: 'a' },
        income('R2', '2026-10-20T06:00:00.000Z', PaymentMethod.PROMPTPAY, 200),
        income('R1', '2026-10-20T05:00:00.000Z', PaymentMethod.CASH, 250),
      ]),
    )
    const data = await getDashboardPeriod({ from: '2026-10-20', to: '2026-10-22' })

    expect(calledUrl(fetchMock)).toContain('/reports/income-expense?from=2026-10-20&to=2026-10-22')
    expect(data).toMatchObject({
      days: 3,
      from: '2026-10-20',
      to: '2026-10-22',
      revenue: 650,
      expenseTotal: 80,
      netProfit: 570,
      cashTotal: 450,
      promptPayTotal: 200,
      cashCount: 2,
      promptPayCount: 1,
      paymentCount: 3,
    })
    expect(data.trend.map((p) => [p.date, p.revenue])).toEqual([
      ['2026-10-20', 450],
      ['2026-10-21', 0],
      ['2026-10-22', 200],
    ])
    expect(data.payments).toEqual([
      { id: 'R3', title: 'ใบเสร็จ R3', method: PaymentMethod.CASH, amount: 200, paidAt: '2026-10-21T23:30:00.000Z' },
      { id: 'R2', title: 'ใบเสร็จ R2', method: PaymentMethod.PROMPTPAY, amount: 200, paidAt: '2026-10-20T06:00:00.000Z' },
      { id: 'R1', title: 'ใบเสร็จ R1', method: PaymentMethod.CASH, amount: 250, paidAt: '2026-10-20T05:00:00.000Z' },
    ])
  })

  // ทดสอบ: ป้ายแกนกราฟ — ไม่เกิน 7 วันใช้ชื่อวันย่อ เกินนั้นใช้ "วัน/เดือน"
  // วิธี: ดึงช่วง 7 วันกับ 10 วัน (ไม่มีบิล) → เช็กป้ายของจุดแรก และว่าทุกจุดมีค่า 0
  it('ป้ายแกนกราฟ: ≤ 7 วัน = ชื่อวันย่อ / เกิน 7 วัน = วัน/เดือน', async () => {
    mockFetch(report([], { totalIncome: 0, incomeByMethod: { CASH: 0, PROMPTPAY: 0 } }))
    const week = await getDashboardPeriod({ from: '2026-10-19', to: '2026-10-25' })
    expect(week.trend).toHaveLength(7)
    expect(week.trend[0].label).toBe('จ.') // 19 ต.ค. 2026 เป็นวันจันทร์

    const tenDays = await getDashboardPeriod({ from: '2026-09-28', to: '2026-10-07' })
    expect(tenDays.trend).toHaveLength(10)
    expect(tenDays.trend.map((p) => p.label).slice(0, 4)).toEqual(['28/9', '29/9', '30/9', '1/10'])
    expect(tenDays.trend.every((p) => p.revenue === 0)).toBe(true)
  })
})

describe('getTopItems', () => {
  const item = (i: number) => ({
    menuItemId: `m${i}`,
    name: `เมนู ${i}`,
    categoryName: 'อาหารจานเดียว',
    isAvailable: true,
    quantity: 100 - i,
    revenue: (100 - i) * 50,
  })

  // ทดสอบ: ดึงเมนูขายดีตามช่วง เอาแค่ 5 อันดับแรก และไม่ส่งฟิลด์ที่หน้าไม่ใช้ (isAvailable)
  // วิธี: mock 7 เมนู → เช็ก URL, จำนวน 5, อันดับแรก และ totalQuantity
  it('ดึงตามช่วง เอา 5 อันดับแรก พร้อมจำนวนจานรวม', async () => {
    const fetchMock = mockFetch({
      range: { from: null, to: null },
      orderCount: 0,
      totalQuantity: 640,
      totalRevenue: 0,
      topItems: Array.from({ length: 7 }, (_, i) => item(i + 1)),
      unsoldItems: [],
      byHour: [],
      byWeekdayHour: [],
      kitchen: {},
    })
    const data = await getTopItems({ from: '2026-10-20', to: '2026-10-26' })
    expect(calledUrl(fetchMock)).toContain('/reports/sales?from=2026-10-20&to=2026-10-26')
    expect(data.items).toHaveLength(5)
    expect(data.items[0]).toEqual({ menuItemId: 'm1', name: 'เมนู 1', categoryName: 'อาหารจานเดียว', quantity: 99, revenue: 4950 })
    expect(data.items[4].menuItemId).toBe('m5')
    expect(data.totalQuantity).toBe(640)
  })
})
