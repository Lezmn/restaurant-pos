import { expect, test } from '@playwright/test'
import {
  call,
  customerOrder,
  expectStatus,
  menuItemByName,
  newTable,
  ok,
  openNewSession,
  serve,
  sessionSummary,
  tokens,
  type Role,
} from './api-helpers'

// ⚠️ ยิง backend จริง — DB ทดสอบเท่านั้น (SLIPOK_MOCK=true)
// flow เงินทั้งเส้น: สั่ง → เสิร์ฟ → เก็บเงิน → ใบเสร็จ → ยอดใน dashboard / ปิดยอด ตรงกัน
// เทียบยอดก่อน/หลังใน dashboard — เทสที่ติด @totals-billing รันแยกทีละตัวหลังชุดหลักจบ (playwright.config.ts)

let t: Record<Role, string>
let water: Awaited<ReturnType<typeof menuItemByName>>
let friedRice: Awaited<ReturnType<typeof menuItemByName>>
const opt = (name: string) => friedRice.options.find((o) => o.name === name)!.id

test.beforeAll(async ({ request }) => {
  t = await tokens(request)
  water = await menuItemByName(request, 'น้ำเปล่า')
  friedRice = await menuItemByName(request, 'ข้าวผัด')
})

const dashboard = async (request: Parameters<typeof tokens>[0]) =>
  ok<{ revenue: number; paymentCount: number; revenueByMethod: Record<string, number>; netProfit: number; expenses: number }>(
    await call(request, 'GET', '/reports/dashboard', { token: t.ADMIN }),
  )
const preview = async (request: Parameters<typeof tokens>[0]) =>
  ok<{ cashSales: number; promptpaySales: number; drawerExpenses: number; paymentCount: number }>(
    await call(request, 'GET', '/cash-closes/preview', { token: t.STAFF }),
  )

