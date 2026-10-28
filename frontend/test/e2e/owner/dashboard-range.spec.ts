import { test, expect, type Locator, type Page } from '@playwright/test'
import { call, customerOrder, menuItemByName, ok, openNewSession, serve, tokens } from '../api/api-helpers'
import { loginAsAdmin } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data (DB ทดสอบเท่านั้น — เก็บเงินจริง)
// Dashboard แบบเลือกช่วง: ปุ่ม 7 วัน / 30 วัน, เลือกวันที่เอง (ช่วงหลายวัน / วันเดียว), เทียบช่วงก่อนหน้า, เมนูขายดีของช่วง
// ทุกตัวเลขเทียบกับ response ที่หน้าเว็บโหลดเอง (/reports/income-expense?from&to และ /reports/sales?from&to)
// @totals-reports: รันหลังชุดหลัก — ระหว่างชุดหลักเทสต์อื่นรับเงินตลอด ตัวเลขช่วงเปลี่ยนระหว่างโหลดกับตอนเช็ก
test.use({ viewport: { width: 1280, height: 900 } })
test.describe.configure({ timeout: 60_000 })

// ต้องจัดรูปแบบเหมือน src/lib/format.ts
const baht = (n: number) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n)

/** เลื่อนวันที่ YYYY-MM-DD ไป offset วัน (ตามเวลาเครื่อง) — สูตรเดียวกับ features/reports/api.ts */
const shift = (base: Date, offset: number) => {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
/** วันที่ห่างจากวันนี้ offset วัน */
const ymd = (offset = 0) => shift(new Date(), offset)

interface IncomeExpense {
  totalIncome: number
  totalExpense: number
  netProfit: number
  incomeByMethod: { CASH: number; PROMPTPAY: number }
  transactions: { type: 'INCOME' | 'EXPENSE'; id: string; title: string; category: string; amount: number; date: string }[]
}
interface Sales {
  topItems: { name: string; quantity: number }[]
}

const periodUrl = (from: string, to: string) => (url: string) =>
  url.includes(`/reports/income-expense?from=${from}&to=${to}`)

/** รอ response ของช่วงนี้ + ช่วงก่อนหน้า (ยาวเท่ากัน ติดกันพอดี) + เมนูขายดี ระหว่างทำ action (คลิกปุ่ม / แก้วันที่ / เปิดหน้า) */
async function loadPeriod(page: Page, from: string, to: string, days: number, action: () => Promise<unknown>) {
  const start = new Date(`${from}T00:00:00`)
  const [current, previous, sales] = await Promise.all([
    page.waitForResponse((r) => periodUrl(from, to)(r.url()) && r.ok()),
    page.waitForResponse((r) => periodUrl(shift(start, -days), shift(start, -1))(r.url()) && r.ok()),
    page.waitForResponse((r) => r.url().includes(`/reports/sales?from=${from}&to=${to}`) && r.ok()),
    action(),
  ])
  return {
    current: (await current.json()) as IncomeExpense,
    previous: (await previous.json()) as IncomeExpense,
    sales: (await sales.json()) as Sales,
  }
}

const incomes = (r: IncomeExpense) => r.transactions.filter((t) => t.type === 'INCOME')

const statCardOf = (page: Page, label: string): Locator =>
  page.locator('div.rounded-xl.border-2').filter({ has: page.getByText(label, { exact: true }) })
const statValue = (page: Page, label: string) => statCardOf(page, label).locator('> p').first()
const statHint = (page: Page, label: string) => statCardOf(page, label).locator('> p').nth(1)
const sectionOf = (page: Page, heading: string) =>
  page.locator('section', { has: page.getByRole('heading', { name: heading, exact: true }) })
const statusRow = (page: Page, section: string, label: string) =>
  sectionOf(page, section).locator('dt', { hasText: label }).locator('+ dd')

/** การ์ด 4 ใบของช่วง + ข้อความเทียบช่วงก่อนหน้า ต้องตรงกับ response */
async function expectCards(page: Page, label: string, against: string, r: IncomeExpense, prev: IncomeExpense) {
  const bills = incomes(r)
  await expect(statValue(page, `รายรับ${label}`)).toHaveText(baht(r.totalIncome))
  await expect(statHint(page, `รายรับ${label}`)).toContainText(`${bills.length.toLocaleString('th-TH')} บิล`)
  // เทียบช่วงก่อนหน้า: เท่ากัน = "เท่ากับ…" / ต่างกัน = "▲/▼ … จาก…"
  const diff = r.totalIncome - prev.totalIncome
  await expect(statHint(page, `รายรับ${label}`)).toContainText(diff === 0 ? `เท่ากับ${against}` : `จาก${against}`)
  if (diff !== 0) await expect(statHint(page, `รายรับ${label}`)).toContainText(diff > 0 ? 'เพิ่มขึ้น' : 'ลดลง')

  await expect(statValue(page, 'เงินสด')).toHaveText(baht(r.incomeByMethod.CASH))
  await expect(statHint(page, 'เงินสด')).toHaveText(`${bills.filter((b) => b.category === 'CASH').length} บิล`)
  await expect(statValue(page, 'PromptPay')).toHaveText(baht(r.incomeByMethod.PROMPTPAY))
  await expect(statHint(page, 'PromptPay')).toHaveText(`${bills.filter((b) => b.category === 'PROMPTPAY').length} บิล`)
  const profit = r.netProfit < 0 ? `ขาดทุน${label}` : `กำไรสุทธิ${label}`
  await expect(statValue(page, profit)).toHaveText(baht(r.netProfit))
  await expect(statHint(page, profit)).toContainText(`รายจ่าย ${baht(r.totalExpense)}`)
}

async function expectTopItems(page: Page, sales: Sales) {
  const items = sectionOf(page, 'เมนูขายดี').getByRole('listitem')
  const top = sales.topItems.slice(0, 5)
  await expect(items).toHaveCount(top.length)
  for (const [i, item] of top.entries()) {
    await expect(items.nth(i)).toContainText(item.name)
    await expect(items.nth(i)).toContainText(`${item.quantity.toLocaleString('th-TH')} จาน`)
  }
}

// ทดสอบ: ปุ่ม 7 วัน / 30 วัน — หัวข้อ, URL, การ์ด 4 ใบ, เทียบช่วงก่อนหน้า, ภาพรวมช่วง (เฉลี่ยต่อวัน/จำนวนบิล), กราฟรายวัน และเมนูขายดีของช่วง ตรงกับข้อมูลที่หน้าเว็บโหลด แล้วกด "วันนี้" กลับมาหน้าเดิม
// วิธี: เก็บเงินสดโต๊ะใหม่ 1 บิลให้ช่วงมีบิลแน่ ๆ → admin เปิด Dashboard → กด "7 วัน" พร้อมดัก response ช่วงนี้/ช่วงก่อนหน้า/เมนูขายดี → เทียบทุกส่วน → กด "30 วัน" เทียบการ์ดและเมนูขายดีอีกรอบ → กด "วันนี้" เช็กว่ากลับไปหน้าสรุปวันนี้ และ URL ไม่มีช่วง (แท็ก @totals-reports)
test('Dashboard ช่วง 7 วัน / 30 วัน: การ์ด เทียบช่วงก่อนหน้า ภาพรวม และเมนูขายดี ตรงกับ API', { tag: '@totals-reports' }, async ({ page, request }) => {
  const t = await tokens(request)
  const { session } = await openNewSession(request, t)
  const water = await menuItemByName(request, 'น้ำเปล่า')
  const order = await customerOrder(request, session.token, [{ menuItemId: water.id, quantity: 1 }])
  await serve(request, t.KITCHEN, order.id)
  await ok(await call(request, 'POST', '/payments', { token: t.STAFF, data: { tableSessionId: session.id, method: 'CASH' } }))

  await loginAsAdmin(page, request)
  await page.goto('/owner/dashboard')
  await expect(page.getByRole('heading', { name: 'สรุปวันนี้' })).toBeVisible()

  await test.step('7 วัน', async () => {
    const button = page.getByRole('button', { name: '7 วัน', exact: true })
    const { current, previous, sales } = await loadPeriod(page, ymd(-6), ymd(), 7, () => button.click())
    await expect(page).toHaveURL(/[?&]range=7$/)
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('heading', { name: 'สรุป 7 วันล่าสุด' })).toBeVisible()
    await expect(page.getByText(/\(รวมวันนี้\)/)).toBeVisible()
    await expectCards(page, ' 7 วัน', ' 7 วันก่อนหน้า', current, previous)
    expect(incomes(current).length).toBeGreaterThan(0)

    await expect(page.getByRole('heading', { name: 'รายรับรายวัน' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'ภาพรวมช่วงนี้' })).toBeVisible()
    await expect(statusRow(page, 'ภาพรวมช่วงนี้', 'เฉลี่ยต่อวัน')).toHaveText(baht(Math.round(current.totalIncome / 7)))
    const bills = incomes(current)
    await expect(statusRow(page, 'ภาพรวมช่วงนี้', 'เฉลี่ยต่อบิล')).toHaveText(baht(Math.round(current.totalIncome / bills.length)))
    const daysWithIncome = new Set(bills.map((b) => shift(new Date(b.date), 0))).size
    await expect(statusRow(page, 'ภาพรวมช่วงนี้', 'วันที่ไม่มีรายรับ')).toHaveText(`${7 - daysWithIncome} จาก 7 วัน`)
    // หลายวันไม่มีรายการบิลรายใบ (มีเฉพาะตอนดูวันเดียว)
    await expect(page.getByRole('heading', { name: /^บิลที่รับเงินวัน/ })).toHaveCount(0)
    await expectTopItems(page, sales)
  })

  await test.step('30 วัน', async () => {
    const button = page.getByRole('button', { name: '30 วัน', exact: true })
    const { current, previous, sales } = await loadPeriod(page, ymd(-29), ymd(), 30, () => button.click())
    await expect(page).toHaveURL(/[?&]range=30$/)
    await expect(page.getByRole('heading', { name: 'สรุป 30 วันล่าสุด' })).toBeVisible()
    await expectCards(page, ' 30 วัน', ' 30 วันก่อนหน้า', current, previous)
    await expectTopItems(page, sales)
  })

  await test.step('กลับมา "วันนี้"', async () => {
    await page.getByRole('button', { name: 'วันนี้', exact: true }).click()
    await expect(page).toHaveURL(/\/owner\/dashboard$/)
    await expect(page.getByRole('heading', { name: 'สรุปวันนี้' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'รายรับรายชั่วโมงวันนี้' })).toBeVisible()
  })
})

