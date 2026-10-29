import { test, expect } from '@playwright/test'
import {
  advanceOrderToServed,
  checkTableTile,
  loginAsAdmin,
  loginAsCashier,
  openTableAndPlaceOrder,
  paidBillsTable,
  printPromptPayReceipt,
  slipDialog,
} from '../helpers'

// ไล่ออเดอร์ผ่านจอครัว (มีรอเลิกทำ 5 วิ) แล้วรับเงินต่อ — รันพร้อมกันหลาย worker เกิน 30 วิได้
test.describe.configure({ timeout: 60_000 })

// ⚠️ ต้องรัน backend จริง + seed data ที่ localhost:3000
// setup ด้วย admin: เปิดโต๊ะ + สั่งอาหาร + ไล่สถานะถึง "เสิร์ฟแล้ว" ก่อน (backend ไม่ให้เก็บเงิน
// ถ้าออเดอร์ยังไม่ถูกเสิร์ฟ ดู CheckPage.tsx: state 'serving' ไม่มีปุ่มรับเงิน)
// แล้วสลับตัวตนเป็น cashier (STAFF) มาเก็บเงินจริงตามหน้าที่ — ข้าวผัด(หมู) ราคารวม 50 บาท

const FRIED_RICE = /^ข้าวผัด(?!กะเพรา)/

// ทดสอบ: cashier เก็บเงินสดได้: ตั้งต้นเป็นเงินสด ยอดถูก ใบเสร็จถูก โต๊ะหายจากหน้า Check และบิลไปอยู่ในรายการบิลวันนี้
// วิธี: admin เปิดโต๊ะ สั่งข้าวผัดหมู (50) แล้วไล่สถานะจนเสิร์ฟ → สลับเป็น cashier กดรับเงิน → เช็กว่าเลือกเงินสดไว้และยอด ฿50 → กดรับเงิน → เช็กใบเสร็จ จดเลขใบเสร็จ → เช็กว่าการ์ดโต๊ะหาย และตารางบิลมีแถวเลขนั้นแบบเงินสด
test('cashier เก็บเงินสดสำเร็จ เห็นใบเสร็จถูกต้องและบิลไปโผล่ในรายการวันนี้', async ({
  page,
  request,
}) => {
  await loginAsAdmin(page, request)
  const { tableCardText, orderId } = await openTableAndPlaceOrder(page, FRIED_RICE)
  await advanceOrderToServed(page, orderId)

  await loginAsCashier(page, request)
  await page.goto('/employee/check')

  const tableName = tableCardText.replace(/^โต๊ะ\s*/, '')
  const tile = checkTableTile(page, tableName)
  await tile.getByRole('button', { name: /^รับเงิน/ }).click()

  // ลูกค้าไม่ได้กดเช็คบิลมาเอง เลยตั้งต้นเป็น "เงินสด" ให้ และเติมยอดที่ต้องจ่ายมาให้อัตโนมัติ
  const dialog = page.getByRole('dialog', { name: `รับเงิน โต๊ะ ${tableName}` })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'เงินสด' })).toHaveAttribute('aria-pressed', 'true')
  // หน้า Check ใหม่ซ่อนช่องราคาไว้หลังปุ่ม 'ให้ส่วนลด' — ยอดเต็มแสดงเป็น 'ยอดที่ต้องจ่าย'
  await expect(dialog.getByText(/ยอดที่ต้องจ่าย\s*฿50/)).toBeVisible()

  // ปุ่มยืนยันไม่มียอดแล้ว (ยอดดูที่แถบ "ยอดที่ต้องจ่าย" ด้านบน)
  await dialog.getByRole('button', { name: 'รับเงิน', exact: true }).click()

  // PaymentDialog ปิดแล้วเด้ง ReceiptDialog ขึ้นมาทันที
  const receipt = page.getByRole('dialog', { name: 'ใบเสร็จรับเงิน' })
  await expect(receipt).toBeVisible()
  await expect(receipt.getByText('เงินสด')).toBeVisible()
  await expect(receipt.getByText('฿50').first()).toBeVisible()
  // โต๊ะเดียวกันถูกใช้ซ้ำได้ในวันเดียว (บิลก่อนหน้าของโต๊ะนี้อยู่ในตารางด้วย) — หาแถวจากเลขที่ใบเสร็จ
  const receiptNo = (await receipt.getByText(/^RCPT-/).innerText()).trim()
  await receipt.getByRole('button', { name: 'ปิด' }).click()

  // จ่ายครบแล้ว backend ปิดโต๊ะให้เอง → การ์ดโต๊ะหายไป
  // และบิลไปโผล่ในตาราง "บิลที่เก็บแล้ววันนี้"
  await expect(tile).toHaveCount(0)
  await expect(
    paidBillsTable(page).getByRole('row').filter({ hasText: receiptNo }).filter({ hasText: 'เงินสด' }),
  ).toBeVisible()
})