// @totals-billing: เทียบยอดขายทั้งวัน — รันแยกหลังเทสอื่นจบ (playwright.config.ts) ไม่ให้บิลของเทสอื่นปนยอด
test('ยอดบิล ส่วนลด ใบเสร็จ และยอดใน dashboard/ปิดยอด ตรงกัน แล้วยกเลิกบิลยอดต้องหายคืน', { tag: '@totals-billing' }, async ({ request }) => {
  const before = await dashboard(request)
  const beforeClose = await preview(request)

  const { table, session } = await openNewSession(request, t)
  // (50 + กุ้ง 20 + ไข่ดาว 10) × 2 = 160 และ น้ำ 10 × 3 = 30 → 190
  const o1 = await customerOrder(request, session.token, [
    { menuItemId: friedRice.id, quantity: 2, optionIds: [opt('กุ้ง'), opt('ไข่ดาว')], note: 'ไม่เผ็ด' },
  ])
  const o2 = await customerOrder(request, session.token, [{ menuItemId: water.id, quantity: 3 }])
  expect((await sessionSummary(request, t.STAFF, session.id)).total).toBe(190)

  // ยังไม่เสิร์ฟ → เก็บเงินไม่ได้
  expectStatus(await call(request, 'POST', '/payments', { token: t.STAFF, data: { tableSessionId: session.id, method: 'CASH' } }), 400)
  await serve(request, t.KITCHEN, o1.id)
  await serve(request, t.KITCHEN, o2.id)

  // ยอดบนจอผิด → 409
  expectStatus(
    await call(request, 'POST', '/payments', { token: t.STAFF, data: { tableSessionId: session.id, method: 'CASH', expectedTotal: 180 } }),
    409,
  )
  // เก็บเกินยอด → 400
  expectStatus(
    await call(request, 'POST', '/payments', { token: t.STAFF, data: { tableSessionId: session.id, method: 'CASH', amount: 200 } }),
    400,
  )

  const payment = await ok(
    await call(request, 'POST', '/payments', {
      token: t.STAFF,
      data: { tableSessionId: session.id, method: 'CASH', expectedTotal: 190, amount: 180.5, note: 'ลูกค้าประจำ' },
    }),
  )
  expect(payment.amount).toBe(180.5)
  expect(payment.receipt).toMatchObject({ subtotal: 190, discount: 9.5, total: 180.5, note: 'ลูกค้าประจำ' })
  expect(payment.receipt.number).toMatch(/^RCPT-\d{8}-\d{4}$/)
  const lineTotals = payment.receipt.items.map((i: { lineTotal: number }) => i.lineTotal).sort((a: number, b: number) => a - b)
  expect(lineTotals).toEqual([30, 160])
  expect(payment.closedSessionIds).toEqual([session.id])

  // โต๊ะว่างแล้ว
  const tableAfter = await ok(await call(request, 'GET', `/tables/${table.id}`, { token: t.STAFF }))
  expect(tableAfter.status).toBe('AVAILABLE')

  // ตัวเลขเจ้าของร้าน = ยอดที่เก็บจริง (หลังส่วนลด)
  const after = await dashboard(request)
  expect(after.revenue - before.revenue).toBeCloseTo(180.5, 2)
  expect(after.paymentCount - before.paymentCount).toBe(1)
  expect(after.revenueByMethod.CASH - before.revenueByMethod.CASH).toBeCloseTo(180.5, 2)
  const afterClose = await preview(request)
  expect(afterClose.cashSales - beforeClose.cashSales).toBeCloseTo(180.5, 2)

  // ใบเสร็จดูซ้ำได้ (พิมพ์ซ้ำ)
  const again = await ok(await call(request, 'GET', `/payments/${payment.id}`, { token: t.STAFF }))
  expect(again.receipt.items).toHaveLength(2)

  // ยกเลิกบิล → ยอดหาย, โต๊ะกลับมาค้างจ่าย
  await ok(await call(request, 'PATCH', `/payments/${payment.id}/void`, { token: t.STAFF, data: { reason: 'ทดสอบยกเลิก' } }))
  expectStatus(await call(request, 'PATCH', `/payments/${payment.id}/void`, { token: t.STAFF, data: { reason: 'ซ้ำ' } }), 409)
  const voided = await dashboard(request)
  expect(voided.revenue).toBeCloseTo(before.revenue, 2)
  const reopened = await sessionSummary(request, t.STAFF, session.id)
  expect(reopened.status).toBe('OPEN')
  expect(reopened.total).toBe(190)

  // เก็บใหม่เต็มจำนวนได้
  const repay = await ok(await call(request, 'POST', '/payments', { token: t.STAFF, data: { tableSessionId: session.id, method: 'CASH' } }))
  expect(repay.amount).toBe(190)
  expect(repay.receipt.number).not.toBe(payment.receipt.number)
})

test('กดรับเงินพร้อมกันสองเครื่อง → สำเร็จใบเดียว อีกใบ 409', async ({ request }) => {
  const { session } = await openNewSession(request, t)
  const o = await customerOrder(request, session.token, [{ menuItemId: water.id, quantity: 1 }])
  await serve(request, t.KITCHEN, o.id)
  const results = await Promise.all(
    [0, 1, 2].map(() => call(request, 'POST', '/payments', { token: t.STAFF, data: { tableSessionId: session.id, method: 'CASH' } })),
  )
  const statuses = results.map((r) => r.status()).sort()
  expect(statuses.filter((s) => s === 201)).toHaveLength(1)
  expect(statuses.every((s) => s === 201 || s === 409 || s === 400)).toBe(true)
  const payments = await ok<{ tableSessionId: string; status: string }[]>(await call(request, 'GET', '/payments', { token: t.STAFF }))
  expect(payments.filter((p) => p.tableSessionId === session.id && p.status === 'COMPLETED')).toHaveLength(1)
})