// ทดสอบ: เลือกวันที่เอง — ช่วง 2 วัน แล้วแคบลงเหลือวันเดียว (เมื่อวาน): หัวข้อ การ์ด "…วันนั้น" เทียบ "วันก่อนหน้า" กราฟรายชั่วโมง รายการบิลของวันนั้น และ refresh แล้วยังอยู่ช่วงเดิม (เก็บใน URL)
// วิธี: admin เปิด Dashboard → แก้ช่อง "ตั้งแต่" เป็นเมื่อวาน (ถึงวันนี้ = 2 วัน) ดัก response แล้วเทียบการ์ด → แก้ช่อง "ถึง" เป็นเมื่อวาน (วันเดียว) ดัก response แล้วเทียบการ์ด/หัวข้อ/รายการบิล → reload เช็ก URL และช่องวันที่ยังเป็นเมื่อวาน (แท็ก @totals-reports)
test('Dashboard เลือกวันที่เอง: ช่วง 2 วัน → วันเดียว (เมื่อวาน) และ refresh แล้วยังอยู่ช่วงเดิม', { tag: '@totals-reports' }, async ({ page, request }) => {
  await loginAsAdmin(page, request)
  await page.goto('/owner/dashboard')
  const from = page.locator('#range-from')
  const to = page.locator('#range-to')
  await expect(from).toHaveValue(ymd())
  await expect(to).toHaveValue(ymd())

  await test.step('ตั้งแต่เมื่อวานถึงวันนี้ (2 วัน)', async () => {
    const { current, previous } = await loadPeriod(page, ymd(-1), ymd(), 2, () => from.fill(ymd(-1)))
    await expect(page).toHaveURL(new RegExp(`from=${ymd(-1)}&to=${ymd()}$`))
    await expect(page.getByText('2 วัน', { exact: true })).toBeVisible()
    await expectCards(page, ' 2 วัน', ' 2 วันก่อนหน้า', current, previous)
  })

  await test.step('เมื่อวานวันเดียว', async () => {
    const { current, previous, sales } = await loadPeriod(page, ymd(-1), ymd(-1), 1, () => to.fill(ymd(-1)))
    await expect(page).toHaveURL(new RegExp(`from=${ymd(-1)}$`))
    await expect(page.getByRole('heading', { name: /^สรุปวันที่ / })).toBeVisible()
    await expectCards(page, 'วันนั้น', 'วันก่อนหน้า', current, previous)
    await expect(page.getByRole('heading', { name: 'รายรับรายชั่วโมง' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'ภาพรวมวันนั้น' })).toBeVisible()
    await expect(statusRow(page, 'ภาพรวมวันนั้น', 'รายจ่าย')).toHaveText(baht(current.totalExpense))
    await expect(statusRow(page, 'ภาพรวมวันนั้น', 'จำนวนบิล')).toHaveText(`${incomes(current).length.toLocaleString('th-TH')} บิล`)

    const bills = sectionOf(page, 'บิลที่รับเงินวันนั้น')
    const list = incomes(current)
    if (list.length === 0) {
      await expect(bills.getByText('วันนั้นไม่มีบิลที่รับเงิน')).toBeVisible()
    } else {
      const items = bills.getByRole('listitem')
      await expect(items).toHaveCount(Math.min(list.length, 10))
      await expect(items.first()).toContainText(list[0].title)
      await expect(items.first()).toContainText(baht(list[0].amount))
    }
    await expectTopItems(page, sales)
  })

  await test.step('refresh แล้วยังเป็นเมื่อวาน', async () => {
    await page.reload()
    await expect(from).toHaveValue(ymd(-1))
    await expect(to).toHaveValue(ymd(-1))
    await expect(page.getByRole('heading', { name: /^สรุปวันที่ / })).toBeVisible()
  })
})

