import { test, expect } from '@playwright/test'
import { loginAsCashier } from '../helpers'

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
  await dialog.getByRole('button', { name: 'รับเงิน ฿10' }).click()
  await expect(page.getByRole('dialog', { name: 'ใบเสร็จรับเงิน' })).toBeVisible()
})