test('แยกบิล: จ่ายบางออเดอร์ โต๊ะยังเปิด ยอดค้างลดลง จ่ายครบแล้วปิด', async ({ request }) => {
  const { session } = await openNewSession(request, t)
  const a = await customerOrder(request, session.token, [{ menuItemId: water.id, quantity: 2 }])
  const b = await customerOrder(request, session.token, [{ menuItemId: friedRice.id, quantity: 1, optionIds: [opt('หมู')] }])
  await serve(request, t.KITCHEN, a.id)
  await serve(request, t.KITCHEN, b.id)

  const p1 = await ok(await call(request, 'POST', '/payments', { token: t.STAFF, data: { orderIds: [a.id], method: 'CASH' } }))
  expect(p1.amount).toBe(20)
  expect(p1.closedSessionIds).toEqual([])
  const mid = await sessionSummary(request, t.STAFF, session.id)
  expect(mid).toMatchObject({ status: 'OPEN', total: 50 })
  // จ่ายใบเดิมซ้ำ → 409
  expectStatus(await call(request, 'POST', '/payments', { token: t.STAFF, data: { orderIds: [a.id], method: 'CASH' } }), 409)

  const p2 = await ok(await call(request, 'POST', '/payments', { token: t.STAFF, data: { orderIds: [b.id], method: 'CASH' } }))
  expect(p2.closedSessionIds).toEqual([session.id])
})

// @totals-billing: เทียบยอดขายทั้งวัน — รันแยกหลังเทสอื่นจบ (playwright.config.ts)
test('PromptPay (SlipOK จำลอง): ผ่าน / สลิปซ้ำ / ยอดไม่ตรง / ระบบล่ม / ไม่มีสลิป', { tag: '@totals-billing' }, async ({ request }) => {
  const mk = async () => {
    const { session } = await openNewSession(request, t)
    const o = await customerOrder(request, session.token, [{ menuItemId: water.id, quantity: 1 }])
    await serve(request, t.KITCHEN, o.id)
    return session
  }
  const slip = `MOCK-OK-api-${Date.now()}`
  const before = await preview(request)

  const s1 = await mk()
  const ok1 = await ok(await call(request, 'POST', '/payments', { token: t.STAFF, data: { tableSessionId: s1.id, method: 'PROMPTPAY', slipPayload: slip } }))
  expect(ok1.slipStatus).toBe('VERIFIED')

  const s2 = await mk()
  const dup = await call(request, 'POST', '/payments', { token: t.STAFF, data: { tableSessionId: s2.id, method: 'PROMPTPAY', slipPayload: slip } })
  expect(dup.status()).toBe(400)
  expect(await dup.text()).toContain('ถูกใช้กับบิลอื่น')

  expectStatus(await call(request, 'POST', '/payments', { token: t.STAFF, data: { tableSessionId: s2.id, method: 'PROMPTPAY', slipPayload: 'MOCK-AMOUNT-1' } }), 400)
  expectStatus(await call(request, 'POST', '/payments', { token: t.STAFF, data: { tableSessionId: s2.id, method: 'PROMPTPAY' } }), 400)
  expectStatus(
    await call(request, 'POST', '/payments', { token: t.STAFF, data: { tableSessionId: s2.id, method: 'PROMPTPAY', slipOverrideReason: 'ดูแอปแล้ว' } }),
    403,
  )
  const old = await call(request, 'POST', '/payments', { token: t.STAFF, data: { tableSessionId: s2.id, method: 'PROMPTPAY', slipPayload: `MOCK-OLD-${Date.now()}` } })
  expect(old.status()).toBe(400)

  const down = await ok(await call(request, 'POST', '/payments', { token: t.STAFF, data: { tableSessionId: s2.id, method: 'PROMPTPAY', slipPayload: `MOCK-DOWN-${Date.now()}` } }))
  expect(down.slipStatus).toBe('PENDING')
  const issues = await ok<{ id: string }[]>(await call(request, 'GET', '/payments?slipIssues=true', { token: t.STAFF }))
  expect(issues.map((p) => p.id)).toContain(down.id)
  // STAFF ยืนยันเองไม่ได้, ADMIN ได้
  expectStatus(await call(request, 'PATCH', `/payments/${down.id}/slip/confirm`, { token: t.STAFF, data: { reason: 'x' } }), 403)
  const confirmed = await ok(await call(request, 'PATCH', `/payments/${down.id}/slip/confirm`, { token: t.ADMIN, data: { reason: 'เช็คแอปธนาคารแล้ว' } }))
  expect(confirmed.slipStatus).toBe('MANUAL')

  const s3 = await mk()
  const manual = await ok(await call(request, 'POST', '/payments', { token: t.ADMIN, data: { tableSessionId: s3.id, method: 'PROMPTPAY', slipOverrideReason: 'ลูกค้าโชว์แอป' } }))
  expect(manual.slipStatus).toBe('MANUAL')

  // ยกเลิกบิล PromptPay แล้วใช้สลิปเดิมกับบิลเดิมได้ (กดผิดโต๊ะ)
  await ok(await call(request, 'PATCH', `/payments/${ok1.id}/void`, { token: t.STAFF, data: { reason: 'ผิดโต๊ะ' } }))
  const reuse = await ok(await call(request, 'POST', '/payments', { token: t.STAFF, data: { tableSessionId: s1.id, method: 'PROMPTPAY', slipPayload: slip } }))
  expect(reuse.slipStatus).toBe('VERIFIED')

  const after = await preview(request)
  expect(after.promptpaySales - before.promptpaySales).toBeCloseTo(water.price * 3, 2)
  expect(after.cashSales).toBeCloseTo(before.cashSales, 2)
})