// ทดสอบ: ดูวันเดียวที่เป็นวันนี้ (ผ่านลิงก์ ?from=วันนี้) รายการบิลต้องเป็น "บิลที่รับเงินวันนี้" เรียงล่าสุดก่อน ตรงกับ response และเลือกวันในอนาคตไม่ได้ (ปัดกลับเป็นวันนี้)
// วิธี: เก็บเงินสดโต๊ะใหม่ 1 บิล → admin เปิด /owner/dashboard?from=วันนี้ ดัก response → เช็กหัวข้อรายการบิล บิลแรกตรงกับ transaction แรก และมีบิลที่เพิ่งเก็บ → เปิดลิงก์ที่ from เป็นพรุ่งนี้ เช็กว่าช่องวันที่ถูกปัดเป็นวันนี้ (แท็ก @totals-reports)
test('Dashboard วันเดียว = วันนี้: รายการ "บิลที่รับเงินวันนี้" ตรงกับ API และวันในอนาคตถูกปัดเป็นวันนี้', { tag: '@totals-reports' }, async ({ page, request }) => {
  const t = await tokens(request)
  const { session } = await openNewSession(request, t)
  const water = await menuItemByName(request, 'น้ำเปล่า')
  const order = await customerOrder(request, session.token, [{ menuItemId: water.id, quantity: 2 }])
  await serve(request, t.KITCHEN, order.id)
  const paid = await ok<{ id: string; amount: number }>(
    await call(request, 'POST', '/payments', { token: t.STAFF, data: { tableSessionId: session.id, method: 'CASH' } }),
  )

  await loginAsAdmin(page, request)
  const { current } = await loadPeriod(page, ymd(), ymd(), 1, () => page.goto(`/owner/dashboard?from=${ymd()}`))
  const list = incomes(current)
  expect(list.map((p) => p.id)).toContain(paid.id)

  const bills = sectionOf(page, 'บิลที่รับเงินวันนี้')
  const items = bills.getByRole('listitem')
  await expect(items).toHaveCount(Math.min(list.length, 10))
  for (const [i, p] of list.slice(0, 10).entries()) {
    await expect(items.nth(i)).toContainText(p.title)
    await expect(items.nth(i)).toContainText(baht(p.amount))
    await expect(items.nth(i)).not.toContainText('โต๊ะ กลับบ้าน')
  }
  if (list.length > 10) await expect(bills.getByText(`1–10 จาก ${list.length} บิล`)).toBeVisible()

  await page.goto(`/owner/dashboard?from=${ymd(1)}`)
  await expect(page.locator('#range-from')).toHaveValue(ymd())
  await expect(page.locator('#range-to')).toHaveValue(ymd())
})
