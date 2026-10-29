import { test, expect, type Locator, type Page } from '@playwright/test'
import { call, customerOrder, menuItemByName, ok, openNewSession, serve, tokens } from '../api/api-helpers'
import { loginAsAdmin } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data (DB ทดสอบเท่านั้น — เก็บเงินจริง)
// ทุกตัวเลขบนหน้า Dashboard (แท็บ "วันนี้") ต้องตรงกับ response ที่หน้าเว็บได้จาก /reports/dashboard, /payments และ /reports/sales
// เทียบกับ response ที่ "หน้าเว็บโหลดเอง" (ไม่ยิง API แยก) — เทสอื่นเก็บเงินพร้อมกันได้ ตัวเลขก็ยังเทียบกันตรง
test.use({ viewport: { width: 1280, height: 900 } })

const DAY_MS = 24 * 60 * 60 * 1000

// ต้องจัดรูปแบบเหมือน src/lib/format.ts
const baht = (n: number) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n)

interface DashboardReport {
  date: string
  revenue: number
  expenses: number
  netProfit: number
  orderCount: number
  paymentCount: number
  revenueByMethod: { CASH: number; PROMPTPAY: number }
  tables: { OCCUPIED: number; total: number }
  revenueTrend: { date: string; revenue: number }[]
  slipIssues?: { pending: number; failed: number }
}

interface ApiPayment {
  id: string
  amount: number
  method: 'CASH' | 'PROMPTPAY'
  status: 'COMPLETED' | 'VOIDED'
  paidAt: string
  tableSession?: { table?: { number: number }; isTakeaway?: boolean; takeawayNo?: number | null }
}

/** ชื่อที่ต้องขึ้นบนรายการบิล — โต๊ะจริง "โต๊ะ 5" / กลับบ้าน "กลับบ้าน #3" (ไม่มีคำว่า "โต๊ะ" นำหน้า) */
const placeOf = (p: ApiPayment) =>
  p.tableSession?.isTakeaway
    ? `กลับบ้าน #${p.tableSession.takeawayNo ?? '-'}`
    : `โต๊ะ ${p.tableSession?.table?.number ?? '-'}`

interface SalesReport {
  topItems: { name: string; quantity: number }[]
}

/** เปิด Dashboard แล้วเก็บ response ที่หน้าเว็บใช้แสดงผล */
async function openDashboard(page: Page) {
  const reportRes = page.waitForResponse((r) => r.url().includes('/reports/dashboard') && r.ok())
  const paymentsRes = page.waitForResponse((r) => /\/payments\?from=/.test(r.url()) && r.ok())
  const salesRes = page.waitForResponse((r) => /\/reports\/sales\?from=/.test(r.url()) && r.ok())
  await page.goto('/owner/dashboard')
  const report = (await (await reportRes).json()) as DashboardReport
  const payments = (await (await paymentsRes).json()) as ApiPayment[]
  const sales = (await (await salesRes).json()) as SalesReport
  await expect(page.getByRole('heading', { name: 'ในร้านตอนนี้' })).toBeVisible()

  const dayStart = Date.parse(report.date)
  const today = payments.filter((p) => {
    const t = Date.parse(p.paidAt)
    return p.status === 'COMPLETED' && t >= dayStart && t < dayStart + DAY_MS
  })
  return { report, today, sales }
}

/** StatCard (ขอบ 2px) — ป้ายอยู่ใน div ด้านใน ส่วน <p> ลูกตรงคือ ตัวเลข แล้วตามด้วยบรรทัดย่อย */
const statCardOf = (page: Page, label: string): Locator =>
  page.locator('div.rounded-xl.border-2').filter({ has: page.getByText(label, { exact: true }) })
const statCard = (page: Page, label: string): Locator => statCardOf(page, label).locator('> p').first()
const statHint = (page: Page, label: string): Locator => statCardOf(page, label).locator('> p').nth(1)

const sectionOf = (page: Page, heading: string) =>
  page.locator('section', { has: page.getByRole('heading', { name: heading, exact: true }) })

const statusRow = (page: Page, label: string): Locator =>
  sectionOf(page, 'ในร้านตอนนี้').locator('dt', { hasText: label }).locator('+ dd')

