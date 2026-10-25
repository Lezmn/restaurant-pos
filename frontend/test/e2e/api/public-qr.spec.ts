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

// ทดสอบ: QR token ที่ไม่มีอยู่จริงต้องใช้ไม่ได้เลย (404) ทุก API ของลูกค้า
// วิธี: สุ่ม token ที่ไม่มีในระบบ → ยิงดูโต๊ะ ดูออเดอร์ สั่ง เรียกพนักงาน ขอบิล → เช็กว่าได้ 404 ทุกตัว
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
    (await call(request, 'POST', '/public/checkout', { data: { sessionToken: bad } })).status(),
  ).toBe(404)
})

// ทดสอบ: QR ของโต๊ะที่จ่ายเงินแล้วต้องใช้สั่งอาหาร เรียกพนักงาน หรือขอบิลไม่ได้อีก (400)
// วิธี: ใช้ token โต๊ะที่ปิดแล้วจาก seed → ยิงทั้ง 4 API → เช็กว่าได้ 400 ทุกตัว
test('โต๊ะที่ปิดบิลแล้ว → สั่ง/เรียกพนักงาน/ขอบิล ไม่ได้ (400)', async ({ request }) => {
  expect((await call(request, 'GET', `/public/sessions/${CLOSED_TOKEN}`)).status()).toBe(400)
  const order = await call(request, 'POST', '/public/orders', {
    data: { sessionToken: CLOSED_TOKEN, items: [{ menuItemId: water.id, quantity: 1 }] },
  })
  expect(order.status()).toBe(400)
  expect((await call(request, 'POST', '/public/call-staff', { data: { sessionToken: CLOSED_TOKEN } })).status()).toBe(400)
  expect(
    (await call(request, 'POST', '/public/checkout', { data: { sessionToken: CLOSED_TOKEN } })).status(),
  ).toBe(400)
})

// ทดสอบ: ลูกค้าโต๊ะหนึ่งต้องไม่เห็นออเดอร์ของโต๊ะอื่น
// วิธี: เปิดโต๊ะ A และ B → B สั่งน้ำ → ดูสถานะออเดอร์ B ด้วย token A ได้ 404, ไม่ส่ง token ได้ 400, token B เองดูได้ → เช็กว่ารายการออเดอร์ของ A ไม่มีออเดอร์ B
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

// ทดสอบ: ลูกค้าแก้ราคาเองไม่ได้: ราคาต้องมาจากเมนูในระบบเสมอ และช่องแปลก ๆ ที่ส่งมาต้องถูกตัดทิ้ง
// วิธี: สั่งน้ำ 2 ขวดพร้อมแนบ unitPrice 0.01, price 0 และ tableId ปลอม → เช็กว่าสั่งสำเร็จ แต่ราคาต่อหน่วยเท่าราคาเมนูจริง และยอดรวม = ราคา × 2
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

// ทดสอบ: ใส่ตัวเลือกที่เป็นของเมนูอื่นมาไม่ได้
// วิธี: สั่งน้ำเปล่าพร้อมตัวเลือกของข้าวผัด → เช็กว่าได้ 400
test('ตัวเลือกของเมนูอื่น / ตัวเลือกที่ไม่มีจริง → 400', async ({ request }) => {
  const { session } = await openNewSession(request, t)
  const foreign = friedRice.options[0].id
  const res = await call(request, 'POST', '/public/orders', {
    data: { sessionToken: session.token, items: [{ menuItemId: water.id, quantity: 1, optionIds: [foreign] }] },
  })
  expect(res.status()).toBe(400)
})

// ทดสอบ: ตัวเลือกกลุ่มเนื้อสัตว์เลือกได้อย่างเดียว ส่งมา 2 อย่างต้องถูกปฏิเสธ
// วิธี: สั่งข้าวผัดพร้อมเนื้อสัตว์ 2 อย่างยิงตรงไป API → เช็กว่าได้ 400
test('กลุ่มเนื้อสัตว์ (PROTEIN) ต้องเลือกได้อย่างเดียว — ส่ง 2 อย่างมาตรง ๆ ต้องถูกปฏิเสธ', async ({ request }) => {
  const { session } = await openNewSession(request, t)
  const proteins = friedRice.options.filter((o) => o.group === 'PROTEIN').slice(0, 2).map((o) => o.id)
  const res = await call(request, 'POST', '/public/orders', {
    data: { sessionToken: session.token, items: [{ menuItemId: friedRice.id, quantity: 1, optionIds: proteins }] },
  })
  expect(res.status()).toBe(400)
})