test('ปิดวัตถุดิบ (KITCHEN): เมนูหายจากหน้าลูกค้า สั่งไม่ได้ แล้วเปิดคืนกลับมา', async ({ request }) => {
  const ingredients = await ok<{ id: string; name: string; isAvailable: boolean; _count: { menuItems: number; menuOptions: number } }[]>(
    await call(request, 'GET', '/ingredients', { token: t.KITCHEN }),
  )
  const menuAdmin = await ok<{ id: string; name: string; ingredients: { ingredient: { id: string } }[] }[]>(
    await call(request, 'GET', '/menu', { token: t.ADMIN }),
  )
  const target = menuAdmin.find((m) => m.ingredients.length > 0)
  // seed + migration menu_item_ingredients ผูก ข้าวไข่เจียว → ไข่ ไว้เสมอ ไม่มี = seed เพี้ยน ต้องล้ม ไม่ใช่ข้าม
  expect(target, 'seed ไม่มีเมนูที่ผูกวัตถุดิบหลัก').toBeTruthy()
  const ingredientId = target!.ingredients[0].ingredient.id
  expect(ingredients.find((i) => i.id === ingredientId)?.isAvailable).toBe(true)

  const { session } = await openNewSession(request, t)
  try {
    await ok(await call(request, 'PATCH', `/ingredients/${ingredientId}`, { token: t.KITCHEN, data: { isAvailable: false } }))
    const names = (await ok<{ menuItems: { id: string }[] }[]>(await call(request, 'GET', '/public/menu'))).flatMap((c) =>
      c.menuItems.map((m) => m.id),
    )
    expect(names).not.toContain(target!.id)
    const res = await call(request, 'POST', '/public/orders', {
      data: { sessionToken: session.token, items: [{ menuItemId: target!.id, quantity: 1 }] },
    })
    expect(res.status()).toBe(400)
    // staff รับออเดอร์แทนก็ไม่ได้เหมือนกัน
    const staffRes = await call(request, 'POST', '/orders', {
      token: t.STAFF,
      data: { tableId: session.tableId, items: [{ menuItemId: target!.id, quantity: 1 }] },
    })
    expect(staffRes.status()).toBe(400)
  } finally {
    await ok(await call(request, 'PATCH', `/ingredients/${ingredientId}`, { token: t.KITCHEN, data: { isAvailable: true } }))
  }
  const back = (await ok<{ menuItems: { id: string }[] }[]>(await call(request, 'GET', '/public/menu'))).flatMap((c) =>
    c.menuItems.map((m) => m.id),
  )
  expect(back).toContain(target!.id)
})

