import { test, expect, type APIRequestContext } from '@playwright/test'
import { API_URL, checkTableTile, loginAsAdmin, loginAsCashier, loginViaApi, paidBillsTable } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data (DB ทดสอบเท่านั้น — เก็บเงินและยกเลิกบิลจริง)
// ประวัติการทำรายการ: ลดราคา → ยกเลิกบิล → เจ้าของเห็นทั้งสองรายการ พร้อมชื่อบัญชี
test.use({ viewport: { width: 1280, height: 900 } })

const SEED_PASSWORD = 'ChangeMe123!'

async function api(request: APIRequestContext, role: 'admin' | 'staff' | 'kitchen') {
  const { accessToken } = await loginViaApi(request, role, SEED_PASSWORD)
  return { Authorization: `Bearer ${accessToken}` }
}

/** โต๊ะใหม่ + น้ำ 10 ขวด (100) เสิร์ฟแล้ว */
async function servedTable(request: APIRequestContext) {
  const admin = await api(request, 'admin')
  const kitchen = await api(request, 'kitchen')
  const table = await (
    await request.post(`${API_URL}/tables`, { headers: admin, data: { number: 500 + Math.floor(Math.random() * 9_000_000) } })
  ).json()
  const session = await (await request.post(`${API_URL}/table-sessions`, { headers: admin, data: { tableId: table.id } })).json()
  const menu = (await (await request.get(`${API_URL}/public/menu`)).json()).flatMap(
    (c: { menuItems: unknown[] }) => c.menuItems,
  ) as { id: string; name: string }[]
  const water = menu.find((m) => m.name === 'น้ำเปล่า')!
  const order = await (
    await request.post(`${API_URL}/public/orders`, {
      data: { sessionToken: session.token, items: [{ menuItemId: water.id, quantity: 10 }] },
    })
  ).json()
  for (const status of ['PREPARING', 'SERVED']) {
    await request.patch(`${API_URL}/orders/${order.id}/status`, { headers: kitchen, data: { status } })
  }
  return { tableName: String(table.number) }
}

test('ลด 10% → ยกเลิกบิล → หน้าประวัติแสดงทั้งสองรายการพร้อมชื่อบัญชี', async ({ page, request }) => {
  const { tableName } = await servedTable(request)
  await loginAsCashier(page, request)
  await page.goto('/employee/check')

  // รับเงินลด 10%: 100 → 90
  await checkTableTile(page, tableName).getByRole('button', { name: /^รับเงิน/ }).click()
  const dialog = page.getByRole('dialog', { name: `รับเงิน โต๊ะ ${tableName}` })
  await dialog.getByRole('button', { name: 'ให้ส่วนลด' }).click()
  await dialog.getByRole('button', { name: '10%' }).click()
  await expect(dialog.getByText('เก็บจริง ฿90')).toBeVisible()
  await dialog.getByLabel(/เหตุผลที่ลด/).fill('ทดสอบประวัติ')
  await dialog.getByRole('button', { name: 'รับเงิน ฿90' }).click()

  const receipt = page.getByRole('dialog', { name: 'ใบเสร็จรับเงิน' })
  await expect(receipt.getByText('ส่วนลด 10%', { exact: true })).toBeVisible()
  await receipt.getByRole('button', { name: 'ปิด', exact: true }).click()

  // ยกเลิกบิลนี้ (เพิ่งจ่าย ยังอยู่ใน 1 ชม.)
  const row = paidBillsTable(page).locator('tr', { hasText: tableName }).first()
  await row.getByRole('button', { name: 'ยกเลิกบิล' }).click()
  const voidDialog = page.getByRole('dialog', { name: 'ยกเลิกบิล' })
  await voidDialog.getByRole('textbox').fill('ทดสอบยกเลิก')
  await voidDialog.getByRole('button', { name: 'ยืนยันยกเลิกบิล' }).click()
  await expect(row.getByText('ยกเลิกแล้ว')).toBeVisible()

  // เจ้าของเปิดดูประวัติ
  await loginAsAdmin(page, request)
  await page.goto('/owner/audit')
  // กรองด้วยเลขโต๊ะของรอบนี้ — DB ที่รันเทสต์ซ้ำมีรายการ "ลด 10%" ของรอบก่อน ๆ ปนอยู่
  const list = page.getByRole('listitem').filter({ hasText: `โต๊ะ ${tableName}` })
  await expect(list.filter({ hasText: 'ลดราคา' }).filter({ hasText: 'ลด 10%' })).toBeVisible()
  await expect(list.filter({ hasText: 'ยกเลิกบิล' }).filter({ hasText: 'ทดสอบยกเลิก' })).toBeVisible()
  // โชว์แค่ชื่อบัญชี ไม่มีชื่อเครื่อง
  await expect(list.filter({ hasText: 'ทดสอบยกเลิก' })).toContainText('Staff')
  await expect(page.getByText(/เครื่องไม่มีชื่อ/)).toHaveCount(0)
})

test('STAFF อ่านประวัติการทำรายการไม่ได้ (403)', async ({ request }) => {
  const staff = await api(request, 'staff')
  expect((await request.get(`${API_URL}/audit-logs`, { headers: staff })).status()).toBe(403)
  const admin = await api(request, 'admin')
  expect((await request.get(`${API_URL}/audit-logs`, { headers: admin })).status()).toBe(200)
})
