import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PaymentMethod, PaymentStatus } from '@/types/enums'
import { getDashboard } from '@/features/reports/api'

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })

// วันของรายงานเริ่ม 00:00 เวลาไทย = 17:00Z ของวันก่อน
const DAY_START = '2026-10-23T17:00:00.000Z'
const at = (hoursAfterStart: number) =>
  new Date(Date.parse(DAY_START) + hoursAfterStart * 3_600_000).toISOString()

const report = {
  date: DAY_START,
  revenue: 530,
  expenses: 120.5,
  netProfit: 409.5,
  orderCount: 9,
  paymentCount: 4,
  revenueByMethod: { CASH: 330, PROMPTPAY: 200 },
  tables: { AVAILABLE: 4, OCCUPIED: 3, RESERVED: 0, total: 7 },
  revenueTrend: [
    { date: '2026-10-18', revenue: 0 },
    { date: '2026-10-19', revenue: 150 },
    { date: '2026-10-20', revenue: 320 },
    { date: '2026-10-21', revenue: 0 },
    { date: '2026-10-22', revenue: 90 },
    { date: '2026-10-23', revenue: 410 },
    { date: '2026-10-24', revenue: 530 },
  ],
  slipIssues: { pending: 2, failed: 1 },
}

const payment = (id: string, method: PaymentMethod, amount: number, paidAt: string, status: PaymentStatus = PaymentStatus.COMPLETED) => ({
  id,
  amount,
  method,
  status,
  paidAt,
  voidedAt: null,
  voidReason: null,
  note: null,
  tableSessionId: `s-${id}`,
  tableSession: { table: { number: Number(id.replace(/\D/g, '')) || 1 } },
})

