import { expect, test } from '@playwright/test'
import { API_URL, call, menuItemByName, ok, tokens, type Role } from './api-helpers'

// ⚠️ ยิง backend จริง — DB ทดสอบเท่านั้น
// body ผิด type / ขาด field / ติดลบ ต้องได้ 400 (หรือ 404/409 ที่สื่อความหมาย) ไม่ใช่ 500 และไม่ใช่ 201

const ID = '00000000-0000-4000-8000-000000000000'
let t: Record<Role, string>
let friedRice: Awaited<ReturnType<typeof menuItemByName>>

test.beforeAll(async ({ request }) => {
  t = await tokens(request)
  friedRice = await menuItemByName(request, 'ข้าวผัด')
})

test('POST /orders: payload ผิดรูปแบบ → 400 ทุกกรณี', async ({ request }) => {
  const tables = await ok<{ id: string }[]>(await call(request, 'GET', '/tables', { token: t.STAFF }))
  const tableId = tables[0].id
  const line = { menuItemId: friedRice.id, quantity: 1 }
  const bad: [string, unknown][] = [
    ['tableId ไม่ใช่ uuid', { tableId: 'x', items: [line] }],
    ['ไม่มี items', { tableId }],
    ['items ว่าง', { tableId, items: [] }],
    ['quantity 0', { tableId, items: [{ ...line, quantity: 0 }] }],
    ['quantity ติดลบ', { tableId, items: [{ ...line, quantity: -2 }] }],
    ['quantity ทศนิยม', { tableId, items: [{ ...line, quantity: 1.5 }] }],
    ['quantity เป็น string', { tableId, items: [{ ...line, quantity: '2' }] }],
    ['quantity เกิน 99', { tableId, items: [{ ...line, quantity: 100 }] }],
    ['quantity เกิน Int32', { tableId, items: [{ ...line, quantity: 2147483648 }] }],
    ['menuItemId ไม่ใช่ uuid', { tableId, items: [{ ...line, menuItemId: 'abc' }] }],
    ['optionIds ซ้ำ', { tableId, items: [{ ...line, optionIds: [ID, ID] }] }],
    ['note ยาวเกิน 200', { tableId, items: [{ ...line, note: 'ก'.repeat(201) }] }],
    ['items เกิน 50 บรรทัด', { tableId, items: Array.from({ length: 51 }, () => line) }],
  ]
  const wrong: string[] = []
  for (const [name, data] of bad) {
    const res = await call(request, 'POST', '/orders', { token: t.STAFF, data })
    if (res.status() !== 400) wrong.push(`${name} → ${res.status()}`)
  }
  expect(wrong).toEqual([])
})

test('POST /payments: payload ผิด → 400/404 ไม่ใช่ 500', async ({ request }) => {
  const cases: [string, unknown, number[]][] = [
    ['ไม่มีอะไรเลย', {}, [400]],
    ['method CARD (เลิกรับแล้ว)', { tableSessionId: 'x', method: 'CARD' }, [400]],
    ['method มั่ว', { tableSessionId: 'x', method: 'BITCOIN' }, [400]],
    ['amount ติดลบ', { tableSessionId: 'x', method: 'CASH', amount: -1 }, [400]],
    ['amount ทศนิยม 3 ตำแหน่ง', { tableSessionId: 'x', method: 'CASH', amount: 1.005 }, [400]],
    ['amount เป็นข้อความ', { tableSessionId: 'x', method: 'CASH', amount: 'abc' }, [400]],
    ['orderIds ไม่ใช่ uuid', { orderIds: ['x'], method: 'CASH' }, [400]],
    ['orderIds ว่าง', { orderIds: [], method: 'CASH' }, [400]],
    ['session ไม่มีจริง', { tableSessionId: 'no-such-session', method: 'CASH' }, [404]],
    ['ออเดอร์ไม่มีจริง', { orderIds: [ID], method: 'CASH' }, [404]],
  ]
  const wrong: string[] = []
  for (const [name, data, expected] of cases) {
    const res = await call(request, 'POST', '/payments', { token: t.STAFF, data })
    if (!expected.includes(res.status())) wrong.push(`${name} → ${res.status()}`)
  }
  expect(wrong).toEqual([])
})

