import { expect, test } from '@playwright/test'
import {
  call,
  customerOrder,
  expectStatus,
  menuItemByName,
  ok,
  openNewSession,
  serve,
  sessionSummary,
  tokens,
  type Role,
} from './api-helpers'

// ⚠️ ยิง backend จริง — DB ทดสอบเท่านั้น
// แยกบิล 2 แบบ: เลือกรายการ (items) และหารเท่ากัน (splitParts) + ส่วนลด % + ยกเลิกบิลระหว่างหาร

let t: Record<Role, string>
let water: Awaited<ReturnType<typeof menuItemByName>>

test.beforeAll(async ({ request }) => {
  t = await tokens(request)
  water = await menuItemByName(request, 'น้ำเปล่า')
})

type SessionDetail = {
  total: number
  status: string
  split: { parts: number; paidParts: number; total: number; remaining: number; nextAmount: number } | null
  orders: { id: string; status: string; paymentId: string | null; items: { id: string; quantity: number }[] }[]
}
const detail = async (request: Parameters<typeof tokens>[0], sessionId: string) =>
  ok<SessionDetail>(await call(request, 'GET', `/table-sessions/${sessionId}`, { token: t.STAFF }))

test('ส่วนลด %: ลดจากยอดบิล ปัดสตางค์ครึ่งขึ้น และเก็บ % ไว้ในใบเสร็จ', async ({ request }) => {
  const { session } = await openNewSession(request, t)
  // น้ำ 10 × 3 = 30 → ลด 15% = 4.50 → เก็บ 25.50
  const o = await customerOrder(request, session.token, [{ menuItemId: water.id, quantity: 3 }])
  await serve(request, t.KITCHEN, o.id)
  const payment = await ok(
    await call(request, 'POST', '/payments', {
      token: t.STAFF,
      data: { tableSessionId: session.id, method: 'CASH', expectedTotal: 30, discountPercent: 15 },
    }),
  )
  expect(payment.amount).toBe(25.5)
  expect(payment.receipt).toMatchObject({ subtotal: 30, discount: 4.5, discountPercent: 15, total: 25.5 })
  // % ต้องเป็นจำนวนเต็ม 1-100
  for (const bad of [0, 12.5, 101]) {
    expectStatus(
      await call(request, 'POST', '/payments', {
        token: t.STAFF,
        data: { tableSessionId: session.id, method: 'CASH', discountPercent: bad },
      }),
      400,
    )
  }
})

test('เลือกรายการ: จ่ายน้ำ 1 จาก 3 ขวด ที่เหลือค้างในโต๊ะ แล้วจ่ายครบโต๊ะปิด', async ({ request }) => {
  const { session } = await openNewSession(request, t)
  const o = await customerOrder(request, session.token, [{ menuItemId: water.id, quantity: 3 }])
  await serve(request, t.KITCHEN, o.id)
  const itemId = (await detail(request, session.id)).orders[0].items[0].id

  // เลือกเกินจำนวนที่สั่ง → 400
  expectStatus(
    await call(request, 'POST', '/payments', {
      token: t.STAFF,
      data: { items: [{ orderItemId: itemId, quantity: 4 }], method: 'CASH' },
    }),
    400,
  )

  const first = await ok(
    await call(request, 'POST', '/payments', {
      token: t.STAFF,
      data: { items: [{ orderItemId: itemId, quantity: 1 }], method: 'CASH', expectedTotal: 10 },
    }),
  )
  expect(first.amount).toBe(10)
  expect(first.receipt.items).toHaveLength(1)
  expect(first.receipt.items[0]).toMatchObject({ quantity: 1, lineTotal: 10 })

  const after = await sessionSummary(request, t.STAFF, session.id)
  expect(after.status).toBe('OPEN')
  expect(after.total).toBe(20)

  // จ่ายที่เหลือทั้งโต๊ะ → ปิด
  const rest = await ok(
    await call(request, 'POST', '/payments', { token: t.STAFF, data: { tableSessionId: session.id, method: 'CASH', expectedTotal: 20 } }),
  )
  expect(rest.amount).toBe(20)
  expect((await sessionSummary(request, t.STAFF, session.id)).status).toBe('CLOSED')
})

