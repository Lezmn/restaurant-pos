import { test, expect, type APIRequestContext } from '@playwright/test'
import { API_URL, checkTableTile, loginAsAdmin, loginAsCashier, loginViaApi } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data (DB ทดสอบเท่านั้น — เก็บเงินจริง และปิดยอดวันนี้จริง)
// เก็บเงินสดพร้อมส่วนลด → ใบเสร็จแสดงส่วนลด → ลิ้นชักวันนี้เพิ่มตามยอดเก็บจริง → ปิดยอด → dashboard ตรงกัน
test.describe.configure({ mode: 'serial' })
test.use({ viewport: { width: 1024, height: 768 } })

const SEED_PASSWORD = 'ChangeMe123!'

async function api(request: APIRequestContext, role: 'admin' | 'staff' | 'kitchen') {
  const { accessToken } = await loginViaApi(request, role, SEED_PASSWORD)
  return { Authorization: `Bearer ${accessToken}` }
}

/** โต๊ะใหม่ + ออเดอร์ข้าวผัดหมู 2 จาน (100 บาท) เสิร์ฟแล้ว พร้อมเก็บเงิน */
async function servedTable(request: APIRequestContext) {
  const admin = await api(request, 'admin')
  const kitchen = await api(request, 'kitchen')
  const table = await (
    await request.post(`${API_URL}/tables`, { headers: admin, data: { number: 500 + Math.floor(Math.random() * 9_000_000) } })
  ).json()
  const session = await (await request.post(`${API_URL}/table-sessions`, { headers: admin, data: { tableId: table.id } })).json()
  const menu = (await (await request.get(`${API_URL}/public/menu`)).json()).flatMap(
    (c: { menuItems: unknown[] }) => c.menuItems,
  ) as { id: string; name: string; options: { id: string; name: string }[] }[]
  const rice = menu.find((m) => m.name === 'ข้าวผัด')!
  const pork = rice.options.find((o) => o.name === 'หมู')!
  const order = await (
    await request.post(`${API_URL}/public/orders`, {
      data: { sessionToken: session.token, items: [{ menuItemId: rice.id, quantity: 2, optionIds: [pork.id] }] },
    })
  ).json()
  for (const status of ['PREPARING', 'SERVED']) {
    await request.patch(`${API_URL}/orders/${order.id}/status`, { headers: kitchen, data: { status } })
  }
  return { tableName: String(table.number) }
}

const money = (text: string | null) => Number((text ?? '').replace(/[^\d.-]/g, ''))

test('รับเงินสดพร้อมส่วนลด: ต้องใส่เหตุผล, ใบเสร็จโชว์ส่วนลด, ลิ้นชักเพิ่มเท่ายอดเก็บจริง', async ({ page, request }) => {
  const { tableName } = await servedTable(request)
  await loginAsCashier(page, request)
  await page.goto('/employee/check')

  const drawer = page.getByRole('region', { name: 'ลิ้นชักวันนี้' })
  const cashRow = drawer.locator('dd').first()
  await expect(cashRow).toBeVisible()
  const cashBefore = money(await cashRow.textContent())

  const tile = checkTableTile(page, tableName)
  await tile.getByRole('button', { name: /^รับเงิน/ }).click()
  const dialog = page.getByRole('dialog', { name: `รับเงิน โต๊ะ ${tableName}` })
  await expect(dialog.getByText(/ยอดที่ต้องจ่าย\s*฿100/)).toBeVisible()

  // เงินทอน: รับมา 500 → ทอน 420 (หลังลดเหลือ 80)
  await dialog.getByRole('button', { name: 'ให้ส่วนลด' }).click()
  await dialog.getByLabel(/ราคาที่เก็บจริง/).fill('80')
  const submit = dialog.getByRole('button', { name: 'รับเงิน ฿80' })
  await expect(submit).toBeDisabled() // ยังไม่ใส่เหตุผล
  await dialog.getByLabel(/เหตุผลที่ลด/).fill('ลูกค้าประจำ')
  await dialog.getByRole('button', { name: '฿500' }).click()
  await expect(dialog.getByText('เงินทอน', { exact: true })).toBeVisible()
  await expect(dialog.getByText('฿420')).toBeVisible()
  await submit.click()

  const receipt = page.getByRole('dialog', { name: 'ใบเสร็จรับเงิน' })
  await expect(receipt).toBeVisible()
  await expect(receipt.getByText('ส่วนลด').first()).toBeVisible()
  await expect(receipt.getByText('฿20').first()).toBeVisible()
  await expect(receipt.getByText('฿80').first()).toBeVisible()
  await expect(receipt.getByText(/ลูกค้าประจำ/)).toBeVisible()
  await receipt.getByRole('button', { name: 'ปิด' }).click()

  await expect(tile).toHaveCount(0)
  await expect.poll(async () => money(await cashRow.textContent())).toBeCloseTo(cashBefore + 80, 2)
})