test('ตัวเลขเงินติดลบ/ผิดรูปแบบในรายจ่าย ปิดยอด โต๊ะ เมนู → 400', async ({ request }) => {
  const cases: [string, 'POST' | 'PATCH', string, string, unknown][] = [
    ['expense ติดลบ', 'POST', '/expenses', t.ADMIN, { title: 'x', amount: -5, category: 'OTHER' }],
    ['expense หมวดมั่ว', 'POST', '/expenses', t.ADMIN, { title: 'x', amount: 5, category: 'FOOD' }],
    ['expense spentAt มั่ว', 'POST', '/expenses', t.ADMIN, { title: 'x', amount: 5, category: 'OTHER', spentAt: 'เมื่อวาน' }],
    ['expense title ว่าง', 'POST', '/expenses', t.ADMIN, { title: '', amount: 5, category: 'OTHER' }],
    ['drawer 0 บาท', 'POST', '/expenses/drawer', t.STAFF, { title: 'น้ำแข็ง', amount: 0 }],
    ['drawer ติดลบ', 'POST', '/expenses/drawer', t.STAFF, { title: 'น้ำแข็ง', amount: -40 }],
    ['cash-close เงินทอนติดลบ', 'POST', '/cash-closes', t.STAFF, { openingFloat: -1, countedCash: 0 }],
    ['cash-close นับได้เป็นข้อความ', 'POST', '/cash-closes', t.STAFF, { openingFloat: 0, countedCash: 'abc' }],
    ['cash-close เดือน 13', 'POST', '/cash-closes', t.STAFF, { date: '2026-13-01', openingFloat: 0, countedCash: 0 }],
    ['cash-close 30 ก.พ.', 'POST', '/cash-closes', t.STAFF, { date: '2026-02-30', openingFloat: 0, countedCash: 0 }],
    ['cash-close วันในอนาคต', 'POST', '/cash-closes', t.STAFF, { date: '2099-01-01', openingFloat: 0, countedCash: 0 }],
    ['table เลข 0', 'POST', '/tables', t.ADMIN, { number: 0 }],
    ['table เลขข้อความ', 'POST', '/tables', t.ADMIN, { number: 'A1' }],
    ['table ที่นั่ง 0', 'POST', '/tables', t.ADMIN, { number: 987654, seats: 0 }],
    ['menu ราคาติดลบ', 'POST', '/menu', t.ADMIN, { name: 'x', price: -1, categoryId: ID }],
    ['menu ชื่อว่าง', 'POST', '/menu', t.ADMIN, { name: '', price: 10, categoryId: ID }],
    ['menu ราคาเป็นข้อความ', 'POST', '/menu', t.ADMIN, { name: 'x', price: 'ฟรี', categoryId: ID }],
    ['user อีเมลผิด', 'POST', '/users', t.ADMIN, { name: 'x', email: 'not-email', password: '12345678', role: 'STAFF' }],
    ['user รหัสสั้น', 'POST', '/users', t.ADMIN, { name: 'x', email: 'x@y.z', password: '123', role: 'STAFF' }],
    ['user role มั่ว', 'POST', '/users', t.ADMIN, { name: 'x', email: 'x@y.z', password: '12345678', role: 'OWNER' }],
    ['order status PAID ตรง ๆ', 'PATCH', `/orders/${ID}/status`, t.KITCHEN, { status: 'PAID_X' }],
    ['void ไม่มีเหตุผล', 'PATCH', `/payments/${ID}/void`, t.STAFF, { reason: '   ' }],
  ]
  const wrong: string[] = []
  for (const [name, method, path, token, data] of cases) {
    const res = await call(request, method, path, { token, data })
    if (res.status() !== 400) wrong.push(`${name} → ${res.status()}`)
  }
  expect(wrong).toEqual([])
})

