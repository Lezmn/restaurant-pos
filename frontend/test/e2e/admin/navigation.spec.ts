import { test, expect } from '@playwright/test'
import { loginAsAdmin } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data ที่ localhost:3000

// ทดสอบ: ADMIN กดเมนูล่างได้ครบทั้ง Order, Check, Manage, Table, Takeaway ไม่มีปุ่มไหนถูกปิด
// วิธี: login เป็น admin → เปิด /employee/order → เช็กว่าทั้ง 5 ปุ่มเป็นลิงก์ (ถ้าไม่มีสิทธิ์จะเป็นปุ่มที่กดไม่ได้)
test('เมนูล่างของ admin เปิดได้ครบทั้ง 5 ปุ่ม (Order, Check, Manage, Table, Takeaway) ไม่มีปุ่มไหนถูก disable', async ({
  page,
  request,
}) => {
  await loginAsAdmin(page, request)
  await page.goto('/employee/order')

  // แถบล่างเรนเดอร์เป็น <a> (NavLink, role=link) ถ้าเปิดได้ แต่เป็น <button disabled> ถ้าไม่มีสิทธิ์
  // ดังนั้นเช็คแค่ role=link ก็พิสูจน์ได้ว่าไม่ได้ถูก disable
  await expect(page.getByRole('link', { name: 'Order' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Check' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Manage' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Table' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Takeaway' })).toBeVisible()
})

// ทดสอบ: ADMIN เห็นปุ่มเสียงแจ้งเตือน ลิงก์ "Dashboard" และปุ่ม "Logout" ที่ header และไม่มีลิงก์ "โต๊ะ / QR" แล้ว (ย้ายไปแถบล่าง "Table")
// วิธี: login เป็น admin → เปิด /employee/order → เช็กลิงก์/ปุ่มที่ header
test('admin เห็นลิงก์ "Dashboard" และปุ่ม "Logout" ที่ header (โต๊ะ/QR ย้ายไปแถบล่าง "Table")', async ({ page, request }) => {
  await loginAsAdmin(page, request)
  await page.goto('/employee/order')

  // ปุ่มเสียงย้ายจากจอครัวมาอยู่ที่หัวจอ (ข้าง Dashboard) — กดได้ทุกหน้า
  await expect(page.getByRole('button', { name: 'เสียงแจ้งเตือนเปิดอยู่ (แตะเพื่อปิด)' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'โต๊ะ / QR' })).toHaveCount(0)
})

// ทดสอบ: แถบด้านบนแสดงชื่อและ role ของคนที่ login อยู่
// วิธี: login เป็น admin → เปิด /employee/order → เช็กข้อความ "Admin · ADMIN"
test('header แสดงชื่อและ role ของ admin ที่ login อยู่', async ({ page, request }) => {
  await loginAsAdmin(page, request)
  await page.goto('/employee/order')

  await expect(page.getByText('Admin · ADMIN')).toBeVisible()
})
