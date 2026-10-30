import { test, expect } from '@playwright/test'
import {
  call,
  createMenu,
  customerOrder,
  ok,
  openNewSession,
  serve,
  tokens,
  uniqueName,
} from '../api/api-helpers'
import { checkTableTile, hideCallStaffAlerts, loginAsAdmin, loginAsCashier } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data (DB ทดสอบเท่านั้น — สร้างเมนู/หมวด/ออเดอร์/บิลจริง)
// ลบเมนูที่เคยถูกสั่งแล้ว (PR #47): ลบจริงไม่ได้เพราะ order_items อ้างอยู่ → ตั้ง deletedAt (ซ่อน) แทน
//   หายจากหน้า Manage / หน้าลูกค้า / แก้-ลบซ้ำไม่ได้ (404) แต่บิลที่ค้าง ใบเสร็จ และรายงานยอดขายยังเห็นชื่อเมนู
// เมนูที่ยังไม่เคยถูกสั่งยังลบจริงเหมือนเดิม (test/e2e/admin/menu-crud.spec.ts)
test.use({ viewport: { width: 1280, height: 900 } })
test.describe.configure({ timeout: 60_000 })

const thisMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ทดสอบ: ADMIN ลบเมนูที่มีออเดอร์ค้างอยู่ได้ (ไม่ error) — เมนูหายจากหน้า Manage และหน้าลูกค้า, แก้/ลบซ้ำได้ 404 แต่โต๊ะที่สั่งไว้ยังเก็บเงินได้ ใบเสร็จและรายงานยอดขายยังมีชื่อเมนู
// วิธี: admin สร้างเมนูทดสอบ ลูกค้าสั่ง 2 จาน ครัวเสิร์ฟ (API) → admin เปิด Manage ค้นหาเมนู กดแก้ไข → ลบเมนูนี้ → เช็กข้อความในกล่องยืนยันว่าออเดอร์เก่ายังเห็นชื่อ → ยืนยัน → toast และการ์ดหาย → API: ไม่อยู่ใน /menu และ /public/menu, GET/PATCH/DELETE /menu/:id ได้ 404 → cashier เก็บเงินสดโต๊ะนั้น เช็กใบเสร็จมีชื่อเมนู → /reports/sales ของเดือนนี้ยังมีเมนูนี้ 2 จาน
test('ลบเมนูที่เคยถูกสั่ง → ซ่อนจาก Manage/หน้าลูกค้า แต่บิล ใบเสร็จ และยอดขายยังเห็นชื่อ', async ({ page, request }) => {
  const t = await tokens(request)
  const menu = await createMenu(request, t.ADMIN, { name: uniqueName('เมนูลบแบบซ่อน'), price: 45 })
  const { table, session } = await openNewSession(request, t)
  const order = await customerOrder(request, session.token, [{ menuItemId: menu.id, quantity: 2 }])
  await serve(request, t.KITCHEN, order.id)

  await test.step('ADMIN ลบจากหน้า Manage', async () => {
    await hideCallStaffAlerts(page)
    await loginAsAdmin(page, request)
    await page.goto('/employee/manage')
    await page.getByPlaceholder('ค้นหาเมนู').fill(menu.name)
    const card = page.locator('article').filter({ has: page.getByText(menu.name, { exact: true }) })
    await card.getByRole('button', { name: 'แก้ไข' }).click()
    const edit = page.getByRole('dialog', { name: `แก้ไข ${menu.name}` })
    await edit.getByRole('button', { name: 'ลบเมนูนี้' }).click()
    // กล่องแก้ไขปิดก่อน แล้วค่อยเป็นกล่องยืนยันลบ
    await expect(edit).toHaveCount(0)
    const confirm = page.getByRole('dialog', { name: 'ลบเมนู' })
    await expect(confirm).toContainText('ออเดอร์และรายงานที่เคยขายไปแล้วยังเห็นชื่อเมนูอยู่')
    const [res] = await Promise.all([
      page.waitForResponse((r) => new URL(r.url()).pathname === `/menu/${menu.id}` && r.request().method() === 'DELETE'),
      confirm.getByRole('button', { name: 'ลบเมนู', exact: true }).click(),
    ])
    expect(res.ok(), `DELETE /menu ต้องสำเร็จ ไม่ใช่ ${res.status()}`).toBe(true)
    await expect(page.getByText(`ลบ ${menu.name} แล้ว`)).toBeVisible()
    await expect(confirm).toHaveCount(0)
    await expect(card).toHaveCount(0)
  })

  await test.step('API: หายจากรายการ และแก้/ลบซ้ำไม่ได้', async () => {
    const all = await ok<{ id: string }[]>(await call(request, 'GET', '/menu', { token: t.ADMIN }))
    expect(all.map((m) => m.id)).not.toContain(menu.id)
    const pub = await ok<{ menuItems: { id: string }[] }[]>(await call(request, 'GET', '/public/menu'))
    expect(pub.flatMap((c) => c.menuItems).map((m) => m.id)).not.toContain(menu.id)
    expect((await call(request, 'GET', `/menu/${menu.id}`, { token: t.ADMIN })).status()).toBe(404)
    expect((await call(request, 'PATCH', `/menu/${menu.id}`, { token: t.ADMIN, data: { price: 99 } })).status()).toBe(404)
    expect((await call(request, 'DELETE', `/menu/${menu.id}`, { token: t.ADMIN })).status()).toBe(404)
  })

  await test.step('โต๊ะที่สั่งไว้ยังเก็บเงินได้ ใบเสร็จมีชื่อเมนู', async () => {
    await loginAsCashier(page, request)
    await page.goto('/employee/check')
    await checkTableTile(page, String(table.number)).getByRole('button', { name: /^รับเงิน/ }).click()
    await page.getByRole('dialog', { name: `รับเงิน โต๊ะ ${table.number}` }).getByRole('button', { name: 'รับเงิน', exact: true }).click()
    const receipt = page.getByRole('dialog', { name: 'ใบเสร็จรับเงิน' })
    // ชุดใหญ่รันขนาน 3 worker บันทึกบิลช้าได้หลายวินาที
    await expect(receipt).toBeVisible({ timeout: 15_000 })
    await expect(receipt).toContainText(menu.name)
    await expect(receipt.getByText('฿90').first()).toBeVisible()
    await receipt.getByRole('button', { name: 'ปิด' }).click()
  })

  await test.step('รายงานยอดขายยังนับเมนูนี้', async () => {
    const sales = await ok<{ topItems: { menuItemId: string; name: string; quantity: number }[] }>(
      await call(request, 'GET', `/reports/sales?month=${thisMonth()}`, { token: t.ADMIN }),
    )
    const row = sales.topItems.find((i) => i.menuItemId === menu.id)
    expect(row?.name).toBe(menu.name)
    expect(row?.quantity).toBe(2)
  })
})

