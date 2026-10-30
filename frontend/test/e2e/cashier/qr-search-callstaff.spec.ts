import { test, expect, type APIRequestContext } from '@playwright/test'
import { API_URL, checkTableTile, loginAsCashier, loginViaApi, pickFreeTable, selectTable } from '../helpers'
import { customerOrder, menuItemByName } from '../api/api-helpers'

// ⚠️ ต้องรัน backend จริง + seed data (DB ทดสอบเท่านั้น — สร้างโต๊ะ/ออเดอร์/คำขอเรียกพนักงานจริง)
// เคสฝั่งแคชเชียร์ที่เหลือ: คัดลอกลิงก์ QR, ค้นหาเลขโต๊ะ, ป๊อปอัปเรียกพนักงานหลายโต๊ะ (TC-071/077/101)
test.use({ viewport: { width: 1280, height: 900 } })
test.describe.configure({ timeout: 60_000 })

const SEED_PASSWORD = 'ChangeMe123!'

async function freshTable(request: APIRequestContext) {
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
  // เปิดโต๊ะไม่สำเร็จเป็นครั้งคราวตอนรันขนาน (ไม่เช็ก ok จะได้ token ว่างแล้วไปพังที่ขั้นสั่งอาหาร) — เช็กและลองใหม่
  let lastError = ''
  for (let i = 0; i < 3; i++) {
    const res = await request.post(`${API_URL}/table-sessions`, { headers, data: { tableId: table.id } })
    if (res.ok()) return { tableName: String(table.number), token: (await res.json()).token as string }
    lastError = `${res.status()} ${await res.text()}`
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`เปิดโต๊ะไม่สำเร็จ ${lastError}`)
}

// ทดสอบ: กด "คัดลอกลิงก์" ในกล่อง QR แล้วปุ่มเปลี่ยนเป็น "คัดลอกแล้ว" และค่าใน clipboard คือลิงก์หน้าเมนูของโต๊ะ (TC-071)
// วิธี: ขอสิทธิ์ clipboard → เปิดโต๊ะว่างจากหน้าโต๊ะ → กล่อง QR เด้ง → กดคัดลอกลิงก์ → เช็กข้อความปุ่ม และอ่าน clipboard ต้องตรงกับช่องลิงก์ในกล่องและขึ้นต้น /t/
test('คัดลอกลิงก์ QR: ปุ่มเปลี่ยนเป็น "คัดลอกแล้ว" และ clipboard ได้ลิงก์เมนูของโต๊ะ', async ({ page, context, request }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await loginAsCashier(page, request)
  await page.goto('/employee/tables')
  const tableCardText = await pickFreeTable(page)
  const panel = await selectTable(page, tableCardText)
  await panel.getByRole('button', { name: 'เปิดโต๊ะ/สร้าง QR' }).click()
  const qr = page.getByRole('dialog', { name: /^QR โต๊ะ/ })
  await expect(qr).toBeVisible()

  await qr.getByRole('button', { name: 'คัดลอกลิงก์' }).click()
  await expect(qr.getByRole('button', { name: 'คัดลอกแล้ว' })).toBeVisible()
  const shown = await qr.locator('input[readonly]').inputValue()
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  expect(copied).toBe(shown)
  expect(new URL(copied).pathname).toMatch(/^\/t\/.+/)
})

// ทดสอบ: ค้นหาเลขโต๊ะในหน้า Check เหลือเฉพาะโต๊ะนั้น และเลขที่ไม่มีขึ้น "ไม่พบโต๊ะ" (TC-077)
// วิธี: สร้างโต๊ะใหม่ + สั่งน้ำ 1 ขวดผ่าน API → cashier เปิดหน้า Check → พิมพ์เลขโต๊ะ เห็นการ์ดโต๊ะนั้น → พิมพ์เลขที่ไม่มี เห็น "ไม่พบโต๊ะ" และการ์ดหาย
test('หน้า Check: ค้นหาเลขโต๊ะ เหลือโต๊ะนั้น และเลขที่ไม่มีขึ้น "ไม่พบโต๊ะ"', async ({ page, request }) => {
  const { tableName, token } = await freshTable(request)
  const water = await menuItemByName(request, 'น้ำเปล่า')
  await customerOrder(request, token, [{ menuItemId: water.id, quantity: 1 }])

  await loginAsCashier(page, request)
  await page.goto('/employee/check')
  const search = page.getByPlaceholder('ค้นหาเลขโต๊ะ')
  await search.fill(tableName)
  await expect(checkTableTile(page, tableName)).toBeVisible()

  await search.fill('99999999')
  await expect(page.getByText('ไม่พบโต๊ะ')).toBeVisible()
  await expect(checkTableTile(page, tableName)).toHaveCount(0)
})

// ทดสอบ: 2 โต๊ะกดเรียกพนักงานพร้อมกัน ป๊อปอัปขึ้นทีละโต๊ะ บอกว่ายังค้างอีก 1 โต๊ะ กดรับทราบแล้วขึ้นโต๊ะถัดไป (TC-101)
// วิธี: สร้าง 2 โต๊ะ + ลูกค้าแต่ละโต๊ะเรียกพนักงาน → cashier เปิดหน้า Check (ให้หน้าเห็นเฉพาะคำขอของ 2 โต๊ะนี้) → ป๊อปอัปแรกมีข้อความ "ค้างอยู่อีก 1 โต๊ะ" → กดรับทราบ → ป๊อปอัปเป็นอีกโต๊ะ ไม่มีข้อความค้าง → กดรับทราบ ป๊อปอัปหาย
test('เรียกพนักงาน 2 โต๊ะพร้อมกัน: ป๊อปอัปขึ้นทีละโต๊ะ และบอกว่าค้างอีก 1 โต๊ะ', async ({ page, request }) => {
  const a = await freshTable(request)
  const b = await freshTable(request)
  const mine = new Set([a.tableName, b.tableName])
  for (const t of [a, b]) {
    const res = await request.post(`${API_URL}/public/call-staff`, { data: { sessionToken: t.token } })
    expect(res.ok()).toBe(true)
  }

  const origin = new URL(API_URL).origin
  await page.route((url) => url.origin === origin && url.pathname === '/service-requests', async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    try {
      const res = await route.fetch()
      const all = (await res.json()) as { table?: { number: number } }[]
      await route.fulfill({ response: res, json: all.filter((r) => mine.has(String(r.table?.number))) })
    } catch {
      // หน้าปิดไปแล้ว
    }
  })
  await loginAsCashier(page, request)
  await page.goto('/employee/check')

  const alert = page.getByRole('alert').filter({ hasText: 'มีการเรียกพนักงาน' })
  await expect(alert).toContainText('มีคำขอค้างอยู่อีก 1 โต๊ะ')
  const shownFirst = (await alert.innerText()).includes(`โต๊ะ ${a.tableName} `) ? a.tableName : b.tableName
  const other = shownFirst === a.tableName ? b.tableName : a.tableName

  await alert.getByRole('button', { name: 'รับทราบ' }).click()
  await expect(alert).toContainText(`โต๊ะ ${other} `)
  await expect(alert).not.toContainText('มีคำขอค้างอยู่อีก')
  await alert.getByRole('button', { name: 'รับทราบ' }).click()
  await expect(alert).toHaveCount(0)
})
