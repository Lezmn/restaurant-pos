import { test, expect, devices, type Browser } from '@playwright/test'
import { API_URL, loginAsCashier, loginAsKitchen, loginViaApi } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data (DB ทดสอบเท่านั้น — เทสต์นี้สร้างโต๊ะ/ออเดอร์จริง)
// flow ลูกค้าสแกน QR บนมือถือ: เมนู → เลือกตัวเลือก → ตะกร้า → ส่งเข้าครัว → สถานะ → เรียกพนักงาน → ขอบิล
// และต้องเห็นผลอีกฝั่ง (ครัว/แคชเชียร์) โดยไม่ต้อง refresh

const SEED_PASSWORD = 'ChangeMe123!'

/** สร้างโต๊ะใหม่ + เปิด QR ผ่าน API (ไม่ไปแย่งโต๊ะ seed กับเทสต์อื่น) */
async function openFreshTable(request: import('@playwright/test').APIRequestContext) {
  const admin = await loginViaApi(request, 'admin', SEED_PASSWORD)
  const headers = { Authorization: `Bearer ${admin.accessToken}` }
  let table: { id: string; number: number } | null = null
  for (let i = 0; i < 5 && !table; i++) {
    const res = await request.post(`${API_URL}/tables`, {
      headers,
      data: { number: 500 + Math.floor(Math.random() * 9_000_000), seats: 2 },
    })
    if (res.ok()) table = await res.json()
  }
  if (!table) throw new Error('สร้างโต๊ะไม่สำเร็จ')
  const session = await (
    await request.post(`${API_URL}/table-sessions`, { headers, data: { tableId: table.id } })
  ).json()
  return { tableName: String(table.number), token: session.token as string }
}

async function phone(browser: Browser) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 375, height: 812 } })
  return ctx.newPage()
}

test('ลูกค้าสั่งผ่าน QR บนมือถือ แล้วครัวเห็นออเดอร์ทันที (ไม่ refresh)', async ({ browser, page, request }) => {
  const { tableName, token } = await openFreshTable(request)

  // ครัวเปิดบอร์ดรอไว้ก่อน
  await loginAsKitchen(page, request)
  await page.goto('/employee/order')
  await expect(page.getByRole('heading', { name: 'รอคิว' })).toBeVisible()

  const customer = await phone(browser)
  await customer.goto(`/t/${token}`)
  await expect(customer.getByText(`โต๊ะ ${tableName}`).first()).toBeVisible()

  // เมนูที่มีตัวเลือก: ต้องเลือกเนื้อสัตว์ก่อนถึงจะเพิ่มได้
  await customer.getByRole('link', { name: /^ข้าวผัด ข้าวผัด/ }).click()
  await expect(customer.getByRole('button', { name: /กรุณาเลือกเนื้อสัตว์/ })).toBeDisabled()
  await customer.getByRole('radio', { name: /กุ้ง/ }).check()
  await customer.getByRole('checkbox', { name: /ไข่ดาว/ }).check()
  await customer.getByRole('button', { name: 'เพิ่มจำนวน' }).click()
  await customer.getByPlaceholder(/ไม่เผ็ด/).fill('ไม่ใส่ผัก')
  // (50 + 20 + 10) × 2 = 160
  await customer.getByRole('button', { name: /เพิ่มรายการ\s*฿160/ }).click()

  // ตะกร้า: เพิ่มน้ำเปล่าอีก 1 แล้วเช็คยอดรวม
  await expect(customer).toHaveURL(new RegExp(`/t/${token}/cart$`))
  await customer.getByRole('link', { name: 'เมนูอาหาร' }).click()
  await customer.getByRole('link', { name: /^น้ำเปล่า น้ำเปล่า/ }).click()
  await customer.getByRole('button', { name: /เพิ่มรายการ/ }).click()
  await expect(customer.getByText('ทั้งหมด 3 รายการ')).toBeVisible()
  await expect(customer.getByText('฿170').first()).toBeVisible()

  // refresh กลางทาง — ตะกร้าต้องยังอยู่
  await customer.reload()
  await expect(customer.getByText('ทั้งหมด 3 รายการ')).toBeVisible()

  await customer.getByRole('button', { name: '➤ ส่งรายการเข้าครัว' }).click()
  await expect(customer.getByRole('heading', { name: 'ติดตามสถานะออเดอร์' })).toBeVisible()
  await expect(customer.getByText('ไม่ใส่ผัก')).toBeVisible()

  // ตะกร้าถูกล้างหลังส่ง
  await customer.getByRole('link', { name: 'รายการที่เลือก' }).click()
  await expect(customer.getByText('ยังไม่มีรายการที่เลือก')).toBeVisible()

  // ครัวเห็นการ์ดของโต๊ะนี้โผล่ในคอลัมน์ "รอคิว" เอง
  const queue = page.locator('section', { hasText: 'รอคิว' })
  await expect(
    queue.locator('article').filter({ has: page.getByText(`โต๊ะ ${tableName}`, { exact: true }) }),
  ).toBeVisible({ timeout: 10_000 })
  await customer.context().close()
})