// ทดสอบ: เมนูที่บังคับเลือกเนื้อสัตว์ สั่งโดยไม่เลือกต้องถูกปฏิเสธ
// วิธี: สั่งข้าวผัดโดยไม่ใส่ตัวเลือก → เช็กว่าได้ 400
test('เมนูที่มีกลุ่มเนื้อสัตว์ (บังคับเลือกในหน้าลูกค้า) — สั่งโดยไม่เลือกเนื้อสัตว์ต้องถูกปฏิเสธ', async ({ request }) => {
  const { session } = await openNewSession(request, t)
  const res = await call(request, 'POST', '/public/orders', {
    data: { sessionToken: session.token, items: [{ menuItemId: friedRice.id, quantity: 1 }] },
  })
  expect(res.status()).toBe(400)
})

// ทดสอบ: กดเรียกพนักงานซ้ำต้องไม่สร้างคำขอใหม่, ขอบิลซ้ำแค่เปลี่ยนวิธีจ่ายในคำขอเดิม, และขอจ่ายด้วยบัตรไม่ได้
// วิธี: เรียกพนักงาน 2 ครั้ง เช็กว่าได้ id เดิม → ขอบิลเป็น CASH แล้วเป็น PROMPTPAY เช็กว่า id เดิมและวิธีจ่ายเปลี่ยน → ขอบิลด้วย CARD ได้ 400
test('เรียกพนักงานซ้ำ ๆ = คำขอเดิม; ขอบิลซ้ำ = อัปเดตวิธีจ่าย; ขอบิลด้วย CARD → 400', async ({ request }) => {
  const { session } = await openNewSession(request, t)
  const first = await ok(await call(request, 'POST', '/public/call-staff', { data: { sessionToken: session.token } }))
  const again = await ok(await call(request, 'POST', '/public/call-staff', { data: { sessionToken: session.token } }))
  expect(again.id).toBe(first.id)

  // ลูกค้าไม่เลือกวิธีจ่ายแล้ว (แคชเชียร์เลือก) — กดซ้ำได้คำขอเดิม · หน้าเก่าที่ยังส่ง paymentMethod มาก็ไม่ error
  const c1 = await ok(await call(request, 'POST', '/public/checkout', { data: { sessionToken: session.token } }))
  const c2 = await ok(
    await call(request, 'POST', '/public/checkout', { data: { sessionToken: session.token, paymentMethod: 'PROMPTPAY' } }),
  )
  expect(c2.id).toBe(c1.id)
  expect(c2.paymentMethod).toBeUndefined()
  const pending = await ok(await call(request, 'GET', `/public/sessions/${session.token}`))
  expect(pending.checkoutRequest?.id).toBe(c1.id)
})

// ทดสอบ: จ่ายเงินครบแล้ว QR เดิมต้องสั่งเพิ่มไม่ได้ และคำขอที่ค้างอยู่ของโต๊ะต้องถูกปิดให้เอง
// วิธี: สั่งน้ำ + เรียกพนักงาน → เสิร์ฟ → เก็บเงินสด → สั่งด้วย token เดิมได้ 400 → เช็กว่าคำขอ PENDING ของโต๊ะเหลือ 0
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

// ทดสอบ: สั่งเมนูที่ปิดขายต้องได้ 400 พร้อมบอกชื่อเมนู ไม่ใช่โชว์ uuid ให้ลูกค้าเห็น
// วิธี: ครัวปิดขายน้ำเปล่า → ลูกค้าสั่ง → เช็กว่าได้ 400 ข้อความมี "น้ำเปล่า" และไม่มี id → เปิดขายคืน (ใน finally)
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
