import { test, expect, type Locator, type Page } from '@playwright/test'
import { call, customerOrder, menuItemByName, ok, openNewSession, serve, tokens } from '../api/api-helpers'
import { loginAsAdmin } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data (DB ทดสอบเท่านั้น — เก็บเงินจริง)
// หน้า "เมนูขายดี" (/owner/sales): การ์ดสรุปเดือน, heatmap วัน × ชั่วโมง (ตัดตามเวลาเปิดร้าน), ความเร็วครัว
// ตัวเลขเทียบกับ response /reports/sales?month= ที่หน้าเว็บโหลดเอง
// @totals-reports: รันหลังชุดหลัก — ระหว่างชุดหลักมีออเดอร์จ่ายเงินเข้ามาตลอด
test.use({ viewport: { width: 1280, height: 900 } })

interface SalesReport {
  orderCount: number
  totalQuantity: number
  totalRevenue: number
  byWeekdayHour: number[][]
  kitchen: {
    timedOrderCount: number
    avgWaitMinutes: number | null
    avgCookMinutes: number | null
    avgTotalMinutes: number | null
    lateOrderCount: number
    lateMinutes: number
  }
}

const baht = (n: number) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n)
// ต้องตรงกับ minutesLabel ใน SalesPage.tsx
const minutes = (v: number | null) => (v === null ? '-' : `${v.toLocaleString('th-TH', { maximumFractionDigits: 1 })} นาที`)

const statCardOf = (page: Page, label: string): Locator =>
  page.locator('div.rounded-xl.border-2').filter({ has: page.getByText(label, { exact: true }) })
const statValue = (page: Page, label: string) => statCardOf(page, label).locator('> p').first()
const statHint = (page: Page, label: string) => statCardOf(page, label).locator('> p').nth(1)
const sectionOf = (page: Page, heading: string) =>
  page.locator('section', { has: page.getByRole('heading', { name: heading, exact: true }) })

