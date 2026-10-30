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

// ทดสอบ: ให้ส่วนลดต้องใส่เหตุผลก่อน, คิดเงินทอนถูก, ใบเสร็จแสดงส่วนลด และเงินในลิ้นชักวันนี้เพิ่มเท่ายอดที่เก็บจริง
// วิธี: เตรียมโต๊ะใหม่ที่เสิร์ฟข้าวผัด 2 จาน (100) ผ่าน API → จดเงินสดในลิ้นชักไว้ → กดให้ส่วนลดเหลือ 80 → ปุ่มรับเงินต้องกดไม่ได้จนกว่าจะใส่เหตุผล → รับ ฿500 เช็กเงินทอน ฿420 → เช็กใบเสร็จ (ส่วนลด ฿20, ยอด ฿80, เหตุผล) → เช็กว่าลิ้นชักเพิ่ม 80
// @totals-dashboard: เทียบเงินสดในลิ้นชักทั้งวันก่อน/หลัง — รันช่วงท้ายแบบไม่ขนาน ไม่ให้บิลเงินสดของเทสอื่นปน
test('รับเงินสดพร้อมส่วนลด: ต้องใส่เหตุผล, ใบเสร็จโชว์ส่วนลด, ลิ้นชักเพิ่มเท่ายอดเก็บจริง', { tag: '@totals-dashboard' }, async ({ page, request }) => {
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
  // ส่วนลดเป็น % — ลด 20% จาก 100 = เก็บจริง 80
  await dialog.getByLabel(/ลดกี่ %/).fill('20')
  await expect(dialog.getByText('฿80', { exact: true })).toBeVisible()
  const submit = dialog.getByRole('button', { name: 'รับเงิน', exact: true })
  await expect(submit).toBeDisabled() // ยังไม่ใส่เหตุผล
  await dialog.getByLabel(/เหตุผลที่ลด/).fill('ลูกค้าประจำ')
  await dialog.getByRole('button', { name: '฿500' }).click()
  await expect(dialog.getByText('เงินทอน', { exact: true })).toBeVisible()
  await expect(dialog.getByText('฿420')).toBeVisible()
  await submit.click()

  const receipt = page.getByRole('dialog', { name: 'ใบเสร็จรับเงิน' })
  await expect(receipt).toBeVisible()
  await expect(receipt.getByText('ส่วนลด 20%', { exact: true })).toBeVisible()
  await expect(receipt.getByText('฿20').first()).toBeVisible()
  await expect(receipt.getByText('฿80').first()).toBeVisible()
  await expect(receipt.getByText(/ลูกค้าประจำ/)).toBeVisible()
  await receipt.getByRole('button', { name: 'ปิด' }).click()

  await expect(tile).toHaveCount(0)
  await expect.poll(async () => money(await cashRow.textContent())).toBeCloseTo(cashBefore + 80, 2)
})

