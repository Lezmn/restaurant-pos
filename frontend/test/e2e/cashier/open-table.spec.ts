import { test, expect, type Page } from '@playwright/test'
import { API_URL, checkTableTile, loginAsCashier, pickFreeTable, selectTable, tablesPageCard, tablesTile } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data ที่ localhost:3000
// เดิมสมมติว่าโต๊ะว่างครบ 6 โต๊ะ แต่ seed มีโต๊ะเปิดค้างไว้เป็นตัวอย่าง (โต๊ะ 2, 4)
// และเทสอื่นก็เปิดโต๊ะทิ้งไว้ได้ — จึงนับ "ก่อน/หลัง" เทียบกันแทนการ hardcode จำนวน
// และเปิดโต๊ะว่างตัวแรก (ไม่ fix โต๊ะ 1) เปิดจริงผ่าน UI จึงปิดคืนท้ายเทส
// ตัวเลข "จำนวนโต๊ะที่ว่าง" เป็นของทั้งร้าน — รันพร้อมเทสอื่นที่เปิด/ปิดโต๊ะ ตัวเลขขยับเองได้
// จึงเทียบกับจำนวนโต๊ะว่างจริงจาก API ณ ตอนนั้น แทนการเช็ก "ลดลง 1 พอดี"

/** จำนวนโต๊ะว่างจริงจาก API (นับแบบเดียวกับ EmployeeLayout) ด้วย cookie ของคนที่ login อยู่ */
async function availableFromApi(page: Page) {
  const res = await page.request.get(`${API_URL}/tables`)
  expect(res.ok()).toBe(true)
  const tables = (await res.json()) as { status: string }[]
  return tables.filter((t) => t.status === 'AVAILABLE').length
}

const shownAvailable = async (page: Page) =>
  Number((await page.getByText(/จำนวนโต๊ะที่ว่าง \d+ โต๊ะ/).innerText()).match(/\d+/)![0])

// ทดสอบ: เปิดโต๊ะแล้ว ป้ายสถานะเปลี่ยนเป็น "มีลูกค้า", จำนวนโต๊ะว่างบนหัวหน้าตรงกับของจริง และโต๊ะไปโผล่เป็นการ์ดในหน้า Check
// วิธี: cashier เปิดหน้า Check → ไปหน้าโต๊ะ สุ่มโต๊ะว่างแล้วกดเปิด → เช็ก QR dialog และป้าย "มีลูกค้า" → กลับหน้า Check เช็กว่าจำนวนโต๊ะว่างตรงกับ API (ไม่นับโต๊ะที่เพิ่งเปิด) และมีการ์ดโต๊ะนั้น → ปิดโต๊ะคืนตอนจบ แล้วเช็กว่าป้ายกลับเป็น "ว่าง"
test('cashier เปิดโต๊ะที่ 1 แล้วจำนวนโต๊ะว่างและรายการโต๊ะที่เปิดต้องถูกต้อง', async ({
  page,
  request,
}) => {
  // 1. login role Cashier
  await loginAsCashier(page, request)
  await page.goto('/employee/check')
  await expect(page).toHaveURL(/\/employee\/check$/)

  // 2. หัวหน้าบอกจำนวนโต๊ะว่าง
  await expect(page.getByText(/จำนวนโต๊ะที่ว่าง \d+ โต๊ะ/)).toBeVisible()

  // 3. กดแท็บ Table ที่แถบล่าง
  await page.getByRole('link', { name: 'โต๊ะ', exact: true }).click()
  await expect(page).toHaveURL(/\/employee\/tables$/)

  // 4. กดปุ่ม เปิดโต๊ะ/สร้าง QR ของโต๊ะว่างตัวแรก (เปิดสำเร็จจะเด้ง QR modal ขึ้นมาเอง)
  // สุ่มโต๊ะว่าง (หลาย worker เปิดโต๊ะพร้อมกัน ตัวแรกจะชนกัน)
  const tableCardText = await pickFreeTable(page)
  const tableName = tableCardText.replace(/^โต๊ะ\s*/, '')
  // การ์ดในผัง = ป้ายสถานะ / แผงรายละเอียด (หลังแตะการ์ด) = ปุ่มเปิด/ปิดโต๊ะ
  const table1Tile = tablesTile(page, tableCardText)
  const table1Panel = tablesPageCard(page, tableCardText)

  // ก่อนเปิดโต๊ะ badge สถานะต้องขึ้นว่า "ว่าง"
  await expect(table1Tile.getByText('ว่าง', { exact: true })).toBeVisible()

  await (await selectTable(page, tableCardText)).getByRole('button', { name: 'เปิดโต๊ะ/สร้าง QR' }).click()
  await expect(page.getByRole('dialog', { name: `QR โต๊ะ ${tableName}` })).toBeVisible()

  // เปิดโต๊ะสำเร็จแล้ว badge สถานะต้องเปลี่ยนเป็น "มีลูกค้า"
  await expect(table1Tile.getByText('มีลูกค้า', { exact: true })).toBeVisible()

  // 5. กดปุ่ม Check 2 ครั้ง — ครั้งแรกโดน overlay ของ QR modal บังอยู่ เลยแค่ปิด modal
  // ครั้งที่สอง modal ปิดแล้วถึงกดปุ่มนำทางไปหน้า Check ได้จริง
  const checkTab = page.getByRole('link', { name: 'รับเงิน', exact: true })
  await checkTab.click({ force: true })
  await checkTab.click()

  // 6. จำนวนโต๊ะว่างบนหัวหน้าต้องตรงกับของจริง (โต๊ะที่เพิ่งเปิดไม่นับแล้ว) และโต๊ะนั้นอยู่ในการ์ดโต๊ะที่เปิด
  await expect(page).toHaveURL(/\/employee\/check$/)
  await expect
    .poll(async () => (await shownAvailable(page)) === (await availableFromApi(page)), { timeout: 10_000 })
    .toBe(true)

  // โต๊ะที่เปิดอยู่แสดงเป็นการ์ด (หัวการ์ด "โต๊ะ {name}")
  await expect(checkTableTile(page, tableName)).toHaveCount(1)

  // เก็บกวาด: ปิดโต๊ะคืน (มี popup ยืนยัน) ให้จำนวนโต๊ะว่างกลับเท่าเดิม
  await page.goto('/employee/tables')
  await (await selectTable(page, tableCardText)).getByRole('button', { name: 'ปิดโต๊ะ' }).click()
  await page.getByRole('dialog', { name: 'ปิดโต๊ะ' }).getByRole('button', { name: 'ปิดโต๊ะ' }).click()
  await expect(
    table1Panel.getByRole('button', { name: 'เปิดโต๊ะ/สร้าง QR' }),
  ).toBeVisible()

  // ปิดโต๊ะแล้ว badge สถานะต้องกลับไปเป็น "ว่าง" เหมือนเดิม
  await expect(table1Tile.getByText('ว่าง', { exact: true })).toBeVisible()
})
