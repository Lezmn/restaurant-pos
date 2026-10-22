import { expect, test } from '@playwright/test'
import {
  call,
  customerOrder,
  menuItemByName,
  ok,
  openNewSession,
  serve,
  tokens,
  type Role,
} from './api-helpers'

// ⚠️ ยิง backend จริง — DB ทดสอบเท่านั้น (สร้างโต๊ะใหม่ทุกเคส)
// QR token คือกุญแจเดียวของลูกค้า: token ผิด/ปิดแล้วต้องทำอะไรไม่ได้ และห้ามข้ามไปเห็นโต๊ะอื่น

const CLOSED_TOKEN = 'demo-table-1-paid-session'
let t: Record<Role, string>
let water: Awaited<ReturnType<typeof menuItemByName>>
let friedRice: Awaited<ReturnType<typeof menuItemByName>>

test.beforeAll(async ({ request }) => {
  t = await tokens(request)
  water = await menuItemByName(request, 'น้ำเปล่า')
  friedRice = await menuItemByName(request, 'ข้าวผัด')
})

test('token ไม่มีอยู่จริง → 404 ทุก endpoint', async ({ request }) => {
  const bad = 'no-such-token-' + Date.now()
  expect((await call(request, 'GET', `/public/sessions/${bad}`)).status()).toBe(404)
  expect((await call(request, 'GET', `/public/sessions/${bad}/orders`)).status()).toBe(404)
  const order = await call(request, 'POST', '/public/orders', {
    data: { sessionToken: bad, items: [{ menuItemId: water.id, quantity: 1 }] },
  })
  expect(order.status()).toBe(404)
  expect((await call(request, 'POST', '/public/call-staff', { data: { sessionToken: bad } })).status()).toBe(404)
  expect(
    (await call(request, 'POST', '/public/checkout', { data: { sessionToken: bad, paymentMethod: 'CASH' } })).status(),
  ).toBe(404)
})

test('โต๊ะที่ปิดบิลแล้ว → สั่ง/เรียกพนักงาน/ขอบิล ไม่ได้ (400)', async ({ request }) => {
  expect((await call(request, 'GET', `/public/sessions/${CLOSED_TOKEN}`)).status()).toBe(400)
  const order = await call(request, 'POST', '/public/orders', {
    data: { sessionToken: CLOSED_TOKEN, items: [{ menuItemId: water.id, quantity: 1 }] },
  })
  expect(order.status()).toBe(400)
  expect((await call(request, 'POST', '/public/call-staff', { data: { sessionToken: CLOSED_TOKEN } })).status()).toBe(400)
  expect(
    (await call(request, 'POST', '/public/checkout', { data: { sessionToken: CLOSED_TOKEN, paymentMethod: 'CASH' } })).status(),
  ).toBe(400)
})

test('token โต๊ะ A ดูสถานะออเดอร์ของโต๊ะ B ไม่ได้', async ({ request }) => {
  const a = await openNewSession(request, t)
  const b = await openNewSession(request, t)
  const orderB = await customerOrder(request, b.session.token, [{ menuItemId: water.id, quantity: 1 }])

  const crossed = await call(request, 'GET', `/public/orders/${orderB.id}/status?sessionToken=${a.session.token}`)
  expect(crossed.status()).toBe(404)
  const noToken = await call(request, 'GET', `/public/orders/${orderB.id}/status`)
  expect(noToken.status()).toBe(400)
  const own = await ok(await call(request, 'GET', `/public/orders/${orderB.id}/status?sessionToken=${b.session.token}`))
  expect(own.id).toBe(orderB.id)

  const listA = await ok<{ id: string }[]>(await call(request, 'GET', `/public/sessions/${a.session.token}/orders`))
  expect(listA.map((o) => o.id)).not.toContain(orderB.id)
})

test('ลูกค้าสั่ง: ราคามาจากเมนูใน DB (ส่ง unitPrice มาเองไม่มีผล) และ field แปลก ๆ ถูกตัดทิ้ง', async ({ request }) => {
  const { session } = await openNewSession(request, t)
  const res = await call(request, 'POST', '/public/orders', {
    data: {
      sessionToken: session.token,
      tableId: '00000000-0000-4000-8000-000000000000',
      items: [{ menuItemId: water.id, quantity: 2, unitPrice: 0.01, price: 0 }],
    },
  })
  expect(res.status()).toBe(201)
  const orders = await ok<{ total: number; items: { unitPrice: number }[] }[]>(
    await call(request, 'GET', `/public/sessions/${session.token}/orders`),
  )
  expect(orders[0].items[0].unitPrice).toBe(water.price)
  expect(orders[0].total).toBe(water.price * 2)
})

