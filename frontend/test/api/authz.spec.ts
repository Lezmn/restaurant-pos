import { expect, test } from '@playwright/test'
import { call, tokens, type Role } from './api-helpers'

// ⚠️ ยิง backend จริง (E2E_API_URL) — ใช้กับ DB ทดสอบเท่านั้น
// ทุก endpoint ที่ไม่ใช่ @Public ต้อง 401 เมื่อไม่มี token และ 403 เมื่อ role ไม่มีสิทธิ์
// (RolesGuard ทำงานก่อน ValidationPipe จึงส่ง body/id มั่วได้ ผลต้องเป็น 403 ไม่ใช่ 400)

const ID = '00000000-0000-4000-8000-000000000000'
const ALL: Role[] = ['ADMIN', 'STAFF', 'KITCHEN']
const ADMIN: Role[] = ['ADMIN']
const ADMIN_STAFF: Role[] = ['ADMIN', 'STAFF']
const ADMIN_KITCHEN: Role[] = ['ADMIN', 'KITCHEN']

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'
const matrix: [Method, string, Role[]][] = [
  ['GET', '/auth/me', ALL],
  // บัญชีกลางของครัว/หน้าร้านเปลี่ยนรหัสเองไม่ได้ (คนเดียวเปลี่ยน = ทั้งตำแหน่ง login ไม่ได้) — ADMIN ตั้งให้ที่ /users/:id
  ['PATCH', '/auth/password', ADMIN],
  ['GET', '/categories', ALL],
  ['POST', '/categories', ADMIN],
  ['PATCH', `/categories/${ID}`, ADMIN],
  ['DELETE', `/categories/${ID}`, ADMIN],
  ['GET', '/menu', ALL],
  ['POST', '/menu', ADMIN],
  ['PATCH', `/menu/${ID}`, ADMIN],
  ['PATCH', `/menu/${ID}/availability`, ADMIN_KITCHEN],
  ['DELETE', `/menu/${ID}`, ADMIN],
  ['POST', `/menu/${ID}/options`, ADMIN],
  ['PATCH', `/menu/${ID}/options/${ID}`, ADMIN],
  ['DELETE', `/menu/${ID}/options/${ID}`, ADMIN],
  ['GET', '/ingredients', ALL],
  ['POST', '/ingredients', ADMIN],
  ['PATCH', `/ingredients/${ID}`, ADMIN_KITCHEN],
  ['DELETE', `/ingredients/${ID}`, ADMIN],
  ['GET', '/tables', ALL],
  ['POST', '/tables', ADMIN],
  ['PATCH', `/tables/${ID}`, ADMIN],
  ['DELETE', `/tables/${ID}`, ADMIN],
  ['POST', '/orders', ADMIN_STAFF],
  ['GET', '/orders', ALL],
  ['PATCH', `/orders/${ID}/status`, ADMIN_KITCHEN],
  ['PATCH', `/orders/${ID}/clear`, ADMIN_KITCHEN],
  ['POST', `/orders/${ID}/items`, ADMIN_STAFF],
  ['DELETE', `/orders/${ID}/items/${ID}`, ADMIN_STAFF],
  ['POST', '/payments', ADMIN_STAFF],
  ['GET', '/payments', ADMIN_STAFF],
  ['GET', `/payments/${ID}`, ADMIN_STAFF],
  ['PATCH', `/payments/${ID}/void`, ADMIN_STAFF],
  ['POST', `/payments/${ID}/slip/recheck`, ADMIN_STAFF],
  ['PATCH', `/payments/${ID}/slip/confirm`, ADMIN],
  ['POST', '/table-sessions', ADMIN_STAFF],
  ['GET', '/table-sessions', ADMIN_STAFF],
  ['PATCH', `/table-sessions/${ID}/close`, ADMIN_STAFF],
  ['GET', '/service-requests', ADMIN_STAFF],
  ['POST', '/service-requests', ADMIN_STAFF],
  ['PATCH', `/service-requests/${ID}/resolve`, ADMIN_STAFF],
  ['GET', '/users', ADMIN],
  ['POST', '/users', ADMIN],
  ['PATCH', `/users/${ID}`, ADMIN],
  ['DELETE', `/users/${ID}`, ADMIN],
  ['GET', '/expenses', ADMIN],
  ['POST', '/expenses', ADMIN],
  ['PATCH', `/expenses/${ID}`, ADMIN],
  ['DELETE', `/expenses/${ID}`, ADMIN],
  ['POST', '/expenses/drawer', ADMIN_STAFF],
  ['GET', '/reports/dashboard', ADMIN],
  ['GET', '/reports/income-expense', ADMIN],
  ['GET', '/cash-closes/preview', ADMIN_STAFF],
  ['POST', '/cash-closes', ADMIN_STAFF],
  ['GET', '/cash-closes', ADMIN],
  ['GET', `/cash-closes/${ID}`, ADMIN],
  ['DELETE', `/cash-closes/${ID}`, ADMIN],
]

let t: Record<Role, string>
test.beforeAll(async ({ request }) => {
  t = await tokens(request)
})

test('ไม่มี token → 401 ทุก endpoint ที่ต้อง login', async ({ request }) => {
  const wrong: string[] = []
  for (const [method, path] of matrix) {
    const res = await call(request, method, path, { data: {} })
    if (res.status() !== 401) wrong.push(`${method} ${path} → ${res.status()}`)
  }
  expect(wrong).toEqual([])
})

test('token ปลอม/ลายเซ็นผิด → 401', async ({ request }) => {
  const forged =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ4Iiwicm9sZSI6IkFETUlOIn0.c2lnbmF0dXJlLWZha2U'
  for (const path of ['/users', '/reports/dashboard', '/payments']) {
    const res = await call(request, 'GET', path, { token: forged })
    expect(res.status(), path).toBe(401)
  }
})

test('role ที่ไม่มีสิทธิ์ → 403 (ไม่ใช่ 400/404/500)', async ({ request }) => {
  const wrong: string[] = []
  for (const [method, path, allowed] of matrix) {
    for (const role of ALL.filter((r) => !allowed.includes(r))) {
      const res = await call(request, method, path, { token: t[role], data: {} })
      if (res.status() !== 403) wrong.push(`${role} ${method} ${path} → ${res.status()}`)
    }
  }
  expect(wrong).toEqual([])
})

test('role ที่มีสิทธิ์ → ไม่โดน 401/403 (ผ่าน guard ไปถึง validation/handler)', async ({ request }) => {
  const wrong: string[] = []
  for (const [method, path, allowed] of matrix) {
    // ข้ามที่เปลี่ยนรหัส/ลบจริง — ID ปลอมอยู่แล้ว แต่ /auth/password ส่ง body ว่างได้ 400
    for (const role of allowed) {
      const res = await call(request, method, path, { token: t[role], data: {} })
      if ([401, 403].includes(res.status()) || res.status() >= 500) {
        wrong.push(`${role} ${method} ${path} → ${res.status()}`)
      }
    }
  }
  expect(wrong).toEqual([])
})

test('/public/* เข้าได้โดยไม่ต้อง login', async ({ request }) => {
  expect((await call(request, 'GET', '/public/menu')).status()).toBe(200)
})

test('response ของ /users และ /auth/login ไม่หลุด password hash', async ({ request }) => {
  const res = await call(request, 'GET', '/users', { token: t.ADMIN })
  const body = await res.text()
  expect(body).not.toMatch(/\$2[aby]\$/)
  expect(body).not.toContain('"password"')
})
