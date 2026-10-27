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
  // เทสอื่นปิดขายน้ำเปล่าชั่วคราวได้ (public-qr / qr-order-flow) — รอให้กลับมาขายก่อน
  let water: { id: string } | undefined
  await expect
    .poll(
      async () => {
        const menu = await (await request.get(`${API_URL}/public/menu`)).json()
        water = menu
          .flatMap((c: { menuItems: { id: string; name: string }[] }) => c.menuItems)
          .find((m: { name: string }) => m.name === 'น้ำเปล่า')
        return Boolean(water)
      },
      { timeout: 15_000 },
    )
    .toBe(true)
  const res = await request.post(`${API_URL}/public/orders`, {
    data: { sessionToken: session.token, items: [{ menuItemId: water!.id, quantity: 2 }] },
  })
  // สั่งไม่สำเร็จให้บอกสาเหตุตรง ๆ (เช่น 429 rate limit) แทน "อ่าน id ของ undefined"
  if (!res.ok()) throw new Error(`สร้างออเดอร์ทดสอบไม่สำเร็จ ${res.status()} ${await res.text()}`)
  const order = await res.json()
  return { tableName: String(table.number), token: session.token as string, orderRef: order.id.slice(0, 6).toUpperCase() }
}

// ทดสอบ: ครัวไล่สถานะออเดอร์ได้ครบ (รอคิว → กำลังปรุง → ทำเสร็จ → เคลียร์ออก), ลูกค้าเห็นสถานะเปลี่ยน และออเดอร์ที่เคลียร์แล้วไม่กลับมาหลัง refresh
// วิธี: สร้างโต๊ะและออเดอร์น้ำผ่าน API → ครัวกดเริ่มปรุงและทำเสร็จ เช็กว่าการ์ดย้ายคอลัมน์ → ลูกค้าเปิดหน้าสถานะเห็นออเดอร์ → ครัวกดทำเสร็จเรียบร้อย เช็กว่าการ์ดหาย → reload แล้วยังไม่มี
test('ครัวไล่สถานะ รอคิว → กำลังปรุง → ทำเสร็จ → เคลียร์ออกจากบอร์ด และลูกค้าเห็นสถานะเปลี่ยน', async ({
  page,
  request,
  browser,
}) => {
  const { token, orderRef } = await freshOrder(request)
  await loginAsKitchen(page, request)
  await page.goto('/employee/order')

  const card = (column: string) =>
    page.getByRole('region', { name: column, exact: true }).locator('article', { hasText: `#${orderRef}` })

  await card('รอคิว').getByRole('button', { name: 'เริ่มปรุง' }).click()
  await expect(card('กำลังปรุง')).toBeVisible()
  await card('กำลังปรุง').getByRole('button', { name: 'ทำเสร็จแล้ว' }).click()
  // ทำเสร็จแล้ว → ขึ้นคอลัมน์ "เสร็จแล้ว" พร้อมปุ่มยกเลิก 5 วิ แล้วค่อยบันทึกเป็นเสิร์ฟแล้ว
  await expect(card('เสร็จแล้ว')).toBeVisible()
  await expect(card('เสร็จแล้ว').getByRole('button', { name: 'เสิร์ฟแล้ว · เอาออก' })).toBeVisible({ timeout: 15_000 })

  // ลูกค้าเห็นว่าเสิร์ฟแล้ว
  const customer = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage()
  await customer.goto(`/t/${token}/status`)
  await expect(customer.getByText(`ออเดอร์ #${orderRef}`)).toBeVisible()

  await card('เสร็จแล้ว').getByRole('button', { name: 'เสิร์ฟแล้ว · เอาออก' }).click()
  await expect(page.locator('article', { hasText: `#${orderRef}` })).toHaveCount(0)
  // รีเฟรชแล้วต้องไม่กลับมา (เก็บใน DB ไม่ใช่ state ในจอ)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'รอคิว' })).toBeVisible()
  await expect(page.locator('article', { hasText: `#${orderRef}` })).toHaveCount(0)
  await customer.context().close()
})

// ทดสอบ: ครัวปิดวัตถุดิบ "ไข่" แล้วข้าวไข่เจียวต้องหายจากหน้าลูกค้าที่เปิดค้างไว้เอง และพอเปิดคืนเมนูก็กลับมา
// วิธี: ลูกค้าเปิดหน้าเมนูรอไว้ เห็นข้าวไข่เจียว → ครัวไปแท็บวัตถุดิบ กดสวิตช์ไข่ปิด → เช็ก toast "ไข่: ของหมด" และเมนูหายจากหน้าลูกค้า → เปิดสวิตช์คืน (ใน finally) → เช็กว่าเมนูกลับมา
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