// ทดสอบ: หน้าเมนูขายดีของเดือนนี้ — การ์ด (ขายได้/ยอดตามราคาเมนู), heatmap (คอลัมน์ชั่วโมงตามเวลาเปิดร้านหรือชั่วโมงที่มีออเดอร์, ยอดรวมท้ายตาราง, หมายเหตุออเดอร์นอกเวลา) และความเร็วครัว (รอคิว/ปรุง/รวมเฉลี่ย, เกินเวลา) ตรงกับ API
// วิธี: เปิดโต๊ะสั่งน้ำ → ครัวเริ่มปรุงและเสิร์ฟผ่าน API (ให้มีออเดอร์ที่จับเวลาได้) → เก็บเงินสด → admin เปิด /owner/sales พร้อมดัก response → เทียบการ์ด → อ่านหัวคอลัมน์ heatmap เทียบกับชั่วโมงที่มีออเดอร์ และยอดรวมท้ายตาราง/หมายเหตุนอกเวลา → เทียบการ์ดความเร็วครัว (แท็ก @totals-reports)
test('หน้าเมนูขายดี: การ์ดเดือนนี้, heatmap วัน×ชั่วโมง และความเร็วครัว ตรงกับ API', { tag: '@totals-reports' }, async ({ page, request }) => {
  const t = await tokens(request)
  const { session } = await openNewSession(request, t)
  const water = await menuItemByName(request, 'น้ำเปล่า')
  const order = await customerOrder(request, session.token, [{ menuItemId: water.id, quantity: 2 }])
  await serve(request, t.KITCHEN, order.id)
  await ok(await call(request, 'POST', '/payments', { token: t.STAFF, data: { tableSessionId: session.id, method: 'CASH' } }))

  await loginAsAdmin(page, request)
  const salesRes = page.waitForResponse((r) => r.url().includes('/reports/sales?month=') && r.ok())
  await page.goto('/owner/sales')
  const report = (await (await salesRes).json()) as SalesReport
  await expect(page.getByRole('heading', { name: 'เมนูขายดี', level: 1 })).toBeVisible()
  expect(report.orderCount).toBeGreaterThan(0)

  await test.step('การ์ดสรุปเดือน', async () => {
    await expect(statValue(page, 'ขายได้')).toHaveText(`${report.totalQuantity.toLocaleString('th-TH')} จาน`)
    await expect(statHint(page, 'ขายได้')).toHaveText(`จาก ${report.orderCount.toLocaleString('th-TH')} ออเดอร์`)
    await expect(statValue(page, 'ยอดตามราคาเมนู')).toHaveText(baht(report.totalRevenue))
  })

  await test.step('heatmap วัน × ชั่วโมง', async () => {
    const heatmap = sectionOf(page, 'วันไหน ชั่วโมงไหนยุ่ง')
    const table = heatmap.getByRole('table')
    await expect(table).toBeVisible()
    const hourTotals = Array.from({ length: 24 }, (_, h) => report.byWeekdayHour.reduce((n, day) => n + (day[h] ?? 0), 0))
    const all = hourTotals.reduce((a, b) => a + b, 0)
    // หัวคอลัมน์: ช่องแรกว่าง (ชื่อวัน) ช่องท้าย "รวม" ระหว่างกลางคือ "HH:00"
    const headers = (await table.locator('thead th').allInnerTexts()).map((s) => s.trim())
    expect(headers.at(-1)).toBe('รวม')
    const shown = headers.slice(1, -1).map((h) => Number(h.slice(0, 2)))
    expect(shown.length).toBeGreaterThan(0)
    const shownTotal = shown.reduce((n, h) => n + hourTotals[h], 0)
    const outside = all - shownTotal
    // แถวท้ายตาราง: ยอดรวมทั้งหมดนับเฉพาะชั่วโมงที่แสดง
    await expect(table.locator('tfoot td').last()).toHaveText(shownTotal.toLocaleString('th-TH'))
    // 7 แถว (จันทร์ → อาทิตย์)
    await expect(table.locator('tbody tr')).toHaveCount(7)
    const note = heatmap.getByText(/ออเดอร์นอกเวลาเปิดร้าน/)
    if (outside > 0) {
      // ตั้ง VITE_OPEN_HOUR/VITE_CLOSE_HOUR ไว้ และมีออเดอร์นอกช่วงนั้น — ต้องบอกจำนวนที่ไม่นับ
      await expect(note).toContainText(`ไม่รวม ${outside.toLocaleString('th-TH')} ออเดอร์นอกเวลาเปิดร้าน`)
    } else {
      await expect(note).toHaveCount(0)
      // ไม่ได้ล็อกเวลาเปิดร้าน = ตัดเฉพาะหัว/ท้ายที่ไม่มีออเดอร์ทั้งสัปดาห์ ทุกชั่วโมงที่มีออเดอร์ต้องอยู่ในตาราง
      const active = hourTotals.flatMap((n, h) => (n > 0 ? [h] : []))
      for (const h of active) expect(shown).toContain(h)
    }
  })

  await test.step('ความเร็วครัว', async () => {
    const k = report.kitchen
    const speed = sectionOf(page, 'ความเร็วครัว')
    expect(k.timedOrderCount, 'ออเดอร์ที่เพิ่งเสิร์ฟต้องถูกจับเวลา').toBeGreaterThan(0)
    await expect(speed).toContainText(`จาก ${k.timedOrderCount.toLocaleString('th-TH')} ออเดอร์ที่จับเวลาได้`)
    await expect(statValue(page, 'รอคิวเฉลี่ย')).toHaveText(minutes(k.avgWaitMinutes))
    await expect(statValue(page, 'ปรุงเฉลี่ย')).toHaveText(minutes(k.avgCookMinutes))
    await expect(statValue(page, 'รวมเฉลี่ย')).toHaveText(minutes(k.avgTotalMinutes))
    await expect(statValue(page, `เกิน ${k.lateMinutes} นาที`)).toHaveText(`${k.lateOrderCount.toLocaleString('th-TH')} ออเดอร์`)
  })
})
