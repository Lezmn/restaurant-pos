import { test, expect } from '@playwright/test'
import { call, expectStatus, menuItemByName, ok, tokens } from './api-helpers'

// ⚠️ ต้องรัน backend จริง + seed data (DB ทดสอบเท่านั้น)
// เคส API ที่เหลือ: เปิดโต๊ะกลับบ้านผ่าน table-sessions, บันทึก LINE ครั้งแรกโดยไม่มี token (TC-API-041/105)

// ทดสอบ: เปิดโต๊ะเสมือนของกลับบ้านผ่าน POST /table-sessions ต้องถูกปฏิเสธ 400 (TC-API-041)
// วิธี: สั่งกลับบ้าน 1 ใบผ่าน POST /orders/takeaway เพื่อให้ได้ tableId ของโต๊ะกลับบ้าน → ส่ง POST /table-sessions ด้วย tableId นั้น ต้องได้ 400
test('POST /table-sessions ด้วยโต๊ะกลับบ้าน → 400', async ({ request }) => {
  const t = await tokens(request)
  const water = await menuItemByName(request, 'น้ำเปล่า')
  const takeaway = await ok<{ tableId: string }>(
    await call(request, 'POST', '/orders/takeaway', { token: t.STAFF, data: { items: [{ menuItemId: water.id, quantity: 1 }] } }),
  )
  const res = await call(request, 'POST', '/table-sessions', { token: t.STAFF, data: { tableId: takeaway.tableId } })
  expectStatus(res, 400)
  expect(await res.text()).toContain('โต๊ะกลับบ้านเปิดจากหน้านี้ไม่ได้')
})

// ทดสอบ: บันทึก LINE ครั้งแรกโดยไม่ส่ง token ต้อง 400 (TC-API-105)
// วิธี: ถ้า DB นี้เคยบันทึก token ไว้แล้วข้ามเทสนี้ (ห้ามลบ/แก้ค่าจริง) → ไม่งั้นส่ง PUT /settings/line {enabled:true,to:"U…"} ไม่มี token ต้องได้ 400 "ยังไม่มี Channel access token"
test('PUT /settings/line ตอนยังไม่เคยมี token → 400', async ({ request }) => {
  const t = await tokens(request)
  const current = await ok<{ hasToken: boolean }>(await call(request, 'GET', '/settings/line', { token: t.ADMIN }))
  test.skip(current.hasToken, 'DB นี้ตั้ง LINE token ไว้แล้ว — ไม่แตะค่าจริง')
  const res = await call(request, 'PUT', '/settings/line', {
    token: t.ADMIN,
    data: { enabled: true, to: `U${'0123456789abcdef'.repeat(2)}` },
  })
  expectStatus(res, 400)
  expect(await res.text()).toContain('ยังไม่มี Channel access token')
})
