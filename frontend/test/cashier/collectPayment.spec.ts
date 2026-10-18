import { test, expect } from '@playwright/test'
import {
  advanceOrderToServed,
  loginAsAdmin,
  loginAsCashier,
  openTableAndPlaceOrder,
} from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data ที่ localhost:3000
// setup ด้วย admin: เปิดโต๊ะ + สั่งอาหาร + ไล่สถานะถึง "เสิร์ฟแล้ว" ก่อน (backend ไม่ให้เก็บเงิน
// ถ้าออเดอร์ยังไม่ถูกเสิร์ฟ ดู CheckPage.tsx: blocked = unpaid.length===0 || notServed.length>0)
// แล้วสลับตัวตนเป็น cashier (STAFF) มาเก็บเงินจริงตามหน้าที่ — ข้าวผัด(หมู) ราคารวม 50 บาท

const FRIED_RICE = /^ข้าวผัด(?!กะเพรา)/

test('cashier เก็บเงินสดสำเร็จ เห็นใบเสร็จถูกต้องและบิลไปโผล่ในรายการวันนี้', async ({
  page,
  request,
}) => {
  await loginAsAdmin(page, request)
  const { tableCardText, orderRef } = await openTableAndPlaceOrder(page, FRIED_RICE)
  await advanceOrderToServed(page, orderRef)

  await loginAsCashier(page, request)
  await page.goto('/employee/check')

  const tableName = tableCardText.replace(/^โต๊ะ\s*/, '')
  const row = page.getByRole('row').filter({ has: page.getByRole('cell', { name: tableName, exact: true }) })
  await row.getByRole('button', { name: 'เก็บเงิน' }).click()

  // ลูกค้าไม่ได้กดเช็คบิลมาเอง เลยตั้งต้นเป็น "เงินสด" ให้ และเติมยอดที่ต้องจ่ายมาให้อัตโนมัติ
  const dialog = page.getByRole('dialog', { name: 'ชำระเงินสด' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('ราคาที่เก็บจริง')).toHaveValue('50')

  await dialog.getByRole('button', { name: 'บันทึก' }).click()

  // PaymentDialog ปิดแล้วเด้ง ReceiptDialog ขึ้นมาทันที
  const receipt = page.getByRole('dialog', { name: 'ใบเสร็จรับเงิน' })
  await expect(receipt).toBeVisible()
  await expect(receipt.getByText('เงินสด')).toBeVisible()
  await expect(receipt.getByText('฿50').first()).toBeVisible()
  await receipt.getByRole('button', { name: 'ปิด' }).click()

  // จ่ายครบแล้ว backend ปิดโต๊ะให้เอง → แถวหายจากตารางโต๊ะที่เปิดอยู่
  // และบิลไปโผล่ในตาราง "บิลที่เก็บแล้ววันนี้" (ตารางที่สอง)
  const openTables = page.locator('table').first()
  await expect(openTables.getByRole('row').filter({ has: page.getByRole('cell', { name: tableName, exact: true }) })).toHaveCount(0)
  await expect(
    page.locator('table').nth(1).getByRole('row').filter({ has: page.getByRole('cell', { name: tableName, exact: true }) }).filter({ hasText: 'เงินสด' }),
  ).toBeVisible()
})

test('cashier เก็บเงินผ่าน PromptPay (สแกน) สำเร็จ เห็น QR และใบเสร็จถูกต้อง', async ({
  page,
  request,
}) => {
  await loginAsAdmin(page, request)
  const { tableCardText, orderRef } = await openTableAndPlaceOrder(page, FRIED_RICE)
  await advanceOrderToServed(page, orderRef)

  await loginAsCashier(page, request)
  await page.goto('/employee/check')

  const tableName = tableCardText.replace(/^โต๊ะ\s*/, '')
  const row = page.getByRole('row').filter({ has: page.getByRole('cell', { name: tableName, exact: true }) })
  await row.getByRole('button', { name: 'เก็บเงิน' }).click()

  // ใช้ locator แบบไม่ระบุชื่อ (ไม่เหมือนเทสเงินสด) เพราะ title ของ dialog เปลี่ยนจาก
  // "ชำระเงินสด" เป็น "ชำระผ่าน PromptPay" ทันทีที่กดเลือกวิธีจ่าย (dialogTitle[method] ใน CheckPage.tsx)
  const dialog = page.getByRole('dialog')
  await expect(dialog).toHaveAccessibleName('ชำระเงินสด')
  await dialog.getByRole('button', { name: 'PromptPay' }).click()
  await expect(dialog).toHaveAccessibleName('ชำระผ่าน PromptPay')

  // เลือก PromptPay แล้วต้องเห็น QR ให้ลูกค้าสแกนพร้อมยอดเงิน — โปรเจกต์นี้ยังไม่ได้ตั้ง
  // VITE_PROMPTPAY_ID ใน .env จริง (มีแค่ .env.example) เลยต้องขึ้นคำเตือนโหมดเดโมเสมอ
  await expect(dialog.getByText('ให้ลูกค้าสแกนเพื่อจ่าย')).toBeVisible()
  await expect(dialog.getByText('฿50').first()).toBeVisible()
  await expect(dialog.getByText('โหมดเดโม')).toBeVisible()

  // PromptPay ต้องสแกนสลิปให้ระบบตรวจ (SlipOK) ก่อนบันทึก — ยังไม่สแกนกดบันทึกไม่ได้
  const save = dialog.getByRole('button', { name: 'บันทึก' })
  await expect(save).toBeDisabled()
  // จำลองเครื่องสแกน 2D: พิมพ์ข้อความ QR ของสลิปลงช่องแล้วกด Enter (Enter ต้องไม่ submit ฟอร์ม)
  // backend โหมดจำลอง (SLIPOK_MOCK=true) ขึ้นต้น MOCK-OK = ตรวจผ่าน
  // ถ้า backend ยังไม่ได้ตั้ง SlipOK เลย บิลจะถูกบันทึกเป็น "รอตรวจสลิป" ก็ยังผ่านเทสนี้
  const slip = dialog.getByPlaceholder(/ยิงเครื่องสแกน/)
  await slip.fill(`MOCK-OK-e2e-${Date.now()}`)
  await slip.press('Enter')
  await expect(dialog).toBeVisible()
  await save.click()

  const receipt = page.getByRole('dialog', { name: 'ใบเสร็จรับเงิน' })
  await expect(receipt).toBeVisible()
  await expect(receipt.getByText('PromptPay')).toBeVisible()
  await receipt.getByRole('button', { name: 'ปิด' }).click()

  // จ่ายครบแล้วโต๊ะหายจากตารางโต๊ะที่เปิดอยู่ บิลไปอยู่ "บิลที่เก็บแล้ววันนี้" พร้อมป้ายผลตรวจสลิป
  await expect(page.locator('table').first().getByRole('row').filter({ has: page.getByRole('cell', { name: tableName, exact: true }) })).toHaveCount(0)
  await expect(
    page.locator('table').nth(1).getByRole('row').filter({ has: page.getByRole('cell', { name: tableName, exact: true }) }).filter({ hasText: /ตรวจสลิปแล้ว|รอตรวจสลิป/ }),
  ).toBeVisible()
})