const notifications = (page: Page) => sectionOf(page, 'บิลที่รับเงินวันนี้')

// ทดสอบ: ตัวเลขทุกส่วนบน Dashboard วันนี้ (การ์ด 4 ใบ, ในร้านตอนนี้, กราฟรายชั่วโมง, บิลที่รับเงินวันนี้, เมนูขายดี, แบนเนอร์สลิป) ต้องตรงกับข้อมูลที่หน้าเว็บโหลดมาจาก API
// วิธี: เก็บเงินสดโต๊ะใหม่ 1 บิลผ่าน API → admin เปิด Dashboard พร้อมดักเก็บ response /reports/dashboard, /payments และ /reports/sales ที่หน้าเว็บโหลดเอง → เทียบตัวเลขทีละส่วนกับ response นั้น → เช็กว่ามีบิลที่เพิ่งเก็บ และแบนเนอร์สลิปขึ้นหรือไม่ขึ้นตามจำนวนสลิปค้าง (แท็ก @totals-reports)
test('Dashboard: การ์ด, ในร้านตอนนี้, กราฟ, บิลวันนี้, เมนูขายดี และแบนเนอร์สลิป ตรงกับข้อมูลจาก API', { tag: '@totals-reports' }, async ({ page, request }) => {
  // มีบิลเงินสดของวันนี้อย่างน้อย 1 ใบ จากโต๊ะที่รู้เลข — เช็คได้ว่าโผล่ในการแจ้งเตือน
  const t = await tokens(request)
  const { table, session } = await openNewSession(request, t)
  const water = await menuItemByName(request, 'น้ำเปล่า')
  const order = await customerOrder(request, session.token, [{ menuItemId: water.id, quantity: 3 }])
  await serve(request, t.KITCHEN, order.id)
  const paid = await ok<{ id: string; amount: number }>(
    await call(request, 'POST', '/payments', { token: t.STAFF, data: { tableSessionId: session.id, method: 'CASH' } }),
  )

  await loginAsAdmin(page, request)
  const { report, today, sales } = await openDashboard(page)
  const count = (m: ApiPayment['method']) => today.filter((p) => p.method === m).length

  await test.step('การ์ด 4 ใบ', async () => {
    await expect(statCard(page, 'รายรับวันนี้')).toHaveText(baht(report.revenue))
    // trend จบที่วันนี้ — จุดก่อนสุดท้ายคือเมื่อวาน
    const yesterday = report.revenueTrend.at(-2)
    await expect(statHint(page, 'รายรับวันนี้')).toHaveText(
      `${report.paymentCount.toLocaleString('th-TH')} บิล${yesterday ? ` · เมื่อวาน ${baht(yesterday.revenue)}` : ''}`,
    )
    await expect(statCard(page, 'เงินสด')).toHaveText(baht(report.revenueByMethod.CASH))
    await expect(statHint(page, 'เงินสด')).toHaveText(`${count('CASH')} บิล`)
    await expect(statCard(page, 'PromptPay')).toHaveText(baht(report.revenueByMethod.PROMPTPAY))
    await expect(statHint(page, 'PromptPay')).toHaveText(`${count('PROMPTPAY')} บิล`)
    const profitLabel = report.netProfit < 0 ? 'ขาดทุนวันนี้' : 'กำไรสุทธิวันนี้'
    await expect(statCard(page, profitLabel)).toHaveText(baht(report.netProfit))
    await expect(statHint(page, profitLabel)).toHaveText(`รายจ่าย ${baht(report.expenses)}`)
  })

  await test.step('ในร้านตอนนี้', async () => {
    await expect(statusRow(page, 'โต๊ะที่ใช้งานอยู่')).toHaveText(`${report.tables.OCCUPIED} จาก ${report.tables.total} โต๊ะ`)
    await expect(statusRow(page, 'ออเดอร์ที่สั่งวันนี้')).toHaveText(`${report.orderCount.toLocaleString('th-TH')} ออเดอร์`)
    await expect(statusRow(page, 'รายจ่ายวันนี้')).toHaveText(baht(report.expenses))
  })

  await test.step('กราฟรายชั่วโมงวันนี้', async () => {
    await expect(page.getByRole('heading', { name: 'รายรับรายชั่วโมงวันนี้' })).toBeVisible()
  })

  await test.step('บิลที่รับเงินวันนี้: หน้าแรกเรียงตามบิลล่าสุด และมีบิลที่เพิ่งเก็บ', async () => {
    const section = notifications(page)
    const items = section.getByRole('listitem')
    const firstPage = today.slice(0, 10)
    await expect(items).toHaveCount(firstPage.length)
    for (const [i, p] of firstPage.entries()) {
      const method = p.method === 'CASH' ? 'เงินสด' : 'PromptPay'
      await expect(items.nth(i)).toContainText(placeOf(p))
      await expect(items.nth(i)).not.toContainText('โต๊ะ กลับบ้าน')
      await expect(items.nth(i)).toContainText(`${method} ·`)
      await expect(items.nth(i)).toContainText(baht(p.amount))
    }
    expect(today.map((p) => p.id)).toContain(paid.id)
    if (today.findIndex((p) => p.id === paid.id) < 10) {
      // เพิ่งเก็บ — ต้องขึ้น "เมื่อสักครู่" หรือ "N นาทีที่แล้ว"
      const mine = items.filter({ hasText: `โต๊ะ ${table.number}` })
      await expect(mine).toContainText(baht(paid.amount))
      await expect(mine).toContainText(/เมื่อสักครู่|นาทีที่แล้ว/)
    }
    if (today.length > 10) {
      await expect(section.getByText(`1–10 จาก ${today.length} บิล`)).toBeVisible()
    }
  })

  await test.step('เมนูขายดีวันนี้ (5 อันดับ)', async () => {
    const items = sectionOf(page, 'เมนูขายดี').getByRole('listitem')
    const top = sales.topItems.slice(0, 5)
    await expect(items).toHaveCount(top.length)
    for (const [i, item] of top.entries()) {
      await expect(items.nth(i)).toContainText(item.name)
      await expect(items.nth(i)).toContainText(`${item.quantity.toLocaleString('th-TH')} จาน`)
    }
  })

  await test.step('แบนเนอร์สลิป PromptPay ที่ยังยืนยันเงินเข้าไม่ได้', async () => {
    const issues = report.slipIssues ?? { pending: 0, failed: 0 }
    const banner = page.getByRole('link', { name: /สลิป PromptPay ที่ยังยืนยันเงินเข้าไม่ได้/ })
    if (issues.pending + issues.failed > 0) {
      await expect(banner).toContainText(`รอตรวจ ${issues.pending} · ไม่ผ่าน ${issues.failed}`)
      await banner.click()
      await expect(page).toHaveURL(/\/employee\/check$/)
    } else {
      await expect(banner).toHaveCount(0)
    }
  })
})

