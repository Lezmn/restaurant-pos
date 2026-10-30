import { test, expect, devices, type Browser, type APIRequestContext } from '@playwright/test'
import { API_URL, loginViaApi, openCart } from '../helpers'
import { customerOrder, menuItemByName, tokens, call, ok } from '../api/api-helpers'

// ⚠️ ต้องรัน backend จริง + seed data (DB ทดสอบเท่านั้น — เทสต์นี้สร้างโต๊ะ/ออเดอร์จริง)
// เคสลูกค้าสแกน QR ที่เหลือ: ค้นหา/กรองเมนู, แก้ตะกร้า, ออเดอร์ที่ถูกยกเลิก, สรุปบิล (TC-019/020/028/029/030/036/040)

const SEED_PASSWORD = 'ChangeMe123!'

async function openFreshTable(request: APIRequestContext) {
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
  const session = await (await request.post(`${API_URL}/table-sessions`, { headers, data: { tableId: table.id } })).json()
  return { tableName: String(table.number), token: session.token as string }
}

async function phone(browser: Browser) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 375, height: 812 } })
  return ctx.newPage()
}

// ทดสอบ: ค้นหาเมนูตามชื่อ และกรองตามหมวด (TC-019, TC-020)
// วิธี: เปิดหน้าเมนูของโต๊ะใหม่ → พิมพ์ "ข้าวผัด" เห็นข้าวผัดแต่ไม่เห็นน้ำเปล่า → พิมพ์ชื่อที่ไม่มี เห็น "ไม่พบเมนูที่ค้นหา" → ล้างคำค้น กดหมวดแรกเห็นเฉพาะเมนูในหมวดนั้น → กด "ทั้งหมด" เมนูกลับมา
test('ค้นหาเมนู และกรองตามหมวดในหน้าเมนูของลูกค้า', async ({ browser, request }) => {
  const { token } = await openFreshTable(request)
  const customer = await phone(browser)
  await customer.goto(`/t/${token}`)
  const search = customer.getByRole('searchbox', { name: 'ค้นหาเมนูอาหาร' })
  const rice = customer.getByRole('link', { name: /^ข้าวผัด ข้าวผัด/ })
  const water = customer.getByRole('link', { name: /^น้ำเปล่า น้ำเปล่า/ })
  await expect(rice).toBeVisible()
  await expect(water).toBeVisible()

  await search.fill('ข้าวผัด')
  await expect(rice).toBeVisible()
  await expect(water).toHaveCount(0)

  await search.fill('เมนูที่ไม่มีอยู่จริง-xyz')
  await expect(customer.getByText('ไม่พบเมนูที่ค้นหา')).toBeVisible()

  await search.fill('')
  const categories = await (await request.get(`${API_URL}/public/menu`)).json()
  const first = categories.find((c: { menuItems: unknown[] }) => c.menuItems.length > 0)
  const other = categories.find((c: { id: string; menuItems: { name: string }[] }) => c.id !== first.id && c.menuItems.length > 0)
  await customer.getByRole('button', { name: first.name, exact: true }).click()
  await expect(customer.getByRole('link', { name: new RegExp(`^${first.menuItems[0].name} `) }).first()).toBeVisible()
  if (other) {
    await expect(customer.getByRole('link', { name: new RegExp(`^${other.menuItems[0].name} `) })).toHaveCount(0)
  }
  await customer.getByRole('button', { name: 'ทั้งหมด', exact: true }).click()
  await expect(rice).toBeVisible()
  await expect(water).toBeVisible()
  await customer.context().close()
})

// ทดสอบ: แก้ตะกร้าได้ — เพิ่ม/ลดจำนวน, ลดเหลือ 0 = เอารายการออก, ยกเลิกทั้งหมด (TC-028, TC-029, TC-030)
// วิธี: ใส่น้ำเปล่าลงตะกร้า → กดเพิ่มจำนวนเป็น 2 เช็กยอดเป็นสองเท่า → กดลดกลับเป็น 1 ยอดเท่าเดิม → ลดเป็น 0 รายการหาย ตะกร้าว่าง → ใส่ใหม่อีกรอบ กด "ยกเลิกทั้งหมด" ตะกร้าว่าง และ reload แล้วยังว่าง
test('ตะกร้า: เพิ่ม/ลดจำนวน เอารายการออก และยกเลิกทั้งหมด', async ({ browser, request }) => {
  const { token } = await openFreshTable(request)
  const water = await menuItemByName(request, 'น้ำเปล่า')
  const customer = await phone(browser)
  await customer.goto(`/t/${token}`)
  const addWater = async () => {
    await customer.goto(`/t/${token}`)
    await customer.getByRole('link', { name: /^น้ำเปล่า น้ำเปล่า/ }).click()
    await customer.getByRole('button', { name: /เพิ่มรายการ/ }).click()
    await openCart(customer)
    await expect(customer.getByRole('heading', { name: 'รายการอาหาร' })).toBeVisible()
  }
  const total = customer.getByText('ยอดรวมรายการอาหาร').locator('..')
  const empty = customer.getByText('ยังไม่มีรายการที่เลือก')

  await addWater()
  await expect(total).toContainText(String(water.price))
  await customer.getByRole('button', { name: 'เพิ่มจำนวน' }).click()
  await expect(total).toContainText(String(water.price * 2))
  await customer.getByRole('button', { name: 'ลดจำนวน' }).click()
  await expect(total).toContainText(String(water.price))
  await expect(total).not.toContainText(String(water.price * 2))
  await customer.getByRole('button', { name: 'ลดจำนวน' }).click()
  await expect(empty).toBeVisible()

  await addWater()
  await customer.getByRole('button', { name: 'ยกเลิกทั้งหมด' }).click()
  await expect(empty).toBeVisible()
  await customer.reload()
  await expect(empty).toBeVisible()
  await customer.context().close()
})