test('query string ผิดรูปแบบ → 400', async ({ request }) => {
  const cases: [string, string][] = [
    ['/orders?status=DONE', t.STAFF],
    ['/orders?tableId=abc', t.STAFF],
    ['/payments?from=yesterday', t.STAFF],
    ['/reports/income-expense?month=2026-13', t.ADMIN],
    ['/expenses?month=2026-1', t.ADMIN],
    ['/cash-closes/preview?date=21-10-2026', t.STAFF],
    ['/table-sessions?status=FOO', t.STAFF],
    ['/tables?status=RESERVED', t.STAFF],
  ]
  const wrong: string[] = []
  for (const [path, token] of cases) {
    const res = await call(request, 'GET', path, { token })
    if (res.status() !== 400) wrong.push(`${path} → ${res.status()}`)
  }
  expect(wrong).toEqual([])
})

test('JSON พัง → 400 ไม่ใช่ 500', async ({ request }) => {
  const res = await request.post(`${API_URL}/public/orders`, {
    headers: { 'Content-Type': 'application/json' },
    data: '{"sessionToken": "x", items: [',
  })
  expect(res.status()).toBe(400)
})

test('id ใน path ที่ไม่ใช่ uuid → 404 (ไม่ใช่ 500)', async ({ request }) => {
  for (const path of ['/orders/abc', '/payments/abc', '/menu/abc', '/table-sessions/abc', '/cash-closes/abc']) {
    const res = await call(request, 'GET', path, { token: t.ADMIN })
    expect(res.status(), path).toBe(404)
  }
})

test('ชื่อซ้ำ → 409 (หมวด/วัตถุดิบ/โต๊ะ)', async ({ request }) => {
  const cats = await ok<{ name: string }[]>(await call(request, 'GET', '/categories', { token: t.ADMIN }))
  expect((await call(request, 'POST', '/categories', { token: t.ADMIN, data: { name: cats[0].name } })).status()).toBe(409)
  const tables = await ok<{ number: number }[]>(await call(request, 'GET', '/tables', { token: t.ADMIN }))
  expect((await call(request, 'POST', '/tables', { token: t.ADMIN, data: { number: tables[0].number } })).status()).toBe(409)
})

test('ชื่อที่เป็นช่องว่างล้วน/ว่าง ต้องไม่ถูกบันทึก (ตัวเลือกเมนู, วัตถุดิบ, หมวด)', async ({ request }) => {
  const created: string[] = []
  const optRes = await call(request, 'POST', `/menu/${friedRice.id}/options`, {
    token: t.ADMIN,
    data: { name: '', price: 0 },
  })
  if (optRes.ok()) {
    const opt = await optRes.json()
    created.push(`ตัวเลือกเมนูชื่อว่าง (id ${opt.id}) → ${optRes.status()}`)
    await call(request, 'DELETE', `/menu/${friedRice.id}/options/${opt.id}`, { token: t.ADMIN })
  }
  const ingRes = await call(request, 'POST', '/ingredients', { token: t.ADMIN, data: { name: '   ' } })
  if (ingRes.ok()) {
    const ing = await ingRes.json()
    created.push(`วัตถุดิบชื่อช่องว่าง → ${ingRes.status()} name=${JSON.stringify(ing.name)}`)
    await call(request, 'DELETE', `/ingredients/${ing.id}`, { token: t.ADMIN })
  }
  const catRes = await call(request, 'POST', '/categories', { token: t.ADMIN, data: { name: '   ' } })
  if (catRes.ok()) {
    const cat = await catRes.json()
    created.push(`หมวดชื่อช่องว่าง → ${catRes.status()}`)
    await call(request, 'DELETE', `/categories/${cat.id}`, { token: t.ADMIN })
  }
  expect(created).toEqual([])
})

test('ตัวเลือกชื่อซ้ำในเมนูเดียวกัน → 409 (ตัวพิมพ์เล็ก/ใหญ่ และช่องว่างหัวท้ายถือว่าซ้ำ)', async ({ request }) => {
  const name = `ทดสอบซ้ำ ${Date.now()}`
  const first = await ok<{ id: string }>(
    await call(request, 'POST', `/menu/${friedRice.id}/options`, { token: t.ADMIN, data: { name, price: 5 } }),
  )
  try {
    const again = await call(request, 'POST', `/menu/${friedRice.id}/options`, {
      token: t.ADMIN,
      data: { name: `  ${name}  `, price: 5 },
    })
    expect(again.status()).toBe(409)
  } finally {
    await call(request, 'DELETE', `/menu/${friedRice.id}/options/${first.id}`, { token: t.ADMIN })
  }
})
