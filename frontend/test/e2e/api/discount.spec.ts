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

// ทดสอบ: ส่วนลด % เงินสด ลดจากยอดบิลแล้วปัดยอดเก็บครึ่งขึ้นเป็นบาทเต็ม เก็บ % ไว้ในใบเสร็จ และรับเฉพาะจำนวนเต็ม 1-100
// วิธี: สั่งน้ำ 3 ขวด (30) แล้วเสิร์ฟ → เก็บเงินสดลด 15% → เช็กยอด 26 ส่วนลด 4 และค่าในใบเสร็จ → ยิงด้วย 0 / 12.5 / 101 ต้องได้ 400
test('ส่วนลด % เงินสด: ปัดยอดเก็บครึ่งขึ้นเป็นบาทเต็ม และเก็บ % ไว้ในใบเสร็จ', async ({ request }) => {
  const { session } = await openNewSession(request, t)
  // น้ำ 10 × 3 = 30 → ลด 15% = 4.50 → 25.50 → เงินสดปัดเป็น 26 (ส่วนลดเหลือ 4)
  const o = await customerOrder(request, session.token, [{ menuItemId: water.id, quantity: 3 }])
  await serve(request, t.KITCHEN, o.id)
  const payment = await ok(
    await call(request, 'POST', '/payments', {
      token: t.STAFF,
      data: { tableSessionId: session.id, method: 'CASH', expectedTotal: 30, discountPercent: 15 },
    }),
  )
  expect(payment.amount).toBe(26)
  expect(payment.receipt).toMatchObject({ subtotal: 30, discount: 4, discountPercent: 15, total: 26 })
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

// ทดสอบ: ส่วนลด % PromptPay ไม่ปัดเป็นบาท — ยอดใน QR/สลิปต้องตรงถึงสตางค์
// วิธี: สั่งน้ำ 3 ขวด (30) แล้วเสิร์ฟ → ADMIN เก็บ PromptPay ลด 15% แบบยืนยันเอง (ไม่ต้องมีสลิป) → เช็กยอด 25.50 ส่วนลด 4.50
test('ส่วนลด % PromptPay: เก็บตามสตางค์จริง ไม่ปัด', async ({ request }) => {
  const { session } = await openNewSession(request, t)
  const o = await customerOrder(request, session.token, [{ menuItemId: water.id, quantity: 3 }])
  await serve(request, t.KITCHEN, o.id)
  const payment = await ok(
    await call(request, 'POST', '/payments', {
      token: t.ADMIN,
      data: {
        tableSessionId: session.id,
        method: 'PROMPTPAY',
        expectedTotal: 30,
        discountPercent: 15,
        slipOverrideReason: 'ลูกค้าโชว์แอป',
      },
    }),
  )
  expect(payment.amount).toBe(25.5)
  expect(payment.receipt).toMatchObject({ subtotal: 30, discount: 4.5, discountPercent: 15, total: 25.5 })
})
