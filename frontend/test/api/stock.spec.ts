import { test, expect } from '@playwright/test'
import { call, customerOrder, ok, openNewSession, tokens } from './api-helpers'

// สต็อกอัตโนมัติ: ออเดอร์ตัดยอดใน transaction เดียวกัน เหลือ 0 ปิดเอง ยกเลิกก่อนครัวทำคืนยอด
// สร้างวัตถุดิบ + เมนูของตัวเองทุกรอบ ไม่แตะเมนู seed ที่เทสอื่นใช้

interface IngredientRow {
  id: string
  stockQty: number | null
  isAvailable: boolean
}

test('สั่งจนหมด → ปิดขายเอง สั่งต่อไม่ได้ → ยกเลิกก่อนครัวทำคืนยอด / ครัวเริ่มทำแล้วยกเลิกไม่คืน', async ({
  request,
}) => {
  const t = await tokens(request)
  const suffix = Date.now().toString(36)
  const ingredient = await ok<IngredientRow>(
    await call(request, 'POST', '/ingredients', {
      token: t.ADMIN,
      data: { name: `สต็อกทดสอบ ${suffix}`, stockQty: 2 },
    }),
  )
  const [category] = await ok<{ id: string }[]>(await call(request, 'GET', '/categories', { token: t.ADMIN }))
  const menu = await ok<{ id: string }>(
    await call(request, 'POST', '/menu', {
      token: t.ADMIN,
      data: { name: `เมนูสต็อก ${suffix}`, price: 30, categoryId: category.id, ingredientIds: [ingredient.id] },
    }),
  )
  const stock = async () =>
    ok<IngredientRow>(await call(request, 'GET', `/ingredients/${ingredient.id}`, { token: t.ADMIN }))
  const { session } = await openNewSession(request, t)

  try {
    // สั่ง 2 จาน = ใช้หมดพอดี → วัตถุดิบปิดขายเอง
    const first = await customerOrder(request, session.token, [{ menuItemId: menu.id, quantity: 2 }])
    expect(await stock()).toMatchObject({ stockQty: 0, isAvailable: false })

    // หมดแล้วสั่งเพิ่มไม่ได้ (ไม่ตัดติดลบ)
    const blocked = await call(request, 'POST', '/public/orders', {
      data: { sessionToken: session.token, items: [{ menuItemId: menu.id, quantity: 1 }] },
    })
    expect(blocked.status()).toBeGreaterThanOrEqual(400)
    expect(blocked.status()).toBeLessThan(500)

    // ยกเลิกก่อนครัวเริ่มทำ = ของยังไม่ถูกใช้ → คืน 2 และเปิดขายกลับเอง
    await ok(await call(request, 'PATCH', `/orders/${first.id}/status`, { token: t.KITCHEN, data: { status: 'CANCELLED' } }))
    expect(await stock()).toMatchObject({ stockQty: 2, isAvailable: true })

    // ครัวเริ่มทำแล้วค่อยยกเลิก = วัตถุดิบถูกใช้ไปแล้ว → ไม่คืน
    const second = await customerOrder(request, session.token, [{ menuItemId: menu.id, quantity: 1 }])
    await ok(await call(request, 'PATCH', `/orders/${second.id}/status`, { token: t.KITCHEN, data: { status: 'PREPARING' } }))
    await ok(await call(request, 'PATCH', `/orders/${second.id}/status`, { token: t.KITCHEN, data: { status: 'CANCELLED' } }))
    expect(await stock()).toMatchObject({ stockQty: 1, isAvailable: true })
  } finally {
    // เก็บกวาด: เมนูที่มีประวัติออเดอร์ลบไม่ได้ → ปิดขายแทน (ไม่ให้ไปโผล่ในเมนูของเทสอื่น)
    await call(request, 'PATCH', `/table-sessions/${session.id}/close`, { token: t.STAFF })
    const removed = await call(request, 'DELETE', `/menu/${menu.id}`, { token: t.ADMIN })
    if (!removed.ok()) {
      await call(request, 'PATCH', `/menu/${menu.id}/availability`, { token: t.ADMIN, data: { isAvailable: false } })
    }
    await call(request, 'DELETE', `/ingredients/${ingredient.id}`, { token: t.ADMIN })
  }
})