// ทดสอบ: ครัวยกเลิกออเดอร์ → ลูกค้าเห็นข้อความแจ้งชัดเจน และบิลไม่รวมออเดอร์ที่ยกเลิก (TC-036, TC-040)
// วิธี: สั่งน้ำ 2 ใบผ่าน API (ใบละ 1 ขวด) → ครัวยกเลิกใบแรก → หน้าสถานะขึ้น "ถูกยกเลิก" และ "ไม่คิดเงิน" → หน้าบิลเห็นรายการ 1 ขวด ขึ้น "1 ออเดอร์ที่ถูกยกเลิก" และยอดรวมสุทธิเท่าราคาน้ำ 1 ขวด
test('ครัวยกเลิกออเดอร์ → ลูกค้าเห็นแจ้งเตือน และสรุปบิลไม่รวมออเดอร์ที่ยกเลิก', async ({ browser, request }) => {
  const { token } = await openFreshTable(request)
  const t = await tokens(request)
  const water = await menuItemByName(request, 'น้ำเปล่า')
  const first = await customerOrder(request, token, [{ menuItemId: water.id, quantity: 1 }])
  await customerOrder(request, token, [{ menuItemId: water.id, quantity: 1 }])
  await ok(await call(request, 'PATCH', `/orders/${first.id}/status`, { token: t.KITCHEN, data: { status: 'CANCELLED' } }))

  const customer = await phone(browser)
  await customer.goto(`/t/${token}/status`)
  const alert = customer.getByRole('alert').filter({ hasText: 'ถูกยกเลิก' })
  await expect(alert).toContainText(`#${first.id.slice(0, 6).toUpperCase()}`)
  await expect(alert).toContainText('จะไม่คิดเงิน')

  await customer.goto(`/t/${token}/bill`)
  await expect(customer.getByRole('heading', { name: 'สรุปรายการอาหาร' })).toBeVisible()
  await expect(customer.getByText('มี 1 ออเดอร์ที่ถูกยกเลิก')).toBeVisible()
  await expect(customer.getByText('รวมสุทธิ').locator('..')).toContainText(String(water.price))
  await expect(customer.getByText('รวมสุทธิ').locator('..')).not.toContainText(String(water.price * 2))
  await customer.context().close()
})

// ทดสอบ: เมนูที่ไม่บังคับเนื้อสัตว์ (ข้าวไข่เจียว) เพิ่มลงตะกร้าได้เลยโดยไม่ต้องเลือกตัวเลือก (TC-025)
// วิธี: เปิดหน้าเมนูของโต๊ะใหม่ → กดข้าวไข่เจียว → ปุ่ม "เพิ่มรายการ" กดได้ทันที (ไม่ขึ้น "กรุณาเลือกเนื้อสัตว์") → กดแล้วตะกร้ามีรายการนี้
test('เมนูที่ไม่บังคับเนื้อสัตว์ (ข้าวไข่เจียว) เพิ่มลงตะกร้าได้โดยไม่เลือกตัวเลือก', async ({ browser, request }) => {
  const { token } = await openFreshTable(request)
  const customer = await phone(browser)
  await customer.goto(`/t/${token}`)
  await customer.getByRole('link', { name: /^ข้าวไข่เจียว/ }).click()
  await expect(customer.getByRole('button', { name: /กรุณาเลือกเนื้อสัตว์/ })).toHaveCount(0)
  const add = customer.getByRole('button', { name: /เพิ่มรายการ/ })
  await expect(add).toBeEnabled()
  await add.click()
  await openCart(customer)
  await expect(customer.getByRole('heading', { name: 'รายการอาหาร' })).toBeVisible()
  await expect(customer.getByText('ข้าวไข่เจียว').first()).toBeVisible()
  await customer.context().close()
})