test('เรียกพนักงาน/ขอบิลจากมือถือ → แคชเชียร์เห็นป๊อปอัปและวิธีจ่ายที่ลูกค้าเลือกโดยไม่ refresh', async ({
  browser,
  page,
  request,
}) => {
  const { tableName, token } = await openFreshTable(request)

  await loginAsCashier(page, request)
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.goto('/employee/check')
  const tile = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: `โต๊ะ ${tableName}`, exact: true }) })
  await expect(tile).toBeVisible()

  const customer = await phone(browser)
  // ขอบิล: ยังไม่มีออเดอร์ → หน้าบิลต้องบอกว่าไม่มีรายการ (ไม่ใช่ปุ่มจ่ายเงิน 0 บาท)
  await customer.goto(`/t/${token}/bill`)
  await expect(customer.getByText('ยังไม่มีรายการที่สั่ง')).toBeVisible()

  // ปุ่มเรียกพนักงานมีเฉพาะหน้าสถานะที่มีออเดอร์แล้ว — สั่งน้ำ 1 ขวดก่อน
  await customer.goto(`/t/${token}`)
  await customer.getByRole('link', { name: /^น้ำเปล่า น้ำเปล่า/ }).click()
  await customer.getByRole('button', { name: /เพิ่มรายการ/ }).click()
  await customer.getByRole('button', { name: '➤ ส่งรายการเข้าครัว' }).click()
  await customer.getByRole('button', { name: /เรียกพนักงาน/ }).click()

  // ป๊อปอัปโชว์ทีละโต๊ะ เรียงจากคำขอเก่าสุด — รับทราบของโต๊ะอื่นที่ค้างอยู่ก่อน (ข้อมูล seed/เทสต์อื่น)
  const alert = page.getByRole('alert').filter({ hasText: `โต๊ะ ${tableName}` })
  const anyAlert = page.getByRole('alert').filter({ hasText: 'มีการเรียกพนักงาน' })
  await expect(async () => {
    if ((await alert.count()) === 0 && (await anyAlert.count()) > 0) {
      await anyAlert.getByRole('button', { name: 'รับทราบ' }).click()
    }
    await expect(alert).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 20_000 })
  await alert.getByRole('button', { name: 'รับทราบ' }).click()
  await expect(alert).toHaveCount(0)

  // ลูกค้าเลือกจ่ายเงินสด → การ์ดโต๊ะที่หน้า Check ต้องบอกวิธีจ่ายเอง
  await customer.getByRole('link', { name: 'เช็คบิลอาหาร' }).click()
  await expect(customer.getByText('รวมสุทธิ')).toBeVisible()
  await customer.getByRole('button', { name: /จ่ายเงินสด/ }).click()
  await expect(tile.getByText(/เงินสด/)).toBeVisible({ timeout: 10_000 })
  await expect(tile.getByText('฿10')).toBeVisible()
  await customer.context().close()
})

test('แตะ "ส่งรายการเข้าครัว" สองครั้งติด (double-tap) ต้องได้ออเดอร์เดียว ไม่คิดเงินซ้ำ', async ({ browser, request }) => {
  const { token } = await openFreshTable(request)
  const customer = await phone(browser)
  await customer.goto(`/t/${token}`)
  await customer.getByRole('link', { name: /^น้ำเปล่า น้ำเปล่า/ }).click()
  await customer.getByRole('button', { name: /เพิ่มรายการ/ }).click()
  await customer.getByRole('button', { name: '➤ ส่งรายการเข้าครัว' }).dblclick()
  await expect(customer.getByRole('heading', { name: 'ติดตามสถานะออเดอร์' })).toBeVisible()
  await customer.waitForTimeout(1500)
  const orders = await (await request.get(`${API_URL}/public/sessions/${token}/orders`)).json()
  expect(orders).toHaveLength(1)
  await customer.context().close()
})

