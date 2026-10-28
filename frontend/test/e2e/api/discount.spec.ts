import { expect, test } from '@playwright/test'
import { call, customerOrder, expectStatus, menuItemByName, ok, openNewSession, serve, tokens, type Role } from './api-helpers'

// ⚠️ ยิง backend จริง — DB ทดสอบเท่านั้น
// ส่วนลด % ตอนเก็บเงิน
// (แยกบิลแบบเลือกรายการ / หารเท่ากัน ถูกเอาออกจากหน้าจอแล้วใน dc0925f — เทสต์ของสองอย่างนั้นลบออกไปด้วย)

let t: Record<Role, string>
let water: Awaited<ReturnType<typeof menuItemByName>>

test.beforeAll(async ({ request }) => {
  t = await tokens(request)
  water = await menuItemByName(request, 'น้ำเปล่า')
})

// ทดสอบ: ส่วนลด % ลดจากยอดบิล ปัดสตางค์ครึ่งขึ้น เก็บ % ไว้ในใบเสร็จ และรับเฉพาะจำนวนเต็ม 1-100
// วิธี: สั่งน้ำ 3 ขวด (30) แล้วเสิร์ฟ → เก็บเงินสดลด 15% → เช็กยอด 25.50 และค่าในใบเสร็จ → ยิงด้วย 0 / 12.5 / 101 ต้องได้ 400
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