// ทดสอบ: KITCHEN เข้าหน้าจัดการเมนูได้ เปิด/ปิดขายเมนูและสลับมีของ/หมดได้จริง แต่ไม่เห็นปุ่มเพิ่ม/แก้เมนู หรือเพิ่ม/ลบวัตถุดิบ
// วิธี: admin สร้างเมนูทดสอบผ่าน API → kitchen เปิด /employee/manage เช็กว่าไม่มีปุ่มเพิ่ม/แก้ไข → กดสวิตช์ปิดแล้วเปิดขาย รอ response ทีละครั้งต้องได้ 200 → แท็บวัตถุดิบเห็นสวิตช์ แต่ไม่มีปุ่มเพิ่ม/ลบ → ลบเมนูทดสอบตอนจบ
test('KITCHEN เข้าหน้า Manage ได้: เปิด/ปิดขายเมนูได้จริง แต่ไม่เห็นปุ่มเพิ่ม/แก้เมนู หรือเพิ่ม/ลบวัตถุดิบ', async ({
  page,
  request,
}) => {
  // เมนูของเทสนี้เอง — ปิดขายน้ำเปล่าของ seed จะทำให้เทสอื่นที่สั่งน้ำพร้อมกันพัง
  const admin = await loginViaApi(request, 'admin', SEED_PASSWORD)
  const adminHeaders = { Authorization: `Bearer ${admin.accessToken}` }
  const [category] = await (await request.get(`${API_URL}/categories`, { headers: adminHeaders })).json()
  const menuName = `สวิตช์ครัว ${Date.now().toString(36)}`
  const menu = await (
    await request.post(`${API_URL}/menu`, {
      headers: adminHeaders,
      data: { name: menuName, price: 1, categoryId: category.id },
    })
  ).json()

  await loginAsKitchen(page, request)
  await page.goto('/employee/manage')
  await expect(page.getByRole('heading', { name: 'จัดการเมนู' })).toBeVisible()
  // POST/PATCH/DELETE /menu เป็น @Roles(ADMIN) — ถ้า KITCHEN เห็นปุ่มพวกนี้ กดแล้วจะเจอ 403
  await expect(page.getByRole('button', { name: 'เพิ่มเมนู', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'แก้ไข' })).toHaveCount(0)

  // ปิดขาย/เปิดขายใช้ PATCH /menu/:id/availability @Roles(ADMIN, KITCHEN) — ต้องสำเร็จ ไม่ใช่ 403
  const water = page.getByRole('switch', { name: `เปิดขาย ${menuName}` })
  await expect(water).toBeChecked()
  // สวิตช์หน่วง 600ms แล้วบันทึกเฉพาะค่าสุดท้าย (กดปิดแล้วเปิดกลับทันที = ไม่ยิงเลย) — รอผลทีละครั้ง
  const saved = () => page.waitForResponse((res) => res.url().includes('/availability'))
  const [off] = await Promise.all([saved(), water.click()])
  expect(off.status()).toBe(200)
  await expect(water).not.toBeChecked()
  const [on] = await Promise.all([saved(), water.click()])
  expect(on.status()).toBe(200)
  await expect(water).toBeChecked()

  // แท็บวัตถุดิบ: สลับมีของ/หมดได้ แต่เพิ่ม/ลบไม่ได้
  await page.getByRole('button', { name: 'วัตถุดิบ', exact: true }).click()
  await expect(page.getByRole('switch', { name: /^มีของ / }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'เพิ่มวัตถุดิบ' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'ลบ', exact: true })).toHaveCount(0)

  await request.delete(`${API_URL}/menu/${menu.id}`, { headers: adminHeaders })
})

// ทดสอบ: จอครัวต้องไม่เรียก API คำขอจากลูกค้า (/service-requests) ที่ครัวไม่มีสิทธิ์ จะได้ไม่มี 403 เต็ม console
// วิธี: ดักนับ response จาก API /service-requests → kitchen เปิด /employee/order → สร้างออเดอร์ใหม่ให้มี socket event → รอ 2 วินาที → เช็กว่าไม่มีการเรียกเลย
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
