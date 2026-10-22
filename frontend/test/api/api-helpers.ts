import { expect, type APIRequestContext, type APIResponse } from '@playwright/test'
import { API_URL, loginViaApi } from '../helpers'

/**
 * ตัวช่วยของชุด API/integration — ยิง backend ตรง ๆ (ไม่ผ่านเว็บ)
 * ⚠️ สร้างข้อมูลจริง ต้องรันกับ DB ทดสอบ (restaurant_test) เท่านั้น
 */
export const SEED_PASSWORD = 'ChangeMe123!'
export { API_URL }

export type Role = 'ADMIN' | 'STAFF' | 'KITCHEN'

export async function tokens(request: APIRequestContext) {
  const [admin, staff, kitchen] = await Promise.all([
    loginViaApi(request, 'admin', SEED_PASSWORD),
    loginViaApi(request, 'staff', SEED_PASSWORD),
    loginViaApi(request, 'kitchen', SEED_PASSWORD),
  ])
  return { ADMIN: admin.accessToken, STAFF: staff.accessToken, KITCHEN: kitchen.accessToken }
}

export const auth = (token?: string) => (token ? { Authorization: `Bearer ${token}` } : {})

export async function call(
  request: APIRequestContext,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  opts: { token?: string; data?: unknown } = {},
): Promise<APIResponse> {
  return request.fetch(`${API_URL}${path}`, {
    method,
    headers: { ...auth(opts.token), 'Content-Type': 'application/json' },
    data: opts.data === undefined ? undefined : JSON.stringify(opts.data),
  })
}

export async function ok<T = any>(res: APIResponse): Promise<T> {
  if (!res.ok()) {
    throw new Error(`${res.url()} → ${res.status()} ${await res.text()}`)
  }
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

interface PublicMenuItem {
  id: string
  name: string
  price: number
  options: { id: string; name: string; group: string; price: number }[]
}

export async function publicMenu(request: APIRequestContext): Promise<PublicMenuItem[]> {
  const categories = await ok<{ menuItems: PublicMenuItem[] }[]>(await call(request, 'GET', '/public/menu'))
  return categories.flatMap((c) => c.menuItems)
}

export async function menuItemByName(request: APIRequestContext, name: string) {
  const item = (await publicMenu(request)).find((m) => m.name === name)
  if (!item) throw new Error(`ไม่พบเมนู ${name} ใน /public/menu`)
  return item
}

/** สร้างโต๊ะใหม่ (เลขสุ่มไม่ชน) — E2E รันซ้ำแล้วโต๊ะ seed ไม่หมด */
export async function newTable(request: APIRequestContext, adminToken: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const number = 1000 + Math.floor(Math.random() * 8_000_000)
    const res = await call(request, 'POST', '/tables', { token: adminToken, data: { number, seats: 2 } })
    if (res.ok()) return ok<{ id: string; number: number }>(res)
  }
  throw new Error('สร้างโต๊ะไม่สำเร็จ')
}

/** โต๊ะใหม่ + เปิด QR session */
export async function openNewSession(request: APIRequestContext, t: Record<Role, string>) {
  const table = await newTable(request, t.ADMIN)
  const session = await ok<{ id: string; token: string; tableId: string }>(
    await call(request, 'POST', '/table-sessions', { token: t.STAFF, data: { tableId: table.id } }),
  )
  return { table, session }
}

/** ลูกค้าสั่งผ่าน QR */
export async function customerOrder(
  request: APIRequestContext,
  sessionToken: string,
  items: { menuItemId: string; quantity: number; optionIds?: string[]; note?: string }[],
) {
  return ok<{ id: string; status: string }>(
    await call(request, 'POST', '/public/orders', { data: { sessionToken, items } }),
  )
}

/** ครัวไล่สถานะจนเสิร์ฟ */
export async function serve(request: APIRequestContext, kitchenToken: string, orderId: string) {
  await ok(await call(request, 'PATCH', `/orders/${orderId}/status`, { token: kitchenToken, data: { status: 'PREPARING' } }))
  await ok(await call(request, 'PATCH', `/orders/${orderId}/status`, { token: kitchenToken, data: { status: 'SERVED' } }))
}

export async function sessionSummary(request: APIRequestContext, staffToken: string, sessionId: string) {
  return ok<{ id: string; status: string; total: number }>(
    await call(request, 'GET', `/table-sessions/${sessionId}`, { token: staffToken }),
  )
}

export function expectStatus(res: APIResponse, status: number) {
  expect(res.status(), res.url()).toBe(status)
}
