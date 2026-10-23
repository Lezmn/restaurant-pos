import { test, expect } from '@playwright/test'
import { checkTableTile, loginAsCashier, pickFreeTable, tablesPageCard } from '../helpers'

// เขียนจากการกระทำจริงที่ record ไว้ด้วย `npx playwright codegen --channel=chrome`:
// cashier เปิดโต๊ะ -> เอาลิงก์ QR ไปให้ "ลูกค้า" (จำลองด้วยแท็บใหม่) -> ลูกค้าสั่งข้าวผัด (หมู)
// -> ส่งเข้าครัว -> cashier กลับมาดูหน้า Check เห็นบิลที่ยังไม่จ่าย
//
// ⚠️ ต้องรัน backend จริง + seed data ที่ localhost:3000
// ⚠️ มีผลข้างเคียงจริงกับฐานข้อมูล dev: เปิดโต๊ะ 1 โต๊ะและสร้างออเดอร์ค้างไว้ 1 ใบ (ไม่ได้ปิดโต๊ะ/เก็บเงินคืนให้ท้ายเทส
//    เพราะ backend ไม่ยอมให้เก็บเงินจนกว่าออเดอร์จะถูกเสิร์ฟ ซึ่งเป็นหน้าที่ของ role KITCHEN ไม่ใช่ flow นี้)

test('cashier เปิดโต๊ะ ลูกค้าสั่งอาหารผ่าน QR แล้ว cashier เห็นบิลค้างจ่ายที่หน้า Check', async ({
  page,
  request,
  context,
}) => {
  await loginAsCashier(page, request)
  await page.goto('/employee/tables')

  // เลือกโต๊ะแรกที่ยัง "ว่าง" แทนการ hardcode เลขโต๊ะ กันเทสพังถ้าลำดับ/จำนวนโต๊ะใน seed เปลี่ยน
  // สุ่มโต๊ะว่างแล้วอ้างด้วยชื่อ — .first() ประเมินใหม่ทุกครั้ง เทสอื่นเปิดโต๊ะนั้นไปก่อนจะกดผิดโต๊ะ
  const tableCardText = await pickFreeTable(page)
  const availableTable = tablesPageCard(page, tableCardText)
  // จำชื่อโต๊ะไว้ ใช้หาแถวที่ถูกต้องในหน้า Check ทีหลัง เพราะโต๊ะอื่นที่เปิดค้างจากรันเทสรอบก่อน ๆ
  // ก็มีป้าย "รอเสิร์ฟ N ออเดอร์" เหมือนกัน ถ้าไม่ระบุเจาะจงโต๊ะ จะชนกันกลายเป็น strict mode violation
  // ตัดคำว่า "โต๊ะ" ออกเหลือแค่ชื่อ แล้วให้ checkTableTile ประกอบหัวการ์ด "โต๊ะ {name}" เอง
  const tableName = tableCardText.replace(/^โต๊ะ\s*/, '')
  await availableTable.getByRole('button', { name: 'เปิดโต๊ะ + สร้าง QR' }).click()

  // เปิดโต๊ะสำเร็จ ระบบเด้ง QR dialog ขึ้นมาให้เองทันที (ดู TablesPage.tsx onSuccess ของ openSession)
  const qrDialog = page.getByRole('dialog')
  await expect(qrDialog).toBeVisible()

  // ดึงลิงก์ลูกค้าจากช่อง input readonly ในกล่องโดยตรง แทนการอ่าน clipboard
  // (คลิก "คัดลอกลิงก์" ใช้ navigator.clipboard ซึ่งต้องขอ permission พิเศษใน Playwright — อ่านจาก DOM ง่ายกว่าและชัวร์กว่า)
  const customerUrl = await qrDialog.getByRole('textbox').inputValue()
  expect(customerUrl).toContain('/t/')

  await page.keyboard.press('Escape') // ปิด dialog

  // จำลองลูกค้าสแกน QR ด้วยแท็บใหม่ในเบราว์เซอร์เดียวกัน (คนละ page แต่ share browser context)
  const customerPage = await context.newPage()
  await customerPage.goto(customerUrl)

  // ตั้งใจ match ชื่อซ้ำ 2 รอบ ("ข้าวผัด ข้าวผัด ฿...") เพราะ card เป็น <Link> เดียวที่รวม
  // alt รูป + ชื่อเมนู + ราคาไว้ในชื่อที่เข้าถึงได้ตัวเดียว — กันชนกับ "ข้าวผัดกะเพรา" ที่มีอยู่ใน seed ด้วย
  await customerPage.getByRole('link', { name: /^ข้าวผัด ข้าวผัด/ }).click()
  await customerPage.getByRole('radio', { name: 'หมู' }).check()
  await customerPage.getByRole('button', { name: /^เพิ่มรายการ/ }).click()
  await customerPage.getByRole('button', { name: '➤ ส่งรายการเข้าครัว' }).click()

  // ส่งออเดอร์สำเร็จ ต้องถูกพาไปหน้าติดตามสถานะ
  await expect(
    customerPage.getByRole('heading', { name: 'ติดตามสถานะออเดอร์' }),
  ).toBeVisible()

  // กลับมาฝั่งพนักงาน ไปหน้า Check ต้องเห็นโต๊ะนี้ค้างจ่ายอยู่
  await page.getByRole('link', { name: 'Check' }).click()

  // ข้าวผัด (50 บาท) + หมู (+0 บาท) = ยังไม่เสิร์ฟ เลยเก็บเงินไม่ได้ ต้องขึ้นป้าย "รอเสิร์ฟ 1 ออเดอร์" และไม่มีปุ่ม "รับเงิน"
  // ระบุการ์ดด้วยชื่อโต๊ะที่จำไว้ กันชนกับโต๊ะอื่นที่อาจมีออเดอร์ค้างจากการรันเทสรอบก่อน ๆ
  const tile = checkTableTile(page, tableName)
  await expect(tile.getByText(/รอเสิร์ฟ \d+ ออเดอร์/)).toBeVisible()
  await expect(tile.getByRole('button', { name: /^รับเงิน/ })).toHaveCount(0)
})
