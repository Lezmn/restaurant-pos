import { test, expect, type APIRequestContext } from '@playwright/test'
import { API_URL, checkTableTile, loginAsCashier, loginViaApi } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data (DB ทดสอบเท่านั้น — เก็บเงินจริง)
// แยกบิลในหน้ารับเงิน: "เลือกรายการ" แล้ว "หารเท่ากัน" ส่วนที่เหลือ
test.use({ viewport: { width: 1024, height: 768 } })

const SEED_PASSWORD = 'ChangeMe123!'

async function api(request: APIRequestContext, role: 'admin' | 'staff' | 'kitchen') {
  const { accessToken } = await loginViaApi(request, role, SEED_PASSWORD)
  return { Authorization: `Bearer ${accessToken}` }
}

/** โต๊ะใหม่ + น้ำ 4 ขวด (40) และข้าวผัดหมู 1 จาน (50) เสิร์ฟแล้ว = 90 */
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
  const water = menu.find((m) => m.name === 'น้ำเปล่า')!
  const pork = rice.options.find((o) => o.name === 'หมู')!
  const order = await (
    await request.post(`${API_URL}/public/orders`, {
      data: {
        sessionToken: session.token,
        items: [
          { menuItemId: water.id, quantity: 4 },
          { menuItemId: rice.id, quantity: 1, optionIds: [pork.id] },
        ],
      },
    })
  ).json()
  for (const status of ['PREPARING', 'SERVED']) {
    await request.patch(`${API_URL}/orders/${order.id}/status`, { headers: kitchen, data: { status } })
  }
  return { tableName: String(table.number) }
}

test('เลือกรายการจ่ายน้ำ 1 ขวด แล้วหาร 2 คนที่เหลือ — ใบเสร็จบอกส่วนที่ และโต๊ะปิดเมื่อจ่ายครบ', async ({ page, request }) => {
  const { tableName } = await servedTable(request)
  await loginAsCashier(page, request)
  await page.goto('/employee/check')

  const tile = checkTableTile(page, tableName)
  await tile.getByRole('button', { name: /^รับเงิน/ }).click()
  const dialog = page.getByRole('dialog', { name: `รับเงิน โต๊ะ ${tableName}` })

  // 1) เลือกรายการ: น้ำ 1 ขวด = ฿10
  await dialog.getByRole('button', { name: 'เลือกรายการ' }).click()
  await dialog.getByRole('group', { name: 'จำนวน น้ำเปล่า ที่จ่าย' }).getByRole('button', { name: 'เพิ่มจำนวน' }).click()
  await dialog.getByRole('button', { name: 'รับเงิน ฿10' }).click()

  const receipt = page.getByRole('dialog', { name: 'ใบเสร็จรับเงิน' })
  await expect(receipt.getByText('1× น้ำเปล่า')).toBeVisible()
  await receipt.getByRole('button', { name: 'ปิด', exact: true }).click()

  // เหลือ 80 ในโต๊ะ
  await expect(tile.getByText('฿80')).toBeVisible()

  // 2) หารเท่ากัน 2 คน = คนละ ฿40
  await tile.getByRole('button', { name: /^รับเงิน/ }).click()
  await dialog.getByRole('button', { name: 'หารเท่ากัน' }).click()
  await expect(dialog.getByText('คนที่ 1 จาก 2')).toBeVisible()
  await dialog.getByRole('button', { name: 'รับเงิน ฿40' }).click()
  await expect(receipt.getByText('หาร 2 คน · ส่วนที่ 1')).toBeVisible()
  await receipt.getByRole('button', { name: 'ปิด', exact: true }).click()

  // การ์ดโต๊ะบอกความคืบหน้า และปุ่มเป็นคนที่ 2
  await expect(tile.getByText('หาร 2 คน · จ่ายแล้ว 1 คน')).toBeVisible()
  await tile.getByRole('button', { name: /^รับเงิน/ }).click()
  // ระหว่างหาร ล็อกโหมด — ไม่มีปุ่มเลือกแบบเก็บเงินแล้ว
  await expect(dialog.getByRole('button', { name: 'เลือกรายการ' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'รับเงิน ฿40' }).click()
  await expect(receipt.getByText('หาร 2 คน · ส่วนที่ 2')).toBeVisible()
  await receipt.getByRole('button', { name: 'ปิด', exact: true }).click()

  // จ่ายครบ → โต๊ะปิดหายจากหน้า Check
  await expect(tile).toHaveCount(0)
})