// ทดสอบ: รายการบิลที่รับเงินวันนี้บน Dashboard แบ่งหน้าละ 10 บิล กดหน้า 2 แล้วต้องเห็นบิลที่เหลือถูกต้อง
// วิธี: admin เปิด Dashboard พร้อมดักเก็บ /payments (ถ้าวันนี้มีบิลไม่เกิน 10 ใบจะข้าม) → กดหน้า 2 → เทียบจำนวนรายการ ยอดใบแรก และข้อความ "11–n จาก m บิล" (แท็ก @totals-reports)
test('Dashboard: บิลเกิน 10 ใบแบ่งหน้า กดหน้าถัดไปแล้วเห็นบิลที่เหลือ', { tag: '@totals-reports' }, async ({ page, request }) => {
  await loginAsAdmin(page, request)
  const { today } = await openDashboard(page)
  test.skip(today.length <= 10, `วันนี้มีบิล ${today.length} ใบ ยังไม่ถึง 10 — ไม่มีหน้าที่ 2 ให้เทส`)

  const section = notifications(page)
  await section.getByRole('button', { name: '2', exact: true }).click()
  const secondPage = today.slice(10, 20)
  await expect(section.getByRole('listitem')).toHaveCount(secondPage.length)
  await expect(section.getByRole('listitem').first()).toContainText(baht(secondPage[0].amount))
  await expect(section.getByText(`11–${10 + secondPage.length} จาก ${today.length} บิล`)).toBeVisible()
})
