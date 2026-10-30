import { test, expect, type APIRequestContext } from '@playwright/test'
import { API_URL, loginAsKitchen, loginViaApi } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data (DB ทดสอบเท่านั้น — สร้างโต๊ะ/ออเดอร์จริง)
// แท็บกรองบนจอครัว (OrderPage.tsx): ทั้งหมด / ทานที่ร้าน / กลับบ้าน

const SEED_PASSWORD = 'ChangeMe123!'

/** สร้างออเดอร์น้ำเปล่า 1 ใบ แบบทานที่ร้าน (โต๊ะใหม่) และกลับบ้าน (บิลกลับบ้านใหม่) คืนเลขอ้างอิงที่ตั๋วโชว์ */
async function freshOrders(request: APIRequestContext) {
  const admin = await loginViaApi(request, 'admin', SEED_PASSWORD)
  const headers = { Authorization: `Bearer ${admin.accessToken}` }
  const menu = await (await request.get(`${API_URL}/public/menu`)).json()
  const water = menu
    .flatMap((c: { menuItems: { id: string; name: string }[] }) => c.menuItems)
    .find((m: { name: string }) => m.name === 'น้ำเปล่า')
  if (!water) throw new Error('ไม่พบเมนูน้ำเปล่าใน seed')

  const table = await (
    await request.post(`${API_URL}/tables`, {
      headers,
      data: { number: 500 + Math.floor(Math.random() * 9_000_000), seats: 2 },
    })
  ).json()
  const session = await (
    await request.post(`${API_URL}/table-sessions`, { headers, data: { tableId: table.id } })
  ).json()
  const dineRes = await request.post(`${API_URL}/public/orders`, {
    data: { sessionToken: session.token, items: [{ menuItemId: water.id, quantity: 1 }] },
  })
  if (!dineRes.ok()) throw new Error(`สร้างออเดอร์ทานที่ร้านไม่สำเร็จ ${dineRes.status()} ${await dineRes.text()}`)

  const takeRes = await request.post(`${API_URL}/orders/takeaway`, {
    headers,
    data: { items: [{ menuItemId: water.id, quantity: 1 }] },
  })
  if (!takeRes.ok()) throw new Error(`สร้างออเดอร์กลับบ้านไม่สำเร็จ ${takeRes.status()} ${await takeRes.text()}`)

  const ref = (o: { id: string }) => o.id.slice(0, 6).toUpperCase()
  return { dineRef: ref(await dineRes.json()), takeRef: ref(await takeRes.json()) }
}

// ทดสอบ: แท็บ "กลับบ้าน" เหลือแต่ตั๋วกลับบ้าน, "ทานที่ร้าน" เหลือแต่ตั๋วโต๊ะ, "ทั้งหมด" เห็นทั้งคู่
// วิธี: สร้างออเดอร์ทานที่ร้าน 1 + กลับบ้าน 1 ผ่าน API → ครัวเปิดบอร์ด → กดสลับแท็บ เช็กว่าตั๋วของแต่ละใบโผล่/หายตามแท็บ และปุ่มแท็บที่เลือกมี aria-pressed
test('แท็บกรองบนจอครัว: กลับบ้าน / ทานที่ร้าน / ทั้งหมด แสดงตั๋วตามประเภท', async ({ page, request }) => {
  const { dineRef, takeRef } = await freshOrders(request)
  await loginAsKitchen(page, request)
  await page.goto('/employee/order')

  const ticket = (ref: string) => page.locator('article', { hasText: `#${ref}` })
  const tab = (label: string) => page.getByRole('button', { name: new RegExp(`^${label} \\d+$`) })

  await expect(ticket(dineRef)).toBeVisible()
  await expect(ticket(takeRef)).toBeVisible()
  await expect(tab('ทั้งหมด')).toHaveAttribute('aria-pressed', 'true')

  await tab('กลับบ้าน').click()
  await expect(tab('กลับบ้าน')).toHaveAttribute('aria-pressed', 'true')
  await expect(ticket(takeRef)).toBeVisible()
  await expect(ticket(dineRef)).toHaveCount(0)

  await tab('ทานที่ร้าน').click()
  await expect(ticket(dineRef)).toBeVisible()
  await expect(ticket(takeRef)).toHaveCount(0)

  await tab('ทั้งหมด').click()
  await expect(ticket(dineRef)).toBeVisible()
  await expect(ticket(takeRef)).toBeVisible()
})
