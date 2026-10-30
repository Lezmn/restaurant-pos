import { test, expect, type Page } from '@playwright/test'
import { call, createMenu, tokens, uniqueName } from '../api/api-helpers'
import { hideCallStaffAlerts, loginAsAdmin } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data (DB ทดสอบเท่านั้น — สร้าง/ลบเมนูจริง)
// หน้า Manage: ค้นหา/กรอง, สวิตช์ปิดขาย + เลิกทำ, ปิดขายหลายเมนู, ฟอร์มราคาติดลบ (TC-053/055/056/057/061)
// ใช้เมนูที่สร้างเองชื่อไม่ซ้ำ ไม่ไปปิดขายเมนู seed ที่เทสต์อื่นสั่งอยู่ และลบทิ้งท้ายเทสต์
test.use({ viewport: { width: 1280, height: 900 } })
test.describe.configure({ timeout: 60_000 })

const cardOf = (page: Page, name: string) =>
  page.locator('article').filter({ has: page.getByText(name, { exact: true }) })

// ทดสอบ: ค้นหาชื่อ และกรอง "เฉพาะที่ปิดขาย" ในหน้าจัดการเมนู (TC-053)
// วิธี: สร้างเมนู 2 ตัวผ่าน API ปิดขายตัวหนึ่ง → ค้นหาชื่อตัวที่เปิดขาย เห็นเฉพาะตัวนั้น → ค้นหาคำร่วม กด "เฉพาะที่ปิดขาย" เห็นเฉพาะตัวที่ปิด → ค้นหาชื่อที่ไม่มี ไม่เห็นการ์ดใด
test('จัดการเมนู: ค้นหาชื่อ และกรองเฉพาะที่ปิดขาย', async ({ page, request }) => {
  const t = await tokens(request)
  const tag = uniqueName('กรอง')
  const on = await createMenu(request, t.ADMIN, { name: `${tag} เปิด`, price: 10 })
  const off = await createMenu(request, t.ADMIN, { name: `${tag} ปิด`, price: 10 })
  try {
    await call(request, 'PATCH', `/menu/${off.id}/availability`, { token: t.ADMIN, data: { isAvailable: false } })
    await hideCallStaffAlerts(page)
    await loginAsAdmin(page, request)
    await page.goto('/employee/manage')
    const search = page.getByPlaceholder('ค้นหาเมนู')

    await search.fill(`${tag} เปิด`)
    await expect(cardOf(page, on.name)).toBeVisible()
    await expect(cardOf(page, off.name)).toHaveCount(0)

    await search.fill(tag)
    await expect(cardOf(page, on.name)).toBeVisible()
    await expect(cardOf(page, off.name)).toBeVisible()
    await page.getByRole('button', { name: /^เฉพาะที่ปิดขาย/ }).click()
    await expect(cardOf(page, off.name)).toBeVisible()
    await expect(cardOf(page, on.name)).toHaveCount(0)

    await search.fill('เมนูที่ไม่มีอยู่จริง-xyz')
    await expect(cardOf(page, off.name)).toHaveCount(0)
  } finally {
    for (const m of [on, off]) await call(request, 'DELETE', `/menu/${m.id}`, { token: t.ADMIN })
  }
})

// ทดสอบ: ปิดขายแล้วกด "เลิกทำ" คืนสถานะ, กดสวิตช์สองครั้งติดกลับที่เดิมไม่ยิงบันทึก (TC-055, TC-056)
// วิธี: สร้างเมนู → กดสวิตช์ปิดขาย รอ toast "ปิดขาย … แล้ว" → กด "เลิกทำ" เช็กผ่าน API ว่าเปิดขายอยู่ → กดสวิตช์สองครั้งติด ดักนับ PATCH availability ต้องไม่มี และสถานะยังเปิด
test('สวิตช์ปิดขาย: เลิกทำได้ และกดกลับที่เดิมเร็ว ๆ ไม่บันทึกอะไร', async ({ page, request }) => {
  const t = await tokens(request)
  const m = await createMenu(request, t.ADMIN, { name: uniqueName('สวิตช์'), price: 10 })
  const available = async () =>
    (await (await call(request, 'GET', `/menu/${m.id}`, { token: t.ADMIN })).json()).isAvailable as boolean
  try {
    await hideCallStaffAlerts(page)
    await loginAsAdmin(page, request)
    await page.goto('/employee/manage')
    await page.getByPlaceholder('ค้นหาเมนู').fill(m.name)
    const sw = cardOf(page, m.name).getByRole('switch', { name: `เปิดขาย ${m.name}` })

    await sw.click()
    await expect(page.getByText(`ปิดขาย ${m.name} แล้ว`)).toBeVisible()
    expect(await available()).toBe(false)
    await page.getByRole('button', { name: 'เลิกทำ' }).click()
    await expect.poll(available).toBe(true)

    const patches: string[] = []
    page.on('request', (r) => {
      if (r.method() === 'PATCH' && r.url().includes(`/menu/${m.id}/availability`)) patches.push(r.url())
    })
    await sw.click()
    await sw.click()
    await page.waitForTimeout(1500)
    expect(patches).toHaveLength(0)
    expect(await available()).toBe(true)
  } finally {
    await call(request, 'DELETE', `/menu/${m.id}`, { token: t.ADMIN })
  }
})

