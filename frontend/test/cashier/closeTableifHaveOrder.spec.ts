import { test, expect } from '@playwright/test'
import { loginAsAdmin, loginAsCashier, openTableAndPlaceOrder, pickFreeTable, tablesPageCard } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data ที่ localhost:3000
// ทดสอบ business rule ฝั่ง backend: ปิดโต๊ะไม่ได้ถ้ายังมีออเดอร์ที่ไม่ใช่ PAID/CANCELLED ค้างอยู่
// (ดู src/table-sessions/table-sessions.service.ts บรรทัด 153-171 ฝั่ง backend — throw ConflictException
// ว่า "ยังมีออเดอร์ที่ไม่ปิดใน session นี้" ถ้า order นับได้ >0 ที่สถานะ PENDING/PREPARING/SERVED)

test('ปิดโต๊ะที่มีลูกค้าสั่งอาหารผ่าน QR ค้างอยู่ไม่ได้ ต้องขึ้น error', async ({
  page,
  request,
  context,
}) => {
  await loginAsCashier(page, request)
  await page.goto('/employee/tables')

  // สุ่มโต๊ะว่างแล้วอ้างด้วยชื่อ — .first() ประเมินใหม่ทุกครั้ง เทสอื่นเปิดโต๊ะนั้นไปก่อนจะกดผิดโต๊ะ
  const tableCardText = await pickFreeTable(page)
  const availableTable = tablesPageCard(page, tableCardText)

  await availableTable.getByRole('button', { name: 'เปิดโต๊ะ + สร้าง QR' }).click()

  // ดึงลิงก์ลูกค้าจากช่อง input readonly ใน QR dialog โดยตรง แทนการอ่าน clipboard
  // (คลิก "คัดลอกลิงก์" ใช้ navigator.clipboard ซึ่งต้องขอ permission พิเศษใน Playwright)
  const qrDialog = page.getByRole('dialog')
  await expect(qrDialog).toBeVisible()
  const customerUrl = await qrDialog.getByRole('textbox').inputValue()
  await page.keyboard.press('Escape') // ปิด QR dialog

  // จำลองลูกค้าสแกน QR ด้วยแท็บใหม่ในเบราว์เซอร์เดียวกัน (คนละ page แต่ share browser context)
  const customerPage = await context.newPage()
  await customerPage.goto(customerUrl)
  await customerPage.getByRole('link', { name: /^ข้าวผัด ข้าวผัด/ }).click()
  await customerPage.getByRole('radio', { name: 'หมู' }).check()
  await customerPage.getByRole('button', { name: /^เพิ่มรายการ/ }).click()
  await customerPage.getByRole('button', { name: '➤ ส่งรายการเข้าครัว' }).click()
  await expect(
    customerPage.getByRole('heading', { name: 'ติดตามสถานะออเดอร์' }),
  ).toBeVisible()

  // ลองปิดโต๊ะทั้งที่ลูกค้าเพิ่งสั่งไปและออเดอร์ยังไม่ถูกเสิร์ฟ/จ่าย
  // ปิดโต๊ะมี popup ยืนยันก่อน (ConfirmDialog) — error จาก backend ขึ้นในกล่องนั้น
  const openedTable = tablesPageCard(page, tableCardText)
  await openedTable.getByRole('button', { name: 'ปิดโต๊ะ' }).click()
  const confirmClose = page.getByRole('dialog', { name: 'ปิดโต๊ะ' })
  await confirmClose.getByRole('button', { name: 'ปิดโต๊ะ' }).click()

  await expect(confirmClose.getByRole('alert')).toHaveText('ยังมีออเดอร์ที่ไม่ปิดใน session นี้')
  await confirmClose.getByRole('button', { name: 'ย้อนกลับ' }).click()
  // โต๊ะต้องยังอยู่ในสถานะเปิด (มีปุ่ม "ปิดโต๊ะ") ไม่ใช่กลับไปเป็น "เปิดโต๊ะ + สร้าง QR"
  await expect(openedTable.getByRole('button', { name: 'ปิดโต๊ะ' })).toBeVisible()
})

test('ยกเลิกออเดอร์แล้วปิดโต๊ะสำเร็จ โต๊ะกลับมาว่างพร้อมเปิดใหม่ได้', async ({
  page,
  request,
}) => {
  await loginAsAdmin(page, request)
  const { tableCardText, orderRef } = await openTableAndPlaceOrder(page, /^ข้าวผัด(?!กะเพรา)/)

  // ยกเลิกออเดอร์จากหน้า Order (คิวครัว) ก่อน — ต้องเป็น ADMIN/KITCHEN เท่านั้นถึงเข้าได้
  // หา <article> ด้วย orderRef เจาะจง กันชนกับออเดอร์เก่าที่อาจค้างอยู่ในโต๊ะเดียวกันจากไฟล์เทสอื่น
  await page.getByRole('link', { name: 'Order' }).click()
  await page
    .locator('article', { hasText: `#${orderRef}` })
    .getByRole('button', { name: 'ยกเลิกออเดอร์' })
    .click()
  // ยืนยันใน popup (ConfirmDialog) แทน confirm() ของเบราว์เซอร์
  const confirmCancel = page.getByRole('dialog', { name: 'ยกเลิกออเดอร์' })
  await confirmCancel.getByRole('button', { name: 'ยกเลิกออเดอร์' }).click()
  await expect(confirmCancel).not.toBeVisible()

  await page.getByRole('link', { name: 'โต๊ะ / QR' }).click()
  await tablesPageCard(page, tableCardText)
    .getByRole('button', { name: 'ปิดโต๊ะ' })
    .click()
  await page.getByRole('dialog', { name: 'ปิดโต๊ะ' }).getByRole('button', { name: 'ปิดโต๊ะ' }).click()

  // ไม่มีออเดอร์ค้างแล้ว (CANCELLED ไม่นับ) ปิดโต๊ะสำเร็จ โต๊ะกลับมาโชว์ปุ่มเปิดโต๊ะใหม่
  await expect(
    tablesPageCard(page, tableCardText)
      .getByRole('button', { name: 'เปิดโต๊ะ + สร้าง QR' }),
  ).toBeVisible()
})
