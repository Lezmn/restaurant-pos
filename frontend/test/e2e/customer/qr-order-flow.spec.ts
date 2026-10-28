import { test, expect, devices, type Browser } from '@playwright/test'
import { API_URL, chooseOption, loginAsCashier, loginAsKitchen, loginViaApi } from '../helpers'

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

// ทดสอบ: ลูกค้าสั่งผ่าน QR บนมือถือได้ครบขั้นตอน (ต้องเลือกเนื้อสัตว์ก่อน, ตัวเลือก, จำนวน, หมายเหตุ, ตะกร้าคงอยู่หลัง refresh, ล้างตะกร้าหลังส่ง) และครัวเห็นออเดอร์ทันทีโดยไม่ต้อง refresh
// วิธี: สร้างโต๊ะใหม่และเปิด QR ผ่าน API → ครัวเปิดบอร์ดรอไว้ → มือถือจำลอง iPhone สั่งข้าวผัดกุ้ง+ไข่ดาว 2 จาน (160) และน้ำ (รวม 170) → reload ตะกร้ายังอยู่ → ส่งเข้าครัว → เช็กหน้าสถานะและตะกร้าว่าง → เช็กว่าการ์ดโต๊ะโผล่ในคอลัมน์รอคิวของครัว
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
  await chooseOption(customer, 'radio', /กุ้ง/)
  await chooseOption(customer, 'checkbox', /ไข่ดาว/)
  await customer.getByRole('button', { name: 'เพิ่มจำนวน' }).click()
  await customer.getByPlaceholder(/พิมพ์เพิ่มเองได้/).fill('ไม่ใส่ผัก')
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
  // หัวตั๋วเป็น "โต๊ะ X" ต่อท้ายป้าย "ใหม่" ได้ — เทียบต้นข้อความแทนตรงตัว
  const queue = page.getByRole('region', { name: 'รอคิว', exact: true })
  await expect(
    queue.locator('article').filter({ has: page.getByText(new RegExp(`^โต๊ะ ${tableName}\\s*(ใหม่)?$`)) }),
  ).toBeVisible({ timeout: 10_000 })
  await customer.context().close()
})