// ทดสอบ: เลือกหลายเมนูแล้วปิดขายพร้อมกัน (TC-057)
// วิธี: สร้างเมนู 2 ตัว → ค้นหาคำร่วม → กด "เลือกหลายเมนู" แล้วแตะเลือกทั้งสอง → กด "ปิดขาย" ในแถบจัดการ → เช็กผ่าน API ว่าทั้งสองปิดขายแล้ว
test('เลือกหลายเมนูแล้วปิดขายพร้อมกัน', async ({ page, request }) => {
  const t = await tokens(request)
  const tag = uniqueName('หลายตัว')
  const a = await createMenu(request, t.ADMIN, { name: `${tag} ก`, price: 10 })
  const b = await createMenu(request, t.ADMIN, { name: `${tag} ข`, price: 10 })
  try {
    await hideCallStaffAlerts(page)
    await loginAsAdmin(page, request)
    await page.goto('/employee/manage')
    await page.getByPlaceholder('ค้นหาเมนู').fill(tag)
    await page.getByRole('button', { name: 'เลือกหลายเมนู' }).click()
    await page.getByRole('button', { name: `เลือก ${a.name}` }).click()
    await page.getByRole('button', { name: `เลือก ${b.name}` }).click()
    await expect(page.getByText('เลือกแล้ว 2 เมนู')).toBeVisible()
    await page.getByLabel('จัดการเมนูที่เลือก').getByRole('button', { name: 'ปิดขาย', exact: true }).click()
    for (const m of [a, b]) {
      await expect
        .poll(async () => (await (await call(request, 'GET', `/menu/${m.id}`, { token: t.ADMIN })).json()).isAvailable)
        .toBe(false)
    }
  } finally {
    for (const m of [a, b]) await call(request, 'DELETE', `/menu/${m.id}`, { token: t.ADMIN })
  }
})

// ทดสอบ: ใส่ราคาติดลบในฟอร์มเมนู ต้องขึ้นข้อความผิดที่ช่อง และไม่ส่งไปบันทึก (TC-061)
// วิธี: เปิด "เพิ่มเมนู" กรอกชื่อ + ราคา -5 → กดบันทึก → ช่องราคา aria-invalid และเห็น "ราคาต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป" ไม่มี POST /menu และกล่องยังเปิดอยู่
test('ฟอร์มเพิ่มเมนู: ราคาติดลบถูกปฏิเสธที่ฟอร์ม', async ({ page, request }) => {
  await hideCallStaffAlerts(page)
  await loginAsAdmin(page, request)
  await page.goto('/employee/manage')
  const posts: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'POST' && new URL(r.url()).pathname === '/menu') posts.push(r.url())
  })
  await page.getByRole('button', { name: 'เพิ่มเมนู', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'เพิ่มเมนูใหม่' })
  await dialog.getByPlaceholder('เช่น ข้าวผัดกะเพรา').fill(uniqueName('ราคาติดลบ'))
  await dialog.getByLabel(/ราคา \(บาท\)/).fill('-5')
  await dialog.getByRole('button', { name: 'บันทึก', exact: true }).click()
  await expect(dialog.getByLabel(/ราคา \(บาท\)/)).toHaveAttribute('aria-invalid', 'true')
  await expect(dialog.getByText('ราคาต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป')).toBeVisible()
  await expect(dialog).toBeVisible()
  expect(posts).toHaveLength(0)
})