test('ปิดยอดวันนี้: ตัวเลข "ควรมีในลิ้นชัก" = เงินทอน + ขายสด − หยิบออก และ owner เห็นในประวัติ', async ({ page, request }) => {
  // รันซ้ำวันเดียวกัน → ลบการปิดยอดเดิมก่อน (ADMIN เท่านั้น)
  const admin = await api(request, 'admin')
  const preview = await (await request.get(`${API_URL}/cash-closes/preview`, { headers: admin })).json()
  if (preview.alreadyClosed) {
    await request.delete(`${API_URL}/cash-closes/${preview.alreadyClosed.id}`, { headers: admin })
  }

  await loginAsCashier(page, request)
  await page.goto('/employee/check')
  const drawer = page.getByRole('region', { name: 'ลิ้นชักวันนี้' })

  // หยิบเงินออก 25 บาท
  await drawer.getByRole('button', { name: 'หยิบเงินออก' }).click()
  const take = page.getByRole('dialog', { name: 'หยิบเงินออกจากลิ้นชัก' })
  await take.getByLabel(/จำนวนเงิน/).fill('25')
  await take.getByLabel(/เอาไปจ่ายอะไร/).fill('น้ำแข็ง (E2E)')
  await take.getByRole('button', { name: /บันทึก|ยืนยัน/ }).click()
  await expect(take).toHaveCount(0)

  await drawer.getByRole('button', { name: 'ปิดยอดวันนี้' }).click()
  const close = page.getByRole('dialog', { name: 'ปิดยอดวันนี้' })
  await close.getByLabel(/เงินทอนตั้งต้น/).fill('1000')
  const fresh = await (await request.get(`${API_URL}/cash-closes/preview`, { headers: admin })).json()
  const expected = 1000 + fresh.cashSales - fresh.drawerExpenses
  await expect(close.locator('dl')).toContainText(`฿${expected.toLocaleString('th-TH', { maximumFractionDigits: 2 })}`)
  await close.getByLabel('เงินที่นับได้จริง').fill(String(expected - 10))
  await expect(close.getByText(/ขาด/)).toBeVisible()
  await close.getByRole('button', { name: 'ยืนยันปิดยอด' }).click()
  await expect(close).toHaveCount(0)

  await loginAsAdmin(page, request)
  await page.goto('/owner/cash-closes')
  await expect(page.getByText(/-?฿10|ขาด/).first()).toBeVisible()
})

// @totals-dashboard: เทียบยอดขายทั้งวัน — รันแยกหลังเทสอื่นจบ (playwright.config.ts)
test('Dashboard ของเจ้าของ: ยอดขายวันนี้ตรงกับ /reports และเพิ่มขึ้นหลังเก็บเงินสด', { tag: '@totals-dashboard' }, async ({ page, request }) => {
  const admin = await api(request, 'admin')
  const before = await (await request.get(`${API_URL}/reports/dashboard`, { headers: admin })).json()
  const { tableName } = await servedTable(request)

  await loginAsCashier(page, request)
  await page.goto('/employee/check')
  await checkTableTile(page, tableName).getByRole('button', { name: /^รับเงิน/ }).click()
  await page.getByRole('dialog', { name: `รับเงิน โต๊ะ ${tableName}` }).getByRole('button', { name: 'รับเงิน ฿100' }).click()
  await page.getByRole('dialog', { name: 'ใบเสร็จรับเงิน' }).getByRole('button', { name: 'ปิด' }).click()

  const after = await (await request.get(`${API_URL}/reports/dashboard`, { headers: admin })).json()
  expect(after.revenue - before.revenue).toBeCloseTo(100, 2)

  await loginAsAdmin(page, request)
  await page.goto('/owner/dashboard')
  const revenueText = `฿${after.revenue.toLocaleString('th-TH', { maximumFractionDigits: 2 })}`
  await expect(page.getByText(revenueText).first()).toBeVisible()
})
