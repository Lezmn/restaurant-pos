import { test, expect, devices, type Page } from '@playwright/test'
import { call, createMenu, customerOrder, openNewSession, tokens, uniqueName } from '../api/api-helpers'
import { loginAsKitchen } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data (DB ทดสอบเท่านั้น — สร้างเมนู/โต๊ะ/ออเดอร์จริง)
// โน้ตต่อจาน + ตัวจับเวลาบนจอครัว (OrderPage.tsx):
//   ลูกค้ากดปุ่มลัดความเผ็ด (เลือกได้อย่างเดียว) + พิมพ์เพิ่มเอง → ครัวเห็นโน้ตบนตั๋ว
//   คำว่า "แพ้" = ป้าย "แพ้อาหาร" หัวตั๋ว + โน้ตพื้นแดง · โน้ตทั่วไป = กล่อง "หมายเหตุ"
//   เวลารอ: นาทีแรก "เพิ่งสั่ง" + ป้าย "ใหม่" · เกิน 15 นาที = ป้ายเตือนเกินเวลา
// ใช้เมนูที่เทสต์สร้างเอง (ไม่มีตัวเลือกบังคับ) — วัตถุดิบ seed ถูกเทสต์อื่นปิด/เปิดอยู่
test.describe.configure({ timeout: 60_000 })

const ticket = (page: Page, orderRef: string) =>
  page.getByRole('region', { name: 'รอคิว', exact: true }).locator('article', { hasText: `#${orderRef}` })

// ทดสอบ: ลูกค้าเลือกระดับความเผ็ดได้อย่างเดียว พิมพ์โน้ตต่อได้ แล้วครัวเห็นโน้ต "แพ้" เป็นป้ายแพ้อาหาร (หัวตั๋ว + โน้ตแดง) ส่วนโน้ตทั่วไปเป็นกล่อง "หมายเหตุ" และตั๋วใหม่ขึ้น "เพิ่งสั่ง" กับป้าย "ใหม่"
// วิธี: admin สร้างเมนูทดสอบ + เปิดโต๊ะผ่าน API → ครัวเปิดบอร์ดรอ → มือถือเปิดเมนู กด "ไม่เผ็ด" แล้ว "เผ็ดมาก" (ต้องเหลืออันเดียว) พิมพ์ ", แพ้กุ้ง" ต่อท้าย → ส่งเข้าครัว (เก็บ id จาก response) → สั่งอีกใบผ่าน API โน้ต "ไม่เผ็ด" → เช็กตั๋วใบแรกมีป้ายแพ้อาหาร + โน้ตแดง ใบที่สองมีกล่องหมายเหตุไม่มีป้ายแพ้ ทั้งสองใบขึ้นเพิ่งสั่ง/ใหม่ → ลบเมนูไม่ได้เพราะถูกสั่งแล้ว ปิดขายแทน (ใน finally)
test('โน้ตต่อจาน: ปุ่มความเผ็ดเลือกได้อย่างเดียว · ครัวเห็น "แพ้อาหาร" เด่นกว่าโน้ตทั่วไป · ตั๋วใหม่ขึ้น "เพิ่งสั่ง"', async ({
  browser,
  page,
  request,
}) => {
  const t = await tokens(request)
  const menu = await createMenu(request, t.ADMIN, { name: uniqueName('ข้าวโน้ตครัว'), price: 55 })
  const { session } = await openNewSession(request, t)
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 375, height: 812 } })
  const customer = await ctx.newPage()

  try {
    await loginAsKitchen(page, request)
    await page.goto('/employee/order')
    await expect(page.getByRole('heading', { name: 'รอคิว' })).toBeVisible()

    await customer.goto(`/t/${session.token}/menu/${menu.id}`)
    const mild = customer.getByRole('button', { name: 'ไม่เผ็ด', exact: true })
    const hot = customer.getByRole('button', { name: 'เผ็ดมาก', exact: true })
    await mild.click()
    await expect(mild).toHaveAttribute('aria-pressed', 'true')
    // ระดับความเผ็ดเลือกได้อย่างเดียว — กดอันใหม่แทนอันเดิม
    await hot.click()
    await expect(hot).toHaveAttribute('aria-pressed', 'true')
    await expect(mild).toHaveAttribute('aria-pressed', 'false')
    const note = customer.getByPlaceholder(/พิมพ์เพิ่มเองได้/)
    await expect(note).toHaveValue('เผ็ดมาก')
    await note.press('End')
    await note.pressSequentially(', แพ้กุ้ง')
    await expect(note).toHaveValue('เผ็ดมาก, แพ้กุ้ง')
    await customer.getByRole('button', { name: /เพิ่มรายการ/ }).click()

    const [res] = await Promise.all([
      customer.waitForResponse((r) => new URL(r.url()).pathname === '/public/orders' && r.request().method() === 'POST'),
      customer.getByRole('button', { name: '➤ ส่งรายการเข้าครัว' }).click(),
    ])
    expect(res.ok()).toBe(true)
    const allergyRef = ((await res.json()).id as string).slice(0, 6).toUpperCase()
    const plain = await customerOrder(request, session.token, [{ menuItemId: menu.id, quantity: 1, note: 'ไม่เผ็ด' }])
    const plainRef = plain.id.slice(0, 6).toUpperCase()

    await test.step('ตั๋วที่มีโน้ตแพ้อาหาร', async () => {
      const card = ticket(page, allergyRef)
      await expect(card).toBeVisible({ timeout: 10_000 })
      await expect(card.getByText('แพ้อาหาร', { exact: true })).toBeVisible()
      // โน้ตแดงมีข้อความสำหรับโปรแกรมอ่านจอ "ระวัง แพ้อาหาร:" นำหน้า
      await expect(card.getByText('เผ็ดมาก, แพ้กุ้ง')).toBeVisible()
      await expect(card).toContainText('ระวัง แพ้อาหาร: เผ็ดมาก, แพ้กุ้ง')
      await expect(card.getByText('หมายเหตุ', { exact: true })).toHaveCount(0)
      await expect(card.getByText('เพิ่งสั่ง')).toBeVisible()
      await expect(card.getByText('ใหม่', { exact: true })).toBeVisible()
    })

    await test.step('ตั๋วที่มีโน้ตทั่วไป', async () => {
      const card = ticket(page, plainRef)
      await expect(card).toBeVisible({ timeout: 10_000 })
      await expect(card.getByText('หมายเหตุ', { exact: true })).toBeVisible()
      await expect(card).toContainText('หมายเหตุไม่เผ็ด')
      await expect(card.getByText('แพ้อาหาร', { exact: true })).toHaveCount(0)
    })
  } finally {
    await ctx.close()
    // เมนูถูกสั่งแล้วลบไม่ได้ — ปิดขายไว้ไม่ให้โผล่ในหน้าลูกค้าของเทสต์อื่น
    await call(request, 'PATCH', `/menu/${menu.id}/availability`, { token: t.ADMIN, data: { isAvailable: false } })
  }
})