/** ตอบ /reports/dashboard กับ /payments ตาม URL — เก็บ URL ที่ถูกเรียกไว้ตรวจ query */
function mockApi(dashboard: unknown, payments: unknown[]) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/reports/dashboard')) return Promise.resolve(json(dashboard))
    if (url.includes('/payments')) return Promise.resolve(json(payments))
    return Promise.reject(new Error(`ไม่ได้ mock ${url}`))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('getDashboard', () => {
  beforeEach(() => localStorage.setItem('restaurant.token', 't'))
  afterEach(() => vi.unstubAllGlobals())

  // ทดสอบ: ยอดสรุปบน Dashboard (รายรับ, เงินสด, PromptPay, ออเดอร์, รายจ่าย) มาจาก /reports/dashboard ตรง ๆ
  // วิธี: mock fetch ตามแต่ละ URL → เรียก getDashboard → เทียบ summary ทั้งก้อน
  it('ยอดสรุปมาจาก /reports/dashboard ตรง ๆ (รายรับ, เงินสด, PromptPay, ออเดอร์, รายจ่าย)', async () => {
    mockApi(report, [])
    const { summary } = await getDashboard()
    expect(summary).toEqual({
      date: DAY_START,
      revenue: 530,
      expenseTotal: 120.5,
      netProfit: 409.5,
      cashTotal: 330,
      promptPayTotal: 200,
      orderCount: 9,
      paymentCount: 4,
    })
  })

  // ทดสอบ: ดึงบิลเฉพาะช่วง 24 ชั่วโมงของวันรายงาน โดยยึดวันจาก server ไม่ใช่เวลาเครื่อง
  // วิธี: mock fetch → เรียก getDashboard → อ่าน URL /payments ที่ถูกเรียก → เช็ก from = วันเริ่ม และ to = วันเริ่ม + 24 ชม.
  it('ดึง /payments เฉพาะช่วง 24 ชม. ของวันรายงาน (ใช้ report.date ไม่ใช่เวลาเครื่อง)', async () => {
    const fetchMock = mockApi(report, [])
    await getDashboard()
    const paymentsUrl = new URL(String(fetchMock.mock.calls.find(([u]) => String(u).includes('/payments'))?.[0]))
    expect(paymentsUrl.searchParams.get('from')).toBe(DAY_START)
    expect(paymentsUrl.searchParams.get('to')).toBe(at(24))
  })

  // ทดสอบ: นับจำนวนบิลต่อวิธีจ่ายเฉพาะบิลที่จ่ายแล้วของวันนั้น โดยไม่นับบิลที่ยกเลิก บิลเมื่อวาน หรือบิลพรุ่งนี้
  // วิธี: mock 6 บิล (ปกติ 3, ยกเลิก 1, ก่อนวัน 1, หลังวัน 1) → เช็กจำนวนเงินสด 2 PromptPay 1 และการแจ้งเตือนมีแค่ p1–p3
  it('นับบิลต่อวิธีจ่ายเฉพาะ COMPLETED ของวันนั้น — บิลที่ยกเลิก / เมื่อวาน / พรุ่งนี้ ไม่นับ', async () => {
    mockApi(report, [
      payment('p1', PaymentMethod.CASH, 100, at(1)),
      payment('p2', PaymentMethod.CASH, 230, at(5)),
      payment('p3', PaymentMethod.PROMPTPAY, 200, at(23.9)),
      payment('p4', PaymentMethod.CASH, 80, at(2), PaymentStatus.VOIDED),
      payment('p5', PaymentMethod.PROMPTPAY, 50, at(-0.1)),
      payment('p6', PaymentMethod.CASH, 70, at(24)),
    ])
    const { todayStatus, notifications } = await getDashboard()
    expect(todayStatus.cashCount).toBe(2)
    expect(todayStatus.promptPayCount).toBe(1)
    expect(notifications.map((n) => n.id)).toEqual(['p1', 'p2', 'p3'])
  })

  // ทดสอบ: การแจ้งเตือนต้องส่งครบทุกบิลของวัน (ไม่ตัดเหลือ 10) เรียงตามที่ API ส่งมา และมีโต๊ะ วิธีจ่าย ยอด เวลา
  // วิธี: mock 12 บิล → เช็กว่าได้ 12 รายการ ลำดับเดียวกับ API และรายการที่ 2 มีข้อมูลครบ
  it('การแจ้งเตือนส่งครบทุกบิลของวัน (ไม่ตัด 10 ใบ) เรียงตามที่ API ส่งมา และมีโต๊ะ/วิธีจ่าย/ยอด/เวลา', async () => {
    const payments = Array.from({ length: 12 }, (_, i) =>
      payment(`p${12 - i}`, i % 2 ? PaymentMethod.PROMPTPAY : PaymentMethod.CASH, 10 * (i + 1), at(12 - i * 0.5)),
    )
    mockApi(report, payments)
    const { notifications } = await getDashboard()
    expect(notifications).toHaveLength(12)
    expect(notifications.map((n) => n.id)).toEqual(payments.map((p) => p.id))
    expect(notifications[1]).toEqual({
      id: 'p11',
      tableName: '11',
      method: PaymentMethod.PROMPTPAY,
      amount: 20,
      createdAt: at(11.5),
    })
  })

  // ทดสอบ: สถานะวันนี้: โต๊ะที่ใช้งานมาจากจำนวน OCCUPIED/ทั้งหมด และสลิปค้างมาจากรายงาน
  // วิธี: mock รายงานโต๊ะ 3/7 สลิปค้าง 2/1 → เช็ก todayStatus และ slipIssues
  it('สถานะวันนี้: โต๊ะที่ใช้งาน = OCCUPIED/total, สลิปค้าง', async () => {
    mockApi(report, [])
    const data = await getDashboard()
    expect(data.todayStatus).toMatchObject({ tablesInUse: 3, tablesTotal: 7 })
    expect(data.slipIssues).toEqual({ pending: 2, failed: 1 })
  })

  // ทดสอบ: backend รุ่นเก่าที่ไม่ส่ง slipIssues มา ต้องได้ 0 ไม่ใช่ undefined
  // วิธี: ตัด slipIssues ออกจากรายงานที่ mock → เช็กว่าได้ { pending: 0, failed: 0 }
  it('backend เก่าที่ไม่ส่ง slipIssues → เป็น 0 ไม่ใช่ undefined', async () => {
    const { slipIssues: _s, ...older } = report
    mockApi(older, [])
    const data = await getDashboard()
    expect(data.slipIssues).toEqual({ pending: 0, failed: 0 })
  })

  // ทดสอบ: กราฟ 7 วันมีป้ายวันย่อภาษาไทย ไม่เลื่อนวันเพราะ UTC และคงยอดเดิม
  // วิธี: mock revenueTrend 7 วัน → เช็กป้าย อา.–ส. ตามลำดับ และวันที่/ยอดตรงกับต้นฉบับ
  it('กราฟ 7 วัน: ป้ายวันแบบย่อภาษาไทย ไม่เลื่อนวันเพราะ UTC และคงยอดเดิม', async () => {
    mockApi(report, [])
    const { trend } = await getDashboard()
    expect(trend.map((p) => p.label)).toEqual(['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'])
    expect(trend.map((p) => [p.date, p.revenue])).toEqual(report.revenueTrend.map((p) => [p.date, p.revenue]))
  })
})
