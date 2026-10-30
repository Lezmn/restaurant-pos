import { RouteErrorPage } from '@/pages/RouteErrorPage'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function Boom({ error }: Readonly<{ error: Error }>): never {
  throw error
}

/** route ที่ throw ตอน render ใต้ errorElement ชั้นนอก — ตรงกับโครงใน routes.tsx */
const renderAt = (path: string, error: Error) => {
  window.history.replaceState(null, '', path)
  const router = createMemoryRouter(
    [{ errorElement: <RouteErrorPage />, children: [{ path: '*', element: <Boom error={error} /> }] }],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
}

describe('RouteErrorPage', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))
  afterEach(() => vi.restoreAllMocks())

  // ทดสอบ: หน้าพังตอน render → ขึ้นหน้า error ของร้าน (ไม่ใช่ "Unexpected Application Error!") พร้อมปุ่มโหลดใหม่ / กลับหน้าแรก
  // วิธี: route พนักงานที่ throw ReferenceError → เช็กหัวข้อ ปุ่ม ลิงก์กลับ /employee และไม่มีหน้า default ของ library
  it('render พัง → หัวข้อ "ขออภัย ระบบขัดข้อง" ปุ่มโหลดใหม่ และกลับหน้าพนักงาน', () => {
    renderAt('/employee/order', new ReferenceError('useState is not defined'))
    expect(screen.getByRole('heading', { name: 'ขออภัย ระบบขัดข้อง' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'โหลดหน้าใหม่' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'กลับหน้าแรก' })).toHaveAttribute('href', '/employee')
    expect(screen.queryByText(/Unexpected Application Error/)).not.toBeInTheDocument()
  })

  // ทดสอบ: ลูกค้าที่หน้าพัง กลับไปหน้าเมนูของโต๊ะตัวเอง ไม่ใช่หน้า login พนักงาน
  it('ลูกค้าใต้ /t/:token → กลับหน้าแรกไปหน้าเมนูของโต๊ะนั้น', () => {
    renderAt('/t/tok123/cart', new Error('x'))
    expect(screen.getByRole('link', { name: 'กลับหน้าแรก' })).toHaveAttribute('href', '/t/tok123')
  })

  // ทดสอบ: โหลดไฟล์ของหน้าไม่ได้ (deploy ใหม่ระหว่างเปิดค้าง) → บอกว่ามีการอัปเดต ให้โหลดใหม่
  it('โหลดไฟล์หน้าไม่ได้ → "มีการอัปเดตระบบ"', () => {
    renderAt('/employee', new TypeError('Failed to fetch dynamically imported module: /assets/OrderPage-abc.js'))
    expect(screen.getByRole('heading', { name: 'มีการอัปเดตระบบ' })).toBeInTheDocument()
  })
})