// ทดสอบ: หมวดที่เหลือแต่เมนูที่ลบแบบซ่อนแล้ว ลบหมวดไม่ได้ (409 พร้อมเหตุผล ไม่ใช่ 500) และจำนวนเมนูของหมวดไม่นับเมนูที่ซ่อน
// วิธี: สร้างหมวดใหม่ + เมนูในหมวดนั้นผ่าน API → ลูกค้าสั่ง 1 จาน (ให้มีประวัติออเดอร์) → ลบเมนู (ได้ 200 = ซ่อน) → GET /categories นับเมนูของหมวดนี้ได้ 0 → DELETE หมวดได้ 409 ข้อความบอกว่ามีเมนูที่ลบไปแล้วแต่ยังมีประวัติ → เก็บกวาด: ยกเลิกออเดอร์และปิดโต๊ะ
test('หมวดที่เหลือแต่เมนูที่ลบแบบซ่อน → ลบหมวดได้ 409 และไม่นับเมนูที่ซ่อน', async ({ request }) => {
  const t = await tokens(request)
  const category = await ok<{ id: string }>(
    await call(request, 'POST', '/categories', { token: t.ADMIN, data: { name: uniqueName('หมวดเมนูซ่อน') } }),
  )
  const menu = await createMenu(request, t.ADMIN, { name: uniqueName('เมนูในหมวดซ่อน'), price: 30, categoryId: category.id })
  const { session } = await openNewSession(request, t)
  const order = await customerOrder(request, session.token, [{ menuItemId: menu.id, quantity: 1 }])

  try {
    await ok(await call(request, 'DELETE', `/menu/${menu.id}`, { token: t.ADMIN }))
    const categories = await ok<{ id: string; _count: { menuItems: number } }[]>(
      await call(request, 'GET', '/categories', { token: t.ADMIN }),
    )
    expect(categories.find((c) => c.id === category.id)?._count.menuItems).toBe(0)

    const res = await call(request, 'DELETE', `/categories/${category.id}`, { token: t.ADMIN })
    expect(res.status()).toBe(409)
    expect(await res.text()).toContain('เมนูที่ลบไปแล้วแต่ยังมีประวัติออเดอร์')
  } finally {
    await call(request, 'PATCH', `/orders/${order.id}/status`, { token: t.KITCHEN, data: { status: 'CANCELLED' } })
    await call(request, 'PATCH', `/table-sessions/${session.id}/close`, { token: t.STAFF })
  }
})