test('ปิดยอดเงินสด: expected = เงินทอน + ขายสด − หยิบจากลิ้นชัก, ปิดซ้ำ 409, ลบแล้วปิดใหม่ได้', async ({ request }) => {
  // ถ้าวันนี้ปิดไปแล้ว (รันซ้ำ) ลบทิ้งก่อน
  const existing = await preview(request)
  const already = (existing as unknown as { alreadyClosed: { id: string } | null }).alreadyClosed
  if (already) await ok(await call(request, 'DELETE', `/cash-closes/${already.id}`, { token: t.ADMIN }))

  await ok(await call(request, 'POST', '/expenses/drawer', { token: t.STAFF, data: { title: 'น้ำแข็ง (API test)', amount: 35.25 } }))
  const p = await preview(request)
  const created = await ok(await call(request, 'POST', '/cash-closes', { token: t.STAFF, data: { openingFloat: 1000, countedCash: 1500, note: 'API test' } }))
  const expected = 1000 + p.cashSales - p.drawerExpenses
  expect(created.expectedCash).toBeCloseTo(expected, 2)
  expect(created.difference).toBeCloseTo(1500 - expected, 2)
  expect(created.drawerExpenses).toBeCloseTo(p.drawerExpenses, 2)

  expectStatus(await call(request, 'POST', '/cash-closes', { token: t.STAFF, data: { openingFloat: 0, countedCash: 0 } }), 409)
  const detail = await ok(await call(request, 'GET', `/cash-closes/${created.id}`, { token: t.ADMIN }))
  expect(detail.changedSinceClose).toBe(false)
  const del = await call(request, 'DELETE', `/cash-closes/${created.id}`, { token: t.ADMIN })
  expect(del.status()).toBe(200)
  expect((await del.text()).length).toBeGreaterThan(0) // web parse JSON ได้
})

test('walk-in: STAFF รับออเดอร์ให้โต๊ะที่ยังไม่เปิด → ปฏิเสธ (ออเดอร์ไม่มี session จะเก็บเงินไม่ได้ตลอดไป)', async ({ request }) => {
  const table = await newTable(request, t.ADMIN)
  const created = await call(request, 'POST', '/orders', {
    token: t.STAFF,
    data: { tableId: table.id, items: [{ menuItemId: water.id, quantity: 1 }] },
  })
  expectStatus(created, 400)
  const tables = await ok<{ id: string; status: string }[]>(await call(request, 'GET', '/tables', { token: t.STAFF }))
  expect(tables.find((x) => x.id === table.id)?.status).toBe('AVAILABLE')
})

test('STAFF รับออเดอร์ค้างไว้ ระหว่างนั้นบิลโต๊ะถูกปิด → ส่งไม่ได้ ไม่เกิดออเดอร์ลอย', async ({ request }) => {
  const { session } = await openNewSession(request, t)
  const data = { tableId: session.tableId, tableSessionId: session.id, items: [{ menuItemId: water.id, quantity: 1 }] }

  // อีกเครื่องปิดบิลโต๊ะนี้ไปแล้ว
  await ok(await call(request, 'PATCH', `/table-sessions/${session.id}/close`, { token: t.STAFF }))
  expectStatus(await call(request, 'POST', '/orders', { token: t.STAFF, data }), 400)

  // แล้วโต๊ะเปิดรอบใหม่ให้ลูกค้ากลุ่มถัดไป — ออเดอร์จากหน้าเดิมต้องไม่ไปเข้าบิลรอบใหม่
  const next = await ok<{ id: string }>(
    await call(request, 'POST', '/table-sessions', { token: t.STAFF, data: { tableId: session.tableId } }),
  )
  expectStatus(await call(request, 'POST', '/orders', { token: t.STAFF, data }), 409)
  const orders = await ok<unknown[]>(await call(request, 'GET', `/orders?tableSessionId=${next.id}`, { token: t.STAFF }))
  expect(orders).toHaveLength(0)
})

