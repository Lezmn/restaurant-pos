import { test, expect } from '@playwright/test'
import { loginAsAdmin } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data ที่ localhost:3000

test('เมนูล่างของ admin เปิดได้ครบทั้ง 3 ปุ่ม (Order, Check, Manage) ไม่มีปุ่มไหนถูก disable', async ({
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
})

test('admin เห็นลิงก์ "โต๊ะ / QR" และ "Dashboard" ที่ header', async ({ page, request }) => {
  await loginAsAdmin(page, request)
  await page.goto('/employee/order')

  await expect(page.getByRole('link', { name: 'โต๊ะ / QR' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible()
})

test('header แสดงชื่อและ role ของ admin ที่ login อยู่', async ({ page, request }) => {
  await loginAsAdmin(page, request)
  await page.goto('/employee/order')

  await expect(page.getByText('Admin · ADMIN')).toBeVisible()
})
