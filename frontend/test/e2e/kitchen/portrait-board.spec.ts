import { test, expect } from '@playwright/test'
import { call, createMenu, customerOrder, openNewSession, serve, tokens, uniqueName } from '../api/api-helpers'
import { loginAsKitchen } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data (DB ทดสอบเท่านั้น — สร้างเมนู/โต๊ะ/ออเดอร์จริง)
// จอครัวบน iPad แนวตั้ง (OrderPage.tsx): 3 คอลัมน์แคบเกินไป จึงเหลือรอคิว + กำลังปรุง
// และย่อ "เสร็จแล้ว" เป็นแถบการ์ดเล็กด้านบน · ตั๋วเรียงอันที่รอนานสุดขึ้นก่อน
// ใช้เมนูที่เทสต์สร้างเอง (ชื่อไม่ซ้ำ) หาการ์ดของตัวเองได้แม้เทสต์อื่นสร้างออเดอร์พร้อมกัน
test.use({ viewport: { width: 768, height: 1024 } })
test.describe.configure({ timeout: 60_000 })

const refOf = (orderId: string) => `#${orderId.slice(0, 6).toUpperCase()}`

// ทดสอบ: iPad แนวตั้งเห็นแค่คอลัมน์รอคิว + กำลังปรุง, เสร็จแล้วเป็นแถบการ์ดที่ยังกด "เสิร์ฟแล้ว · เอาออก" ได้ และตั๋วเก่าขึ้นก่อนตั๋วใหม่
// วิธี: สร้างเมนูทดสอบ + เปิดโต๊ะผ่าน API → สั่ง 2 ใบ (ใบแรกก่อน) + ใบที่ 3 ครัวไล่จนเสิร์ฟ → เปิดบอร์ดครัวขนาด 768×1024
//       → เช็กคอลัมน์ที่เห็น, ลำดับ 2 ใบแรกในรอคิว, การ์ดใบที่ 3 อยู่ในแถบเสร็จแล้ว → กดเอาออก การ์ดหาย → ปิดขายเมนูทดสอบ (ใน finally)
test('iPad แนวตั้ง: 2 คอลัมน์ + แถบเสร็จแล้วที่กดเอาออกได้ · ตั๋วที่รอนานสุดขึ้นก่อน', async ({ page, request }) => {
  const t = await tokens(request)
  const menu = await createMenu(request, t.ADMIN, { name: uniqueName('ข้าวจอแนวตั้ง'), price: 45 })
  try {
    const { session } = await openNewSession(request, t)
    const older = await customerOrder(request, session.token, [{ menuItemId: menu.id, quantity: 1 }])
    const newer = await customerOrder(request, session.token, [{ menuItemId: menu.id, quantity: 2 }])
    const done = await customerOrder(request, session.token, [{ menuItemId: menu.id, quantity: 3 }])
    await serve(request, t.KITCHEN, done.id)

    await loginAsKitchen(page, request)
    await page.goto('/employee/order')

    const queue = page.getByRole('group', { name: 'ตั๋วรอคิว' })
    await expect(queue).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('group', { name: 'ตั๋วกำลังทำ' })).toBeVisible()
    // คอลัมน์เสร็จแล้วไม่มีบนจอแนวตั้ง — ย้ายไปเป็นแถบด้านบน
    await expect(page.getByRole('group', { name: 'ตั๋วเสร็จแล้ว รอเสิร์ฟ' })).toHaveCount(0)

    // ตั๋วเก่าขึ้นก่อน — ครัวทำตามคิว
    await expect(queue).toContainText(refOf(newer.id))
    const queueText = await queue.innerText()
    expect(queueText.indexOf(refOf(older.id))).toBeLessThan(queueText.indexOf(refOf(newer.id)))

    // การ์ดในแถบเสร็จแล้วบอกจำนวน + ชื่อเมนู และกดเอาออกได้
    const strip = page.getByRole('region', { name: 'เสร็จแล้ว รอเสิร์ฟ', exact: true })
    const card = strip.getByRole('listitem').filter({ hasText: `3× ${menu.name}` })
    await expect(card).toBeVisible()
    await card.getByRole('button', { name: 'เสิร์ฟแล้ว' }).click()
    await expect(card).toHaveCount(0)
  } finally {
    // เมนูถูกสั่งแล้วลบไม่ได้ — ปิดขายไว้ไม่ให้โผล่ในหน้าลูกค้าของเทสต์อื่น
    await call(request, 'PATCH', `/menu/${menu.id}/availability`, { token: t.ADMIN, data: { isAvailable: false } })
  }
})

// ทดสอบ: จอแนวนอน (1024×768) ยังเป็น 3 คอลัมน์เหมือนเดิม ไม่มีแถบเสร็จแล้ว
test('จอแนวนอน: ยังเป็น 3 คอลัมน์ ไม่มีแถบเสร็จแล้ว', async ({ page, request }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await loginAsKitchen(page, request)
  await page.goto('/employee/order')
  await expect(page.getByRole('group', { name: 'ตั๋วรอคิว' })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('group', { name: 'ตั๋วเสร็จแล้ว รอเสิร์ฟ' })).toBeVisible()
  // "เสร็จแล้ว" มีที่เดียวคือคอลัมน์ (ไม่มีแถบซ้ำด้านบน)
  const done = page.getByRole('region', { name: 'เสร็จแล้ว รอเสิร์ฟ', exact: true })
  await expect(done).toHaveCount(1)
  await expect(done.getByRole('group', { name: 'ตั๋วเสร็จแล้ว รอเสิร์ฟ' })).toBeVisible()
})