test('ตัวเลือกของเมนูอื่น / ตัวเลือกที่ไม่มีจริง → 400', async ({ request }) => {
  const { session } = await openNewSession(request, t)
  const foreign = friedRice.options[0].id
  const res = await call(request, 'POST', '/public/orders', {
    data: { sessionToken: session.token, items: [{ menuItemId: water.id, quantity: 1, optionIds: [foreign] }] },
  })
  expect(res.status()).toBe(400)
})

test('กลุ่มเนื้อสัตว์ (PROTEIN) ต้องเลือกได้อย่างเดียว — ส่ง 2 อย่างมาตรง ๆ ต้องถูกปฏิเสธ', async ({ request }) => {
  const { session } = await openNewSession(request, t)
  const proteins = friedRice.options.filter((o) => o.group === 'PROTEIN').slice(0, 2).map((o) => o.id)
  const res = await call(request, 'POST', '/public/orders', {
    data: { sessionToken: session.token, items: [{ menuItemId: friedRice.id, quantity: 1, optionIds: proteins }] },
  })
  expect(res.status()).toBe(400)
})

test('เมนูที่มีกลุ่มเนื้อสัตว์ (บังคับเลือกในหน้าลูกค้า) — สั่งโดยไม่เลือกเนื้อสัตว์ต้องถูกปฏิเสธ', async ({ request }) => {
  const { session } = await openNewSession(request, t)
  const res = await call(request, 'POST', '/public/orders', {
    data: { sessionToken: session.token, items: [{ menuItemId: friedRice.id, quantity: 1 }] },
  })
  expect(res.status()).toBe(400)
})

test('เรียกพนักงานซ้ำ ๆ = คำขอเดิม; ขอบิลซ้ำ = อัปเดตวิธีจ่าย; ขอบิลด้วย CARD → 400', async ({ request }) => {
  const { session } = await openNewSession(request, t)
  const first = await ok(await call(request, 'POST', '/public/call-staff', { data: { sessionToken: session.token } }))
  const again = await ok(await call(request, 'POST', '/public/call-staff', { data: { sessionToken: session.token } }))
  expect(again.id).toBe(first.id)

  const c1 = await ok(await call(request, 'POST', '/public/checkout', { data: { sessionToken: session.token, paymentMethod: 'CASH' } }))
  const c2 = await ok(await call(request, 'POST', '/public/checkout', { data: { sessionToken: session.token, paymentMethod: 'PROMPTPAY' } }))
  expect(c2.id).toBe(c1.id)
  expect(c2.paymentMethod).toBe('PROMPTPAY')
  expect(
    (await call(request, 'POST', '/public/checkout', { data: { sessionToken: session.token, paymentMethod: 'CARD' } })).status(),
  ).toBe(400)
})

test('หลังจ่ายครบ token เดิมสั่งเพิ่มไม่ได้ และคำขอค้างถูกปิดให้', async ({ request }) => {
  const { session } = await openNewSession(request, t)
  const order = await customerOrder(request, session.token, [{ menuItemId: water.id, quantity: 1 }])
  await ok(await call(request, 'POST', '/public/call-staff', { data: { sessionToken: session.token } }))
  await serve(request, t.KITCHEN, order.id)
  await ok(await call(request, 'POST', '/payments', { token: t.STAFF, data: { tableSessionId: session.id, method: 'CASH' } }))

  const after = await call(request, 'POST', '/public/orders', {
    data: { sessionToken: session.token, items: [{ menuItemId: water.id, quantity: 1 }] },
  })
  expect(after.status()).toBe(400)
  const pending = await ok<unknown[]>(
    await call(request, 'GET', `/service-requests?tableSessionId=${session.id}&status=PENDING`, { token: t.STAFF }),
  )
  expect(pending).toHaveLength(0)
})

test('สั่งเมนูที่ปิดขาย → 400 พร้อมชื่อเมนู ไม่ใช่ uuid', async ({ request }) => {
  const { session } = await openNewSession(request, t)
  await ok(await call(request, 'PATCH', `/menu/${water.id}/availability`, { token: t.KITCHEN, data: { isAvailable: false } }))
  try {
    const res = await call(request, 'POST', '/public/orders', {
      data: { sessionToken: session.token, items: [{ menuItemId: water.id, quantity: 1 }] },
    })
    expect(res.status()).toBe(400)
    const { message } = await res.json()
    expect(message).toContain('น้ำเปล่า')
    expect(message).not.toContain(water.id)
  } finally {
    await ok(await call(request, 'PATCH', `/menu/${water.id}/availability`, { token: t.KITCHEN, data: { isAvailable: true } }))
  }
})
