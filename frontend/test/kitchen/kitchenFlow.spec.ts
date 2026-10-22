import { test, expect } from '@playwright/test'
import { API_URL, loginAsKitchen, loginViaApi } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data (DB ทดสอบเท่านั้น — สร้างโต๊ะ/ออเดอร์จริง)
// ครัว: รับออเดอร์ → เริ่มปรุง → ทำเสร็จ → ยกให้ลูกค้า (เคลียร์) และปิดวัตถุดิบแล้วเมนูต้องหายฝั่งลูกค้า

const SEED_PASSWORD = 'ChangeMe123!'

async function freshOrder(request: import('@playwright/test').APIRequestContext) {
  const admin = await loginViaApi(request, 'admin', SEED_PASSWORD)
  const headers = { Authorization: `Bearer ${admin.accessToken}` }
  const table = await (
    await request.post(`${API_URL}/tables`, {
      headers,
      data: { number: 500 + Math.floor(Math.random() * 9_000_000), seats: 2 },
    })
  ).json()
  const session = await (
    await request.post(`${API_URL}/table-sessions`, { headers, data: { tableId: table.id } })
  ).json()
  const menu = await (await request.get(`${API_URL}/public/menu`)).json()
  const water = menu.flatMap((c: { menuItems: { id: string; name: string }[] }) => c.menuItems).find(
    (m: { name: string }) => m.name === 'น้ำเปล่า',
  )
  const order = await (
    await request.post(`${API_URL}/public/orders`, {
      data: { sessionToken: session.token, items: [{ menuItemId: water.id, quantity: 2 }] },
    })
  ).json()
  return { tableName: String(table.number), token: session.token as string, orderRef: order.id.slice(0, 6).toUpperCase() }
}

test('ครัวไล่สถานะ รอคิว → กำลังปรุง → ทำเสร็จ → เคลียร์ออกจากบอร์ด และลูกค้าเห็นสถานะเปลี่ยน', async ({
  page,
  request,
  browser,
}) => {
  const { token, orderRef } = await freshOrder(request)
  await loginAsKitchen(page, request)
  await page.goto('/employee/order')

  const card = (column: string) =>
    page.locator('section', { hasText: column }).locator('article', { hasText: `#${orderRef}` })

  await card('รอคิว').getByRole('button', { name: 'เริ่มปรุง' }).click()
  await expect(card('กำลังปรุง')).toBeVisible()
  await card('กำลังปรุง').getByRole('button', { name: 'ทำเสร็จแล้ว' }).click()
  await expect(card('เมนูที่ทำเสร็จ')).toBeVisible()

  // ลูกค้าเห็นว่าเสิร์ฟแล้ว
  const customer = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage()
  await customer.goto(`/t/${token}/status`)
  await expect(customer.getByText(`ออเดอร์ #${orderRef}`)).toBeVisible()

  await card('เมนูที่ทำเสร็จ').getByRole('button', { name: 'ทำเสร็จเรียบร้อย' }).click()
  await expect(page.locator('article', { hasText: `#${orderRef}` })).toHaveCount(0)
  // รีเฟรชแล้วต้องไม่กลับมา (เก็บใน DB ไม่ใช่ state ในจอ)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'รอคิว' })).toBeVisible()
  await expect(page.locator('article', { hasText: `#${orderRef}` })).toHaveCount(0)
  await customer.context().close()
})

test('ครัวปิดวัตถุดิบ "ไข่" → ข้าวไข่เจียวหายจากหน้าลูกค้าที่เปิดค้างไว้ (realtime) แล้วเปิดคืนได้', async ({
  page,
  request,
  browser,
}) => {
  const { token } = await freshOrder(request)
  const customer = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage()
  await customer.goto(`/t/${token}`)
  const omelet = customer.getByRole('link', { name: /^ข้าวไข่เจียว/ })
  await expect(omelet).toBeVisible()

  await loginAsKitchen(page, request)
  await page.goto('/employee/manage')
  await page.getByRole('button', { name: 'วัตถุดิบ', exact: true }).click()
  const eggSwitch = page.getByRole('switch', { name: 'มีของ ไข่', exact: true })
  await expect(eggSwitch).toBeChecked()

  try {
    await eggSwitch.click()
    await expect(eggSwitch).not.toBeChecked()
    // toast ยืนยันพร้อมปุ่มเลิกทำ
    await expect(page.getByText('ไข่: ของหมด')).toBeVisible()
    // หน้าลูกค้าไม่ได้ refresh แต่เมนูต้องหายเอง
    await expect(omelet).toHaveCount(0, { timeout: 10_000 })
  } finally {
    if (!(await eggSwitch.isChecked())) await eggSwitch.click()
  }
  await expect(eggSwitch).toBeChecked()
  await expect(omelet).toBeVisible({ timeout: 10_000 })
  await customer.context().close()
})

test('KITCHEN เข้าหน้า Manage ได้: เปิด/ปิดขายเมนูได้จริง แต่ไม่เห็นปุ่มเพิ่ม/แก้เมนู หรือเพิ่ม/ลบวัตถุดิบ', async ({
  page,
  request,
}) => {
  await loginAsKitchen(page, request)
  await page.goto('/employee/manage')
  await expect(page.getByRole('heading', { name: 'จัดการเมนู' })).toBeVisible()
  // POST/PATCH/DELETE /menu เป็น @Roles(ADMIN) — ถ้า KITCHEN เห็นปุ่มพวกนี้ กดแล้วจะเจอ 403
  await expect(page.getByRole('button', { name: 'เพิ่มเมนู', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'แก้ไข' })).toHaveCount(0)

  // ปิดขาย/เปิดขายใช้ PATCH /menu/:id/availability @Roles(ADMIN, KITCHEN) — ต้องสำเร็จ ไม่ใช่ 403
  const water = page.getByRole('switch', { name: 'เปิดขาย น้ำเปล่า' })
  await expect(water).toBeChecked()
  const statuses: number[] = []
  page.on('response', (res) => {
    if (res.url().includes('/availability')) statuses.push(res.status())
  })
  await water.click()
  await expect(water).not.toBeChecked()
  await water.click()
  await expect(water).toBeChecked()
  expect(statuses).toEqual([200, 200])

  // แท็บวัตถุดิบ: สลับมีของ/หมดได้ แต่เพิ่ม/ลบไม่ได้
  await page.getByRole('button', { name: 'วัตถุดิบ', exact: true }).click()
  await expect(page.getByRole('switch', { name: /^มีของ / }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'เพิ่มวัตถุดิบ' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'ลบ', exact: true })).toHaveCount(0)
})

test('จอครัวไม่ยิง /service-requests (ADMIN/STAFF เท่านั้น) — ไม่มี 403 เต็ม console', async ({ page, request }) => {
  const hits: number[] = []
  page.on('response', (res) => {
    // นับเฉพาะ API — Vite เสิร์ฟไฟล์ /src/features/service-requests/* ชื่อคล้ายกัน
    if (res.url().startsWith(`${API_URL}/service-requests`)) hits.push(res.status())
  })
  await loginAsKitchen(page, request)
  await page.goto('/employee/order')
  await expect(page.getByRole('heading', { name: 'รอคิว' })).toBeVisible()
  // มีออเดอร์ใหม่เข้า = socket event ที่เคยทำให้ refetch service-requests
  await freshOrder(request)
  await page.waitForTimeout(2000)
  expect(hits).toEqual([])
})