test('หารเท่ากัน 3 คน + ลด 10%: ทีละคน คนสุดท้ายจ่ายเศษ ระหว่างหารเก็บแบบอื่นไม่ได้', async ({ request }) => {
  const { session } = await openNewSession(request, t)
  // น้ำ 10 × 10 = 100 → ลด 10% = 90 → หาร 3 = 30 / 30 / 30
  const o = await customerOrder(request, session.token, [{ menuItemId: water.id, quantity: 10 }])
  await serve(request, t.KITCHEN, o.id)
  const pay = (data: Record<string, unknown> = {}) =>
    call(request, 'POST', '/payments', {
      token: t.STAFF,
      data: { tableSessionId: session.id, method: 'CASH', expectedTotal: 100, splitParts: 3, discountPercent: 10, ...data },
    })

  const p1 = await ok(await pay())
  expect(p1.amount).toBe(30)
  expect(p1.receipt).toMatchObject({ splitPart: 1, splitParts: 3, total: 90, discountPercent: 10 })
  const mid = await detail(request, session.id)
  expect(mid.status).toBe('OPEN')
  expect(mid.split).toMatchObject({ parts: 3, paidParts: 1, total: 90, remaining: 60, nextAmount: 30 })

  // มีคนจ่ายแล้ว: เก็บแบบทั้งโต๊ะ / เปลี่ยนจำนวนคน → 409
  expectStatus(await call(request, 'POST', '/payments', { token: t.STAFF, data: { tableSessionId: session.id, method: 'CASH' } }), 409)
  expectStatus(await pay({ splitParts: 2 }), 409)

  const p2 = await ok(await pay())
  const p3 = await ok(await pay())
  expect([p2.receipt.splitPart, p3.receipt.splitPart]).toEqual([2, 3])
  expect(p2.amount + p3.amount).toBeCloseTo(60, 2)
  expect((await sessionSummary(request, t.STAFF, session.id)).status).toBe('CLOSED')

  // จ่ายครบแล้ว: ยกเลิกส่วนแรกไม่ได้ (เงินจะหายจากบิลที่ปิดแล้ว) ต้องยกเลิกส่วนสุดท้ายก่อน
  expectStatus(await call(request, 'PATCH', `/payments/${p1.id}/void`, { token: t.ADMIN, data: { reason: 'ทดสอบ' } }), 409)
  await ok(await call(request, 'PATCH', `/payments/${p3.id}/void`, { token: t.ADMIN, data: { reason: 'ทดสอบ' } }))
  const reopened = await detail(request, session.id)
  expect(reopened.status).toBe('OPEN')
  expect(reopened.split).toMatchObject({ paidParts: 2, nextAmount: 30 })

  // รับเงินคนสุดท้ายใหม่ได้ → โต๊ะปิดอีกครั้ง
  const again = await ok(await pay())
  expect(again.amount).toBe(30)
  expect((await sessionSummary(request, t.STAFF, session.id)).status).toBe('CLOSED')
})

test('หารเท่ากันได้เฉพาะทั้งโต๊ะ และ 2-20 คน', async ({ request }) => {
  const { session } = await openNewSession(request, t)
  const o = await customerOrder(request, session.token, [{ menuItemId: water.id, quantity: 2 }])
  await serve(request, t.KITCHEN, o.id)
  expectStatus(
    await call(request, 'POST', '/payments', { token: t.STAFF, data: { orderIds: [o.id], method: 'CASH', splitParts: 2 } }),
    400,
  )
  for (const bad of [1, 21]) {
    expectStatus(
      await call(request, 'POST', '/payments', { token: t.STAFF, data: { tableSessionId: session.id, method: 'CASH', splitParts: bad } }),
      400,
    )
  }
})