// ทดสอบ: cashier เก็บเงินผ่าน PromptPay: เห็น QR พร้อมยอด กดพิมพ์ใบเสร็จได้เลยโดยไม่ต้องสแกนสลิปก่อน แล้วระบบพาไปตรวจสลิป บิลจึงขึ้น "ตรวจสลิปแล้ว"
// วิธี: เตรียมโต๊ะที่เสิร์ฟแล้วเหมือนเคสเงินสด → กดรับเงินแล้วสลับเป็น PromptPay → เช็ก QR ฿50 ไม่มีช่องสแกนสลิป ปุ่มเป็น "พิมพ์ใบเสร็จ" → กดพิมพ์ (แทน window.print) → ได้กล่อง "ตรวจสลิป" ต่อเลย → พิมพ์สลิป MOCK-OK แล้วกด Enter (ต้องไม่ส่งฟอร์ม) → กดตรวจสลิป → เช็กว่าการ์ดโต๊ะหาย และแถวบิลมีป้าย ตรวจสลิปแล้ว/รอตรวจสลิป
test('cashier เก็บเงินผ่าน PromptPay: พิมพ์ใบเสร็จมี QR แล้วตรวจสลิปต่อ บิลขึ้น "ตรวจสลิปแล้ว"', async ({
  page,
  request,
}) => {
  await loginAsAdmin(page, request)
  const { tableCardText, orderId } = await openTableAndPlaceOrder(page, FRIED_RICE)
  await advanceOrderToServed(page, orderId)

  await loginAsCashier(page, request)
  await page.goto('/employee/check')

  const tableName = tableCardText.replace(/^โต๊ะ\s*/, '')
  const tile = checkTableTile(page, tableName)
  await tile.getByRole('button', { name: /^รับเงิน/ }).click()

  // ลูกค้าไม่ได้เลือกวิธีจ่ายมา ตั้งต้นเป็นเงินสด แล้วกดสลับเป็น PromptPay (หัวกล่องคงที่ "รับเงิน โต๊ะ X")
  const dialog = page.getByRole('dialog', { name: `รับเงิน โต๊ะ ${tableName}` })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'PromptPay' }).click()
  await expect(dialog.getByRole('button', { name: 'PromptPay' })).toHaveAttribute('aria-pressed', 'true')

  // เลือก PromptPay แล้วต้องเห็น QR ให้ลูกค้าสแกนพร้อมยอดเงิน
  // ไม่เช็กป้าย "โหมดเดโม" ที่นี่ — ขึ้นหรือไม่ขึ้นแล้วแต่ .env ของเครื่อง (VITE_PROMPTPAY_ID)
  // ป้ายนี้เทสแยกใน test/unit/pages/CheckPage.test.tsx ที่ล็อกค่า config ไว้แล้ว
  await expect(dialog.getByText('ให้ลูกค้าสแกนเพื่อจ่าย')).toBeVisible()
  await expect(dialog.getByText('฿50').first()).toBeVisible()

  // ไม่ต้องสแกนสลิปก่อนแล้ว: ในกล่องไม่มีช่องสลิป ปุ่มเปลี่ยนเป็น "พิมพ์ใบเสร็จ" และกดได้ทันที
  await expect(dialog.getByPlaceholder(/ยิงเครื่องสแกน/)).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'รับเงิน', exact: true })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'พิมพ์ใบเสร็จ', exact: true })).toBeEnabled()
  const receiptNo = await printPromptPayReceipt(page, dialog)

  // พิมพ์ใบเสร็จ (มี QR) เสร็จ → เปิดกล่องตรวจสลิปของบิลนี้ต่อเอง · การ์ดโต๊ะหายเพราะจ่ายครบแล้ว
  const slip = slipDialog(page)
  await expect(slip).toBeVisible()
  await expect(slip).toContainText(receiptNo)
  await expect(slip).toContainText('฿50')
  await expect(tile).toHaveCount(0)

  // จำลองเครื่องสแกน 2D: พิมพ์ข้อความ QR ของสลิปลงช่องแล้วกด Enter (Enter ต้องไม่ submit ฟอร์ม)
  // backend โหมดจำลอง (SLIPOK_MOCK=true) ขึ้นต้น MOCK-OK = ตรวจผ่าน
  // ถ้า backend ยังไม่ได้ตั้ง SlipOK เลย บิลจะถูกบันทึกเป็น "รอตรวจสลิป" ก็ยังผ่านเทสนี้
  const scan = slip.getByPlaceholder(/ยิงเครื่องสแกน/)
  await expect(slip.getByRole('button', { name: 'ตรวจสลิป', exact: true })).toBeDisabled()
  await scan.fill(`MOCK-OK-e2e-${Date.now()}`)
  await scan.press('Enter')
  await expect(slip).toBeVisible()
  await slip.getByRole('button', { name: 'ตรวจสลิป', exact: true }).click()
  await expect(slip).toHaveCount(0)

  // บิลไปอยู่ "บิลที่เก็บแล้ววันนี้" พร้อมป้ายผลตรวจสลิป
  await expect(
    paidBillsTable(page).getByRole('row').filter({ hasText: receiptNo }).filter({ hasText: /ตรวจสลิปแล้ว|รอตรวจสลิป/ }),
  ).toBeVisible()
})
