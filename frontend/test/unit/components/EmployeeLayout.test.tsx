import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { EmployeeLayout } from '@/components/layout/EmployeeLayout'
import { useAuth } from '@/features/auth/use-auth'
import { useIngredients } from '@/features/ingredients/hooks'
import { useMenuItems } from '@/features/menu/hooks'
import { useTables } from '@/features/tables/hooks'
import { Role, TableStatus } from '@/types/enums'

// หัวจอของพนักงาน — จำนวนโต๊ะว่าง ป้ายบัญชี และเมนูนำทางตาม role
// ใส่ของจริงที่เหลือไว้ด้วย — Chrome จริง (npm run test:browser) ไม่ยอม import ชื่อที่ mock ไม่มี
vi.mock('@/features/tables/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/tables/hooks')>()),
  useTables: vi.fn(),
}))
vi.mock('@/features/menu/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/menu/hooks')>()),
  useMenuItems: vi.fn(),
  useSetMenuItemAvailability: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}))
vi.mock('@/features/ingredients/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/ingredients/hooks')>()),
  useIngredients: vi.fn(),
  useUpdateIngredient: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}))
// socket และป๊อปอัปเรียกพนักงานไม่เกี่ยวกับเทสต์นี้
vi.mock('@/features/live/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/live/hooks')>()),
  useStaffLiveEvents: vi.fn(),
}))
vi.mock('@/components/CallStaffAlert', () => ({ CallStaffAlert: () => null }))

// jsdom ยังไม่มี showModal ของ <dialog>
beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false
  }
})

const table = (id: string, status: TableStatus) => ({ id, number: Number(id), status })
const menu = (id: string, name: string, isAvailable: boolean) => ({ id, name, isAvailable, ingredientsOutOfStock: [] })
const ingredient = (id: string, name: string) => ({
  id,
  name,
  isAvailable: false,
  stockQty: null,
  menuItemCount: 1,
  menuOptionCount: 0,
})

function setup({
  path = '/employee/order',
  role = Role.KITCHEN as Role,
  /** null = ยังโหลดไม่เสร็จ */
  tables = [table('1', TableStatus.AVAILABLE), table('2', TableStatus.OCCUPIED), table('3', TableStatus.AVAILABLE)] as
    | unknown[]
    | null,
  offMenus = 1,
  offIngredients = 1,
} = {}) {
  useAuth.setState({ user: { id: 'u1', email: 'k@x', name: 'ครัวหนึ่ง', role } })
  vi.mocked(useTables).mockReturnValue({ data: tables ?? undefined } as never)
  vi.mocked(useMenuItems).mockReturnValue({
    data: [
      ...Array.from({ length: offMenus }, (_, i) => menu(`m-off-${i}`, `เมนูหมด ${i}`, false)),
      menu('m-on', 'ข้าวผัด', true),
    ],
    isPending: false,
  } as never)
  vi.mocked(useIngredients).mockReturnValue({
    data: Array.from({ length: offIngredients }, (_, i) => ingredient(`i-off-${i}`, `วัตถุดิบหมด ${i}`)),
    isPending: false,
  } as never)
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/employee" element={<EmployeeLayout />}>
          <Route path="order" element={<p>บอร์ดครัว</p>} />
          <Route path="check" element={<p>หน้าเช็คบิล</p>} />
          <Route path="tables" element={<p>หน้าโต๊ะ</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

/** ป้ายจำนวนโต๊ะว่างบน header (ตัวเลขอยู่ใน <span> แยก) */
const tableCount = () => screen.getByText(/จำนวนโต๊ะที่ว่าง/)
const header = () => screen.getByRole('banner')

describe('EmployeeLayout — หัวจอ', () => {
  beforeEach(() => vi.clearAllMocks())

  // ทดสอบ: ปุ่มปิดเมนูที่หมดย้ายไปอยู่แถวแท็บในหน้าคิวครัวแล้ว — header ของ layout ต้องไม่มีปุ่มนี้ทุกหน้า
  // วิธี: เปิด /employee/order, /employee/check, /employee/tables → เช็กว่า header ไม่มีปุ่มปิดเมนูที่หมด แต่จำนวนโต๊ะว่างยังแสดง
  it.each(['/employee/order', '/employee/check', '/employee/tables'])('%s → header ไม่มีปุ่มปิดเมนูที่หมด', (path) => {
    setup({ path, role: Role.STAFF })
    expect(within(header()).queryByRole('button', { name: /ปิดเมนูที่หมด/ })).not.toBeInTheDocument()
    expect(tableCount()).toHaveTextContent('จำนวนโต๊ะที่ว่าง 2 โต๊ะ')
  })

  // ทดสอบ: จำนวนโต๊ะว่างนับเฉพาะโต๊ะสถานะ AVAILABLE และระหว่างโหลดขึ้น "—" พร้อมป้ายบัญชีตาม role (ชื่อคนอยู่ใน tooltip)
  // วิธี: mock 3 โต๊ะ (ว่าง 2) → เช็ก "จำนวนโต๊ะที่ว่าง 2 โต๊ะ" และป้าย "บัญชีครัว" ที่มี title เป็นชื่อ → mock โต๊ะยังไม่มา → เช็ก "—"
  it('จำนวนโต๊ะว่าง นับเฉพาะโต๊ะว่าง / ระหว่างโหลดขึ้น "—" และบอกบัญชีที่ login', () => {
    const { unmount } = setup()
    expect(tableCount()).toHaveTextContent('จำนวนโต๊ะที่ว่าง 2 โต๊ะ')
    expect(within(header()).getByText('บัญชีครัว')).toHaveAttribute('title', 'ครัวหนึ่ง')
    unmount()

    setup({ tables: null })
    expect(tableCount()).toHaveTextContent('จำนวนโต๊ะที่ว่าง — โต๊ะ')
  })
})
