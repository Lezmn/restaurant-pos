import { test, expect } from '@playwright/test'
import { submitLogin } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data ที่ localhost:3000
// login ผ่านฟอร์มจริง (ไม่ยิง API ตรง) เพราะอยากดูผลบน UI ตาม header ของ EmployeeLayout
// ที่โชว์ "({name} · {role})" — ดู src/components/layout/EmployeeLayout.tsx บรรทัด 141-145

const accounts = [
  { username: 'admin', name: 'Admin', role: 'ADMIN', landingUrl: /\/employee\/order$/ },
  // 23 ก.ย. รวม CASHIER + WAITER เป็น STAFF — seed เหลือบัญชี staff (ชื่อ "Staff")
  { username: 'staff', name: 'Staff', role: 'STAFF', landingUrl: /\/employee\/check$/ },
  { username: 'kitchen', name: 'Kitchen Staff', role: 'KITCHEN', landingUrl: /\/employee\/order$/ },
]

for (const account of accounts) {
  test(`login ด้วย ${account.username} แล้ว header ต้องโชว์ role ${account.role} ถูกต้อง`, async ({
    page,
  }) => {
    await page.goto('/login')
    await submitLogin(page, account.username, 'ChangeMe123!')

    await expect(page).toHaveURL(account.landingUrl) // ตรวจสอบว่า login แล้วไปหน้า landing page ถูกต้อง
    await expect(page.getByText(`${account.name} · ${account.role}`)).toBeVisible() // ตรวจสอบ header ของ EmployeeLayout ว่าโชว์ role ถูกต้อง
  })
}