// ทดสอบ: ตั๋วที่รอเกิน 15 นาทีต้องเปลี่ยนเป็นป้ายเตือน (ไม่ใช่แค่สี) และป้าย "ใหม่" หายไป โดยครัวไม่ต้อง refresh
// วิธี: เปิดโต๊ะ + สั่งเมนูทดสอบผ่าน API → ตั้งนาฬิกาจำลองของเบราว์เซอร์ (page.clock) ก่อนเปิดบอร์ดครัว → เช็กตั๋วขึ้น "เพิ่งสั่ง" + "ใหม่" → เลื่อนเวลาไป 16 นาที → เช็กข้อความ "รอ 16 นาที" + "เกินเวลา 15 นาที" และไม่มีป้ายใหม่ → ปิดขายเมนูทดสอบ (ใน finally)
test('ตัวจับเวลาครัว: รอเกิน 15 นาที → ป้ายเตือน · เกิน 30 นาที → ขั้นที่สอง และป้าย "ใหม่" หายเอง (ไม่ refresh)', async ({ page, request }) => {
  const t = await tokens(request)
  const menu = await createMenu(request, t.ADMIN, { name: uniqueName('ข้าวจับเวลา'), price: 40 })
  try {
    const { session } = await openNewSession(request, t)
    const order = await customerOrder(request, session.token, [{ menuItemId: menu.id, quantity: 1 }])
    const orderRef = order.id.slice(0, 6).toUpperCase()

    await page.clock.install()
    await loginAsKitchen(page, request)
    await page.goto('/employee/order')
    const card = ticket(page, orderRef)
    await expect(card).toBeVisible({ timeout: 10_000 })
    await expect(card.getByText('เพิ่งสั่ง')).toBeVisible()
    await expect(card.getByText('ใหม่', { exact: true })).toBeVisible()

    // ตัวจับเวลาของหน้าอัปเดตทุก 30 วิ — เลื่อนนาฬิกาไป 16 นาทีให้ interval ทำงานเอง
    await page.clock.fastForward('16:00')
    await expect(card).toContainText('รอ 16 นาที')
    await expect(card).toContainText('เกินเวลา 15 นาที')
    await expect(card.getByText('ใหม่', { exact: true })).toHaveCount(0)

    // ขั้นที่สอง: เกิน 30 นาที = ป้ายแดงทึบ screen reader ได้ยิน "เกินเวลา 30 นาที"
    await page.clock.fastForward('15:00')
    await expect(card).toContainText('รอ 31 นาที')
    await expect(card).toContainText('เกินเวลา 30 นาที')
  } finally {
    await call(request, 'PATCH', `/menu/${menu.id}/availability`, { token: t.ADMIN, data: { isAvailable: false } })
  }
})