// ทดสอบ: ยอด "ควรมีในลิ้นชัก" ตอนปิดยอดต้องเท่ากับเงินทอน + ขายเงินสด − เงินที่หยิบออก, บอกยอดขาดเมื่อนับได้น้อยกว่า และเจ้าของเห็นในประวัติ
// วิธี: ถ้าวันนี้ปิดยอดไปแล้วให้ลบก่อน → cashier หยิบเงินออก 25 → ปิดยอดด้วยเงินทอน 1000 → เทียบยอดที่ควรมีกับที่คำนวณจาก API → กรอกนับได้น้อยไป 10 เช็กว่าขึ้น "ขาด" → ยืนยัน → admin เปิด /owner/cash-closes เช็กว่าเห็นรายการ
// @totals-cashclose: รันท้ายสุด (playwright.config.ts) — ระหว่างปิดยอด เทสอื่นยกเลิกบิลของวันนี้ไม่ได้
test('ปิดยอดวันนี้ (หน้าเจ้าของร้าน): ตัวเลข "ควรมีในลิ้นชัก" = เงินทอน + ขายสด − หยิบออก และเห็นในประวัติ', { tag: '@totals-cashclose' }, async ({ page, request }) => {
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

  // ปุ่มปิดยอดย้ายไปหน้า "ปิดยอดเงินสด" ของเจ้าของร้าน — หน้า Check ไม่มีแล้ว
  await expect(drawer.getByRole('button', { name: 'ปิดยอดวันนี้' })).toHaveCount(0)
  await loginAsAdmin(page, request)
  await page.goto('/owner/cash-closes')
  await page.getByRole('button', { name: 'ปิดยอดวันนี้' }).click()
  const close = page.getByRole('dialog', { name: 'ปิดยอดวันนี้' })
  await close.getByLabel(/เงินทอนตั้งต้น/).fill('1000')
  const fresh = await (await request.get(`${API_URL}/cash-closes/preview`, { headers: admin })).json()
  const expected = 1000 + fresh.cashSales - fresh.drawerExpenses
  await expect(close.locator('dl')).toContainText(`฿${expected.toLocaleString('th-TH', { maximumFractionDigits: 2 })}`)
  await close.getByLabel('เงินที่นับได้จริง').fill(String(expected - 10))
  await expect(close.getByText(/ขาด/)).toBeVisible()
  await close.getByRole('button', { name: 'ยืนยันปิดยอด' }).click()
  await expect(close).toHaveCount(0)

  await expect(page.getByText(/ปิดยอดวันนี้แล้ว/)).toBeVisible()
  await expect(page.getByText(/-?฿10|ขาด/).first()).toBeVisible()

  // มือถือ: แต่ละวันเป็นการ์ด ชื่อตัวเลข (data-label) ซ้าย ค่าขวา — ไม่เลื่อนข้าง และ "นับได้" ของวันนี้อยู่ในจอ
  await page.setViewportSize({ width: 375, height: 812 })
  const todayRow = page.locator('tbody tr').filter({ has: page.locator('td[data-label="นับได้"]') }).first()
  await expect(todayRow).toBeVisible()
  const counted = todayRow.locator('td[data-label="นับได้"]')
  await expect(counted).toContainText('฿')
  const box = await counted.boundingBox()
  expect(box!.x + box!.width).toBeLessThanOrEqual(375)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  await page.setViewportSize({ width: 1024, height: 768 })

  // ปิดยอดแล้วยกเลิกบิลของวันนั้นไม่ได้ — ADMIN ต้องลบการปิดยอดก่อน
  const closed = await (await request.get(`${API_URL}/cash-closes/preview`, { headers: admin })).json()
  const payments = await (await request.get(`${API_URL}/payments`, { headers: admin })).json()
  const todayPaid = payments.find((p: { status: string }) => p.status === 'COMPLETED')
  if (todayPaid) {
    const blocked = await request.patch(`${API_URL}/payments/${todayPaid.id}/void`, { headers: admin, data: { reason: 'ทดสอบหลังปิดยอด' } })
    expect(blocked.status()).toBe(409)
  }
  // เก็บกวาด: ลบการปิดยอด ให้รันซ้ำวันเดียวกันได้
  await request.delete(`${API_URL}/cash-closes/${closed.alreadyClosed.id}`, { headers: admin })
})

// @totals-dashboard: เทียบยอดขายทั้งวัน — รันแยกหลังเทสอื่นจบ (playwright.config.ts)
// ทดสอบ: รายรับวันนี้ใน Dashboard ต้องตรงกับ /reports และเพิ่มขึ้นหลังเก็บเงินสด
// วิธี: จดรายรับจาก API → เตรียมโต๊ะ 100 บาทแล้ว cashier เก็บเงินสด → เช็กว่ารายรับใน API เพิ่ม 100 → admin เปิด Dashboard เช็กว่าเห็นตัวเลขเดียวกับ API (รันแยกหลังชุดหลัก แท็ก @totals-dashboard)
test('Dashboard ของเจ้าของ: ยอดขายวันนี้ตรงกับ /reports และเพิ่มขึ้นหลังเก็บเงินสด', { tag: '@totals-dashboard' }, async ({ page, request }) => {
  const admin = await api(request, 'admin')
  const before = await (await request.get(`${API_URL}/reports/dashboard`, { headers: admin })).json()
  const { tableName } = await servedTable(request)

  await loginAsCashier(page, request)
  await page.goto('/employee/check')
  await checkTableTile(page, tableName).getByRole('button', { name: /^รับเงิน/ }).click()
  await page.getByRole('dialog', { name: `รับเงิน โต๊ะ ${tableName}` }).getByRole('button', { name: 'รับเงิน', exact: true }).click()
  await page.getByRole('dialog', { name: 'ใบเสร็จรับเงิน' }).getByRole('button', { name: 'ปิด' }).click()

  const after = await (await request.get(`${API_URL}/reports/dashboard`, { headers: admin })).json()
  expect(after.revenue - before.revenue).toBeCloseTo(100, 2)

  await loginAsAdmin(page, request)
  await page.goto('/owner/dashboard')
  const revenueText = `฿${after.revenue.toLocaleString('th-TH', { maximumFractionDigits: 2 })}`
  await expect(page.getByText(revenueText).first()).toBeVisible()
})
