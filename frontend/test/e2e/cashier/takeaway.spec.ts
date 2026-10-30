import { test, expect } from '@playwright/test'
import { API_URL, loginAsCashier, loginViaApi } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data (DB ทดสอบเท่านั้น — ส่งออเดอร์เข้าครัวและเก็บเงินจริง)
// หน้าสั่งกลับบ้าน: ปุ่มจ่ายเงินสด / PromptPay พาไปหน้ารับเงินที่เลือกวิธีจ่ายไว้ให้แล้ว
test.use({ viewport: { width: 1280, height: 900 } })

const waterTile = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: /^น้ำเปล่า ฿10/ })

test('กลับบ้าน: กด "PromptPay" → หน้ารับเงินของคิวนั้น เลือก PromptPay ไว้แล้วและมี QR', async ({ page, request }) => {
  await loginAsCashier(page, request)
  await page.goto('/employee/takeaway')

  await waterTile(page).click()
  await waterTile(page).click()
  await page.getByRole('button', { name: /^PromptPay/ }).click()

  await expect(page).toHaveURL(/\/employee\/check\?pay=.+&method=PROMPTPAY/)
  const dialog = page.getByRole('dialog', { name: /^รับเงิน กลับบ้าน #\d+/ })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'PromptPay', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByText('ให้ลูกค้าสแกนเพื่อจ่าย')).toBeVisible()
  await expect(dialog.getByText(/ยอดที่ต้องจ่าย\s*฿20/)).toBeVisible()
})

test('กลับบ้าน: กด "เงินสด" → รับเงินได้ทันที ใบเสร็จออก', async ({ page, request }) => {
  await loginAsCashier(page, request)
  await page.goto('/employee/takeaway')

  await waterTile(page).click()
  await page.getByRole('button', { name: /^เงินสด/ }).click()

  await expect(page).toHaveURL(/method=CASH/)
  const dialog = page.getByRole('dialog', { name: /^รับเงิน กลับบ้าน #\d+/ })
  await expect(dialog.getByRole('button', { name: 'เงินสด', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await dialog.getByRole('button', { name: 'รับเงิน', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'ใบเสร็จรับเงิน' })).toBeVisible()
})

// ทดสอบ: ตะกร้ากลับบ้านว่างต้องส่งไม่ได้ (TC-107) และล้างตะกร้าแล้วปุ่มส่งกลับไปกดไม่ได้
// วิธี: เปิดหน้ากลับบ้าน เช็กข้อความ "ยังไม่มีรายการ" ปุ่มเงินสด/PromptPay กดไม่ได้ → ใส่น้ำเปล่า ปุ่มกดได้ → กด "ล้างตะกร้า" ปุ่มกลับไปกดไม่ได้
test('กลับบ้าน: ตะกร้าว่างส่งไม่ได้ ใส่ของแล้วส่งได้ ล้างแล้วส่งไม่ได้อีก', async ({ page, request }) => {
  await loginAsCashier(page, request)
  await page.goto('/employee/takeaway')
  const cash = page.getByRole('button', { name: /^เงินสด/ })
  const pp = page.getByRole('button', { name: /^PromptPay/ })
  await expect(page.getByText('ยังไม่มีรายการ — กดเมนูเพื่อเพิ่ม')).toBeVisible()
  await expect(cash).toBeDisabled()
  await expect(pp).toBeDisabled()

  await waterTile(page).click()
  await expect(cash).toBeEnabled()
  await page.getByRole('button', { name: 'ล้างตะกร้า' }).click()
  await expect(page.getByText('ยังไม่มีรายการ — กดเมนูเพื่อเพิ่ม')).toBeVisible()
  await expect(cash).toBeDisabled()
})

// ทดสอบ: เมนูในตะกร้ากลับบ้านถูกปิดขายระหว่างรอ ต้องขึ้น "หมดแล้ว" และส่งไม่ได้จนกว่าจะลบออก (TC-108)
// วิธี: ใส่น้ำเปล่าลงตะกร้า → ครัวปิดขายผ่าน API → เห็น "หมดแล้ว — ลบออกก่อนส่ง" ปุ่มเงินสด/PromptPay กดไม่ได้ → กดลบรายการ ปุ่มกลับไปกดไม่ได้เพราะตะกร้าว่าง (เปิดขายคืนใน finally)
test('กลับบ้าน: เมนูในตะกร้าหมดระหว่างรอ → ขึ้น "หมดแล้ว" และส่งไม่ได้จนกว่าจะลบออก', async ({ page, request }) => {
  const kitchen = await loginViaApi(request, 'kitchen', 'ChangeMe123!')
  const headers = { Authorization: `Bearer ${kitchen.accessToken}` }
  const menu = await (await request.get(`${API_URL}/public/menu`)).json()
  const water = menu
    .flatMap((c: { menuItems: { id: string; name: string }[] }) => c.menuItems)
    .find((m: { name: string }) => m.name === 'น้ำเปล่า')
  try {
    await loginAsCashier(page, request)
    await page.goto('/employee/takeaway')
    await waterTile(page).click()
    const cash = page.getByRole('button', { name: /^เงินสด/ })
    await expect(cash).toBeEnabled()

    const off = await request.patch(`${API_URL}/menu/${water.id}/availability`, { headers, data: { isAvailable: false } })
    expect(off.ok()).toBe(true)
    await expect(page.getByText('หมดแล้ว — ลบออกก่อนส่ง')).toBeVisible()
    await expect(cash).toBeDisabled()
    await expect(page.getByRole('button', { name: /^PromptPay/ })).toBeDisabled()

    await page.getByRole('button', { name: /^ลบ น้ำเปล่า/ }).click()
    await expect(page.getByText('หมดแล้ว — ลบออกก่อนส่ง')).toHaveCount(0)
  } finally {
    await request.patch(`${API_URL}/menu/${water.id}/availability`, { headers, data: { isAvailable: true } })
  }
})