// ทดสอบ: ลูกค้ากดเรียกพนักงานหรือแจ้งชำระเงินจากมือถือ แคชเชียร์ต้องเห็นป๊อปอัป และการ์ดโต๊ะขึ้น "ขอเช็คบิล" ทันทีโดยไม่ต้อง refresh และถ้ายังไม่สั่งอะไร หน้าบิลต้องบอกว่าไม่มีรายการ
// วิธี: สร้างโต๊ะใหม่ → cashier เปิดหน้า Check → ลูกค้าเปิดหน้าบิลตอนยังไม่สั่ง เช็กข้อความ → สั่งน้ำแล้วกดเรียกพนักงาน → cashier รับทราบป๊อปอัปของโต๊ะอื่นที่ค้างอยู่ก่อน จนเห็นของโต๊ะนี้ แล้วกดรับทราบ → ครัวเสิร์ฟน้ำผ่าน API → ลูกค้ากดแจ้งชำระเงิน + ยืนยัน → เช็กว่าปุ่มหายไป และการ์ดโต๊ะขึ้น "ขอเช็คบิล" กับ ฿10
test('เรียกพนักงาน/แจ้งชำระเงินจากมือถือ → แคชเชียร์เห็นป๊อปอัปและคำขอเช็คบิลโดยไม่ refresh', async ({
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

  // ลูกค้ากด "แจ้งชำระเงิน" + ยืนยัน ตอนน้ำยังไม่เสิร์ฟ → ปุ่มหายไป กดซ้ำไม่ได้
  await customer.getByRole('link', { name: 'เช็คบิลอาหาร' }).click()
  await expect(customer.getByText('รวมสุทธิ')).toBeVisible()
  await customer.getByRole('button', { name: 'แจ้งชำระเงิน' }).click()
  await customer.getByRole('dialog').getByRole('button', { name: 'ยืนยัน' }).click()
  await expect(customer.getByText('แจ้งพนักงานแล้วว่าต้องการชำระเงิน')).toBeVisible()
  await expect(customer.getByRole('button', { name: 'แจ้งชำระเงิน' })).toHaveCount(0)

  // ยังรอเสิร์ฟ → แคชเชียร์ต้องเห็น "ขอเช็คบิล" ทันที แต่ยังรับเงินไม่ได้
  await expect(tile.getByText('ขอเช็คบิล')).toBeVisible({ timeout: 10_000 })
  await expect(tile.getByText('รอเสิร์ฟ 1 ออเดอร์')).toBeVisible()
  await expect(tile.getByRole('button', { name: /^รับเงิน/ })).toHaveCount(0)

  // ครัวเสิร์ฟน้ำผ่าน API → การ์ดยังขึ้นขอเช็คบิล และรับเงินได้แล้ว
  const kitchen = await loginViaApi(request, 'kitchen', SEED_PASSWORD)
  const [waterOrder] = await (await request.get(`${API_URL}/public/sessions/${token}/orders`)).json()
  for (const status of ['PREPARING', 'SERVED']) {
    const res = await request.patch(`${API_URL}/orders/${waterOrder.id}/status`, {
      headers: { Authorization: `Bearer ${kitchen.accessToken}` },
      data: { status },
    })
    expect(res.ok()).toBe(true)
  }
  await expect(tile.getByRole('button', { name: /^รับเงิน/ })).toBeVisible({ timeout: 10_000 })
  await expect(tile.getByText('ขอเช็คบิล')).toBeVisible()
  await expect(tile.getByText('฿10')).toBeVisible()
  await customer.context().close()
})

// ทดสอบ: ลูกค้าเผลอแตะปุ่มส่งเข้าครัวสองครั้งติด ต้องได้ออเดอร์เดียว ไม่คิดเงินซ้ำ
// วิธี: สร้างโต๊ะใหม่ → มือถือใส่น้ำเปล่าลงตะกร้า → ดับเบิลคลิกปุ่มส่ง → รอ 1.5 วินาที → ดึงออเดอร์ของโต๊ะผ่าน API เช็กว่ามี 1 ใบ
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

// ทดสอบ: แอดมินเปลี่ยนราคาตอนที่ลูกค้ายังอยู่ในหน้าตะกร้า ตะกร้าต้องแสดงราคาใหม่เองและแจ้งลูกค้า และราคาที่คิดเงินจริงต้องเป็นราคาใหม่
// วิธี: สร้างโต๊ะ → มือถือใส่น้ำเปล่าลงตะกร้า → admin เพิ่มราคา 7 บาทผ่าน API → เช็กข้อความแจ้งและยอดรวมใหม่ → ส่งออเดอร์ เช็กว่า unitPrice ในออเดอร์เป็นราคาใหม่ → คืนราคาเดิม (ใน finally)
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

// ทดสอบ: ครัวปิดขายเมนูตอนที่อยู่ในตะกร้า ตะกร้าต้องขึ้น "หมดชั่วคราว" เอง ส่งไม่ได้จนกว่าจะเอาออก
// วิธี: สร้างโต๊ะ → มือถือใส่น้ำเปล่าลงตะกร้า → ครัวปิดขายผ่าน API → เช็กป้ายหมดชั่วคราวและปุ่มส่งกดไม่ได้ → กดเอาออก เช็กว่าตะกร้าว่าง → เปิดขายคืน (ใน finally)
test('เมนูถูกปิดขายระหว่างอยู่ในตะกร้า → ขึ้น "หมดชั่วคราว" ส่งไม่ได้จนกว่าจะเอาออก', async ({ browser, request }) => {
  const { token } = await openFreshTable(request)
  const kitchen = await loginViaApi(request, 'kitchen', SEED_PASSWORD)
  const headers = { Authorization: `Bearer ${kitchen.accessToken}` }
  const menu = await (await request.get(`${API_URL}/public/menu`)).json()
  const water = menu
    .flatMap((c: { menuItems: { id: string; name: string }[] }) => c.menuItems)
    .find((m: { name: string }) => m.name === 'น้ำเปล่า')

  const customer = await phone(browser)
  try {
    await customer.goto(`/t/${token}`)
    await customer.getByRole('link', { name: /^น้ำเปล่า น้ำเปล่า/ }).click()
    await customer.getByRole('button', { name: /เพิ่มรายการ/ }).click()
    await expect(customer.getByRole('heading', { name: 'รายการอาหาร' })).toBeVisible()

    const off = await request.patch(`${API_URL}/menu/${water.id}/availability`, { headers, data: { isAvailable: false } })
    expect(off.ok()).toBe(true)

    // ครัวปิดขาย → menu.updated → ตะกร้ารู้เองโดยไม่ refresh
    await expect(customer.getByText('หมดชั่วคราว', { exact: true })).toBeVisible()
    await expect(customer.getByRole('button', { name: '➤ ส่งรายการเข้าครัว' })).toBeDisabled()
    await customer.getByRole('button', { name: 'เอาออก' }).click()
    await expect(customer.getByText('ยังไม่มีรายการที่เลือก')).toBeVisible()
  } finally {
    await request.patch(`${API_URL}/menu/${water.id}/availability`, { headers, data: { isAvailable: true } })
    await customer.context().close()
  }
})

// ทดสอบ: ลูกค้าที่ยังไม่ได้สั่งอะไรต้องมีปุ่มเรียกพนักงานให้กดได้ (เช่น ถามเมนู ขอช้อนส้อม)
// วิธี: สร้างโต๊ะใหม่ → นับปุ่มเรียกพนักงานในหน้าเมนู และหน้าสถานะ (รอให้โหลดเสร็จก่อนนับ) → เช็กว่ารวมกันมากกว่า 0
test('ลูกค้าที่ยังไม่ได้สั่งอะไร ต้องเรียกพนักงานได้ (เช่น ถามเมนู/ขอช้อนส้อม)', async ({ browser, request }) => {
  const { token } = await openFreshTable(request)
  const customer = await phone(browser)
  await customer.goto(`/t/${token}`)
  await expect(customer.getByRole('searchbox', { name: 'ค้นหาเมนูอาหาร' })).toBeVisible()
  // ทั้งหน้าเมนูและหน้าสถานะ ต้องมีทางเรียกพนักงานอย่างน้อยหนึ่งทาง
  const onMenu = await customer.getByRole('button', { name: /เรียกพนักงาน/ }).count()
  await customer.goto(`/t/${token}/status`)
  // count() ไม่รอ — ต้องรอให้หน้าโหลดเสร็จก่อน ไม่งั้นนับตอนยัง "กำลังโหลด..."
  await expect(customer.getByRole('heading', { name: 'ติดตามสถานะออเดอร์' })).toBeVisible()
  const onStatus = await customer.getByRole('button', { name: /เรียกพนักงาน/ }).count()
  expect(onMenu + onStatus).toBeGreaterThan(0)
  await customer.context().close()
})

// ทดสอบ: เปิดลิงก์ QR ที่ผิดหรือของโต๊ะที่ปิดบิลแล้ว ต้องเห็นข้อความที่อ่านเข้าใจ ไม่ใช่หน้าขาว
// วิธี: มือถือเปิด token ที่ไม่มีอยู่ เช็กหัวข้อ "เปิดโต๊ะนี้ไม่ได้" → เปิด token โต๊ะที่ปิดแล้วจาก seed ทั้งหน้าเมนูและหน้าตะกร้า เช็กหัวข้อ "โต๊ะนี้ปิดบิลแล้ว"
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
