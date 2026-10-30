import { test, expect, type Page, type APIRequestContext } from '@playwright/test'
import { loginAsAdmin, loginAsKitchen, loginAsStaff } from '../helpers'

// ⚠️ ต้องรัน backend จริง + seed data — รันด้วย npm run test:e2e:local
// ลิงก์ "ทางเข้า" ที่ไม่ใช่หน้าจริง: / → /employee → หน้าแรกของ role (homeByRole), /owner → /owner/dashboard
// และลิงก์ที่ไม่มีอยู่จริงต้องขึ้นหน้า 404 ไม่ใช่โยนไปหน้า login (ดู src/routes.tsx, src/pages/NotFoundPage.tsx)

/** เปิดทีละลิงก์ แล้วเช็กว่าไปจบที่หน้าที่คาดไว้ */
async function expectLandings(page: Page, paths: string[], landing: RegExp) {
  for (const path of paths) {
    await page.goto(path)
    await expect(page, path).toHaveURL(landing)
  }
}

const roles: {
  name: string
  login: (page: Page, request: APIRequestContext) => Promise<unknown>
  home: RegExp
  owner: RegExp
}[] = [
  // ADMIN = เจ้าของร้าน: หน้าแรกของฝั่งพนักงานคือจอครัว และเข้า /owner ได้
  { name: 'ADMIN', login: loginAsAdmin, home: /\/employee\/order$/, owner: /\/owner\/dashboard$/ },
  // role อื่นเข้า /owner ไม่ได้ → fallback /employee → หน้าแรกของ role นั้น
  { name: 'STAFF', login: loginAsStaff, home: /\/employee\/check$/, owner: /\/employee\/check$/ },
  { name: 'KITCHEN', login: loginAsKitchen, home: /\/employee\/order$/, owner: /\/employee\/order$/ },
]

for (const { name, login, home, owner } of roles) {
  // ทดสอบ: login แล้วเปิด / หรือ /employee ต้องไปหน้าแรกของ role ตัวเอง และ /owner ไป Dashboard (ADMIN) หรือเด้งกลับหน้าแรก (role อื่น)
  // วิธี: login เป็น role นั้น → เปิด / และ /employee เช็กว่าไปหน้าแรกตาม homeByRole → เปิด /owner เช็กปลายทาง
  test(`${name}: / และ /employee ไปหน้าแรกของ role · /owner ไปที่ที่ควรไป`, async ({ page, request }) => {
    await login(page, request)
    await expectLandings(page, ['/', '/employee'], home)
    await expectLandings(page, ['/owner'], owner)
  })
}

// ทดสอบ: ยังไม่ login แล้วเปิด /, /employee, /owner ต้องไปหน้า login (ไม่ค้างหน้าว่างหรือวนลูป)
// วิธี: ไม่ login → เปิดทั้งสามลิงก์ทีละอัน → เช็กว่าทุกอันพาไป /login
test('ยังไม่ login: /, /employee, /owner พาไป /login', async ({ page }) => {
  await expectLandings(page, ['/', '/employee', '/owner'], /\/login$/)
})

// ทดสอบ: ลิงก์ที่ไม่มีอยู่จริงต้องขึ้นหน้า 404 บอกลูกค้าให้สแกน QR ใหม่ ไม่โยนไปหน้า login พนักงาน และมีปุ่มไปหน้าพนักงาน
// วิธี: ไม่ login → เปิด /no-such-page → เช็กว่า URL ไม่เปลี่ยน, เห็นหัวข้อ "ไม่พบหน้านี้" กับคำแนะนำสแกน QR → กดลิงก์เข้าสู่ระบบพนักงาน → ไปหน้า /login
test('ลิงก์ที่ไม่มีอยู่จริง → หน้า 404 พร้อมทางไปหน้าพนักงาน', async ({ page }) => {
  await page.goto('/no-such-page')
  await expect(page).toHaveURL(/\/no-such-page$/)
  await expect(page.getByRole('heading', { name: 'ไม่พบหน้านี้' })).toBeVisible()
  await expect(page.getByText(/สแกน QR ที่โต๊ะอีกครั้ง/)).toBeVisible()

  await page.getByRole('link', { name: 'เข้าสู่ระบบพนักงาน' }).click()
  await expect(page).toHaveURL(/\/login$/)
})