test('แอดมินเปลี่ยนราคาระหว่างที่อยู่ในตะกร้า → ตะกร้าแสดงราคาใหม่ (ตรงกับที่คิดเงินจริง) และบอกลูกค้า', async ({
  browser,
  request,
}) => {
  const { token } = await openFreshTable(request)
  const admin = await loginViaApi(request, 'admin', SEED_PASSWORD)
  const headers = { Authorization: `Bearer ${admin.accessToken}` }
  const menu = await (await request.get(`${API_URL}/public/menu`)).json()
  const water = menu
    .flatMap((c: { menuItems: { id: string; name: string; price: string | number }[] }) => c.menuItems)
    .find((m: { name: string }) => m.name === 'น้ำเปล่า')
  const oldPrice = Number(water.price)
  const newPrice = oldPrice + 7

  const customer = await phone(browser)
  try {
    await customer.goto(`/t/${token}`)
    await customer.getByRole('link', { name: /^น้ำเปล่า น้ำเปล่า/ }).click()
    await customer.getByRole('button', { name: /เพิ่มรายการ/ }).click()

    // กดเพิ่มแล้วอยู่หน้าตะกร้าอยู่แล้ว — ราคาต้องเปลี่ยนเองตาม menu.updated โดยลูกค้าไม่ต้อง refresh
    await expect(customer.getByRole('heading', { name: 'รายการอาหาร' })).toBeVisible()
    const res = await request.patch(`${API_URL}/menu/${water.id}`, { headers, data: { price: newPrice } })
    expect(res.ok()).toBe(true)

    await expect(customer.getByRole('status')).toContainText('น้ำเปล่า')
    const totalRow = customer.getByText('ยอดรวมรายการอาหาร').locator('..')
    await expect(totalRow).toContainText(String(newPrice))

    await customer.getByRole('button', { name: '➤ ส่งรายการเข้าครัว' }).click()
    await expect(customer.getByRole('heading', { name: 'ติดตามสถานะออเดอร์' })).toBeVisible()
    const [order] = await (await request.get(`${API_URL}/public/sessions/${token}/orders`)).json()
    expect(Number(order.items[0].unitPrice)).toBe(newPrice)
  } finally {
    await request.patch(`${API_URL}/menu/${water.id}`, { headers, data: { price: oldPrice } })
    await customer.context().close()
  }
})

test('ลูกค้าที่ยังไม่ได้สั่งอะไร ต้องเรียกพนักงานได้ (เช่น ถามเมนู/ขอช้อนส้อม)', async ({ browser, request }) => {
  const { token } = await openFreshTable(request)
  const customer = await phone(browser)
  await customer.goto(`/t/${token}`)
  await expect(customer.getByRole('searchbox', { name: 'ค้นหาเมนูอาหาร' })).toBeVisible()
  // ทั้งหน้าเมนูและหน้าสถานะ ต้องมีทางเรียกพนักงานอย่างน้อยหนึ่งทาง
  const onMenu = await customer.getByRole('button', { name: /เรียกพนักงาน/ }).count()
  await customer.goto(`/t/${token}/status`)
  const onStatus = await customer.getByRole('button', { name: /เรียกพนักงาน/ }).count()
  expect(onMenu + onStatus).toBeGreaterThan(0)
  await customer.context().close()
})

test('ลูกค้าเปิดลิงก์ QR ที่ผิด หรือโต๊ะที่ปิดแล้ว เห็นข้อความที่เข้าใจได้ ไม่ใช่หน้าขาว', async ({ browser }) => {
  const customer = await phone(browser)
  await customer.goto('/t/this-token-does-not-exist')
  await expect(customer.getByRole('heading', { name: 'เปิดโต๊ะนี้ไม่ได้' })).toBeVisible()
  await customer.goto('/t/demo-table-1-paid-session')
  await expect(customer.getByRole('heading', { name: 'โต๊ะนี้ปิดบิลแล้ว' })).toBeVisible()
  await customer.goto('/t/demo-table-1-paid-session/cart')
  await expect(customer.getByRole('heading', { name: 'โต๊ะนี้ปิดบิลแล้ว' })).toBeVisible()
  await customer.context().close()
})
