import { test, expect, type Locator, type Page } from '@playwright/test'
import { call, customerOrder, menuItemByName, ok, openNewSession, serve, tokens } from '../api/api-helpers'
import { loginAsAdmin } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data (DB ทดสอบเท่านั้น — เก็บเงินจริง)
// ทุกตัวเลขบนหน้า Dashboard ต้องตรงกับ response ที่หน้าเว็บได้จาก /reports/dashboard และ /payments
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
  orderCount: number
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
  tableSession?: { table?: { number: number } }
}

/** เปิด Dashboard แล้วเก็บ response ที่หน้าเว็บใช้แสดงผล */
async function openDashboard(page: Page) {
  const reportRes = page.waitForResponse((r) => r.url().includes('/reports/dashboard') && r.ok())
  const paymentsRes = page.waitForResponse((r) => /\/payments\?from=/.test(r.url()) && r.ok())
  await page.goto('/owner/dashboard')
  const report = (await (await reportRes).json()) as DashboardReport
  const payments = (await (await paymentsRes).json()) as ApiPayment[]
  await expect(page.getByRole('heading', { name: 'สถานะวันนี้' })).toBeVisible()

  const dayStart = Date.parse(report.date)
  const today = payments.filter((p) => {
    const t = Date.parse(p.paidAt)
    return p.status === 'COMPLETED' && t >= dayStart && t < dayStart + DAY_MS
  })
  return { report, today }
}

/** ตัวเลขบน StatCard (ขอบ 2px) — p ตัวที่ 2 ต่อจากป้าย */
const statCard = (page: Page, label: string): Locator =>
  page.locator('div.rounded-xl.border-2').filter({ has: page.getByText(label, { exact: true }) }).locator('> p')

const statusRow = (page: Page, label: string): Locator =>
  page.locator('section', { has: page.getByRole('heading', { name: 'สถานะวันนี้' }) }).locator('dt', { hasText: label }).locator('+ dd')

const notifications = (page: Page) =>
  page.locator('section', { has: page.getByRole('heading', { name: 'การแจ้งเตือน' }) })

// ทดสอบ: ตัวเลขทุกส่วนบน Dashboard (การ์ด 4 ใบ, สถานะวันนี้, กราฟ 7 วัน, การแจ้งเตือน, แบนเนอร์สลิป) ต้องตรงกับข้อมูลที่หน้าเว็บโหลดมาจาก API
// วิธี: เก็บเงินสดโต๊ะใหม่ 1 บิลผ่าน API → admin เปิด Dashboard พร้อมดักเก็บ response /reports/dashboard และ /payments ที่หน้าเว็บโหลดเอง → เทียบตัวเลขทีละส่วนกับ response นั้น → เช็กว่ามีบิลที่เพิ่งเก็บ และแบนเนอร์สลิปขึ้นหรือไม่ขึ้นตามจำนวนสลิปค้าง (แท็ก @totals-dashboard)
test('Dashboard: การ์ด, สถานะวันนี้, กราฟ, การแจ้งเตือน และแบนเนอร์สลิป ตรงกับข้อมูลจาก API', { tag: '@totals-dashboard' }, async ({ page, request }) => {
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
  const { report, today } = await openDashboard(page)

  await test.step('การ์ด 4 ใบ', async () => {
    await expect(statCard(page, 'รายรับวันนี้')).toHaveText(baht(report.revenue))
    await expect(statCard(page, 'จ่ายเงินสด')).toHaveText(baht(report.revenueByMethod.CASH))
    await expect(statCard(page, 'จ่าย PromptPay')).toHaveText(baht(report.revenueByMethod.PROMPTPAY))
    await expect(statCard(page, 'จำนวนออเดอร์')).toHaveText(report.orderCount.toLocaleString('th-TH'))
  })

  await test.step('สถานะวันนี้', async () => {
    const count = (m: ApiPayment['method']) => today.filter((p) => p.method === m).length
    await expect(statusRow(page, 'จ่ายเงินสด')).toHaveText(`${count('CASH')} บิล`)
    await expect(statusRow(page, 'จ่าย PromptPay')).toHaveText(`${count('PROMPTPAY')} บิล`)
    await expect(statusRow(page, 'โต๊ะที่ใช้งานอยู่')).toHaveText(`${report.tables.OCCUPIED}/${report.tables.total}`)
    await expect(statusRow(page, 'รายจ่ายวันนี้')).toHaveText(baht(report.expenses))
  })

  await test.step('กราฟ 7 วัน', async () => {
    expect(report.revenueTrend).toHaveLength(7)
    await expect(page.getByRole('img', { name: /แนวโน้มรายรับ 7 วัน/ })).toBeVisible()
  })

  await test.step('การแจ้งเตือน: หน้าแรกเรียงตามบิลล่าสุด และมีบิลที่เพิ่งเก็บ', async () => {
    const section = notifications(page)
    const items = section.getByRole('listitem')
    const firstPage = today.slice(0, 10)
    await expect(items).toHaveCount(firstPage.length)
    for (const [i, p] of firstPage.entries()) {
      const method = p.method === 'CASH' ? 'จ่ายเงินสด' : 'จ่าย PromptPay'
      await expect(items.nth(i)).toContainText(`โต๊ะ ${p.tableSession?.table?.number ?? '-'} ${method}`)
      await expect(items.nth(i)).toContainText(baht(p.amount))
      await expect(items.nth(i)).toContainText('นาทีที่แล้ว')
    }
    expect(today.map((p) => p.id)).toContain(paid.id)
    if (today.findIndex((p) => p.id === paid.id) < 10) {
      await expect(items.filter({ hasText: `โต๊ะ ${table.number} จ่ายเงินสด` })).toContainText(baht(paid.amount))
    }
    if (today.length > 10) {
      await expect(section.getByText(`1–10 จาก ${today.length} บิล`)).toBeVisible()
    }
  })

  await test.step('แบนเนอร์สลิป PromptPay ที่ต้องตาม', async () => {
    const issues = report.slipIssues ?? { pending: 0, failed: 0 }
    const banner = page.getByRole('link', { name: /สลิป PromptPay ที่ต้องตาม/ })
    if (issues.pending + issues.failed > 0) {
      await expect(banner).toContainText(`รอตรวจ ${issues.pending} · ไม่ผ่าน ${issues.failed}`)
      await banner.click()
      await expect(page).toHaveURL(/\/employee\/check$/)
    } else {
      await expect(banner).toHaveCount(0)
    }
  })
})

// ทดสอบ: การแจ้งเตือนบน Dashboard แบ่งหน้าละ 10 บิล กดหน้า 2 แล้วต้องเห็นบิลที่เหลือถูกต้อง
// วิธี: admin เปิด Dashboard พร้อมดักเก็บ /payments (ถ้าวันนี้มีบิลไม่เกิน 10 ใบจะข้าม) → กดหน้า 2 → เทียบจำนวนรายการ ยอดใบแรก และข้อความ "11–n จาก m บิล" (แท็ก @totals-dashboard)
test('Dashboard: บิลเกิน 10 ใบแบ่งหน้า กดหน้าถัดไปแล้วเห็นบิลที่เหลือ', { tag: '@totals-dashboard' }, async ({ page, request }) => {
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