test('STAFF เพิ่มรายการเข้าออเดอร์ที่เสิร์ฟแล้ว → ต้องไม่ถูกเก็บเงินโดยครัวไม่เคยเห็น', async ({ request }) => {
  const { session } = await openNewSession(request, t)
  const o = await customerOrder(request, session.token, [{ menuItemId: water.id, quantity: 1 }])
  await serve(request, t.KITCHEN, o.id)
  const add = await call(request, 'POST', `/orders/${o.id}/items`, {
    token: t.STAFF,
    data: { menuItemId: friedRice.id, quantity: 1, optionIds: [opt('หมู')] },
  })
  expect(add.status(), 'ควรถูกปฏิเสธ หรือคืนออเดอร์เข้าคิวครัว').not.toBe(201)
})

test('ลบรายการสุดท้ายของออเดอร์ → ต้องไม่เหลือออเดอร์เปล่า 0 บาทในบิล', async ({ request }) => {
  const { session } = await openNewSession(request, t)
  const o = await customerOrder(request, session.token, [{ menuItemId: water.id, quantity: 1 }])
  const full = await ok(await call(request, 'GET', `/orders/${o.id}`, { token: t.STAFF }))
  const res = await call(request, 'DELETE', `/orders/${o.id}/items/${full.items[0].id}`, { token: t.STAFF })
  if (res.status() >= 400) return
  const after = await res.json()
  expect(after.items.length > 0 || after.status === 'CANCELLED').toBe(true)
})

test('STAFF ยกเลิกออเดอร์ไม่ได้ (เฉพาะ ADMIN/KITCHEN) — ยืนยันสิทธิ์', async ({ request }) => {
  const { session } = await openNewSession(request, t)
  const o = await customerOrder(request, session.token, [{ menuItemId: water.id, quantity: 1 }])
  expectStatus(await call(request, 'PATCH', `/orders/${o.id}/status`, { token: t.STAFF, data: { status: 'CANCELLED' } }), 403)
  await ok(await call(request, 'PATCH', `/orders/${o.id}/status`, { token: t.KITCHEN, data: { status: 'CANCELLED' } }))
  // ยกเลิกหมดโดยไม่เคยจ่าย → โต๊ะยังเปิด (ลูกค้ายังนั่งอยู่)
  expect((await sessionSummary(request, t.STAFF, session.id)).status).toBe('OPEN')
  // ปิดโต๊ะเองได้
  await ok(await call(request, 'PATCH', `/table-sessions/${session.id}/close`, { token: t.STAFF }))
})

test('เปิดโต๊ะซ้ำ / พร้อมกัน → session เปิดได้ใบเดียว', async ({ request }) => {
  const table = await newTable(request, t.ADMIN)
  const results = await Promise.all(
    [0, 1, 2].map(() => call(request, 'POST', '/table-sessions', { token: t.STAFF, data: { tableId: table.id } })),
  )
  expect(results.filter((r) => r.status() === 201)).toHaveLength(1)
  expect(results.filter((r) => r.status() === 409)).toHaveLength(2)
})

test('ลบผู้ใช้: ตอบ body ที่เว็บ parse ได้ และลบตัวเองไม่ได้', async ({ request }) => {
  const email = `qa-${Date.now()}@restaurant.local`
  const user = await ok(await call(request, 'POST', '/users', { token: t.ADMIN, data: { name: 'QA', email, password: 'QaTest1234', role: 'KITCHEN' } }))
  expectStatus(await call(request, 'POST', '/users', { token: t.ADMIN, data: { name: 'QA', email, password: 'QaTest1234', role: 'KITCHEN' } }), 400)
  const me = await ok(await call(request, 'GET', '/auth/me', { token: t.ADMIN }))
  expectStatus(await call(request, 'DELETE', `/users/${me.id}`, { token: t.ADMIN }), 400)
  const del = await call(request, 'DELETE', `/users/${user.id}`, { token: t.ADMIN })
  expect(del.status()).toBe(200)
  expect((await del.text()).length, 'DELETE /users/:id ตอบ 200 body ว่าง — apiClient parse JSON พัง').toBeGreaterThan(0)
})
