import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { EmployeeLayout } from '@/components/layout/EmployeeLayout'
import { useAuth } from '@/features/auth/use-auth'
import { useIngredients } from '@/features/ingredients/hooks'
import { useMenuItems } from '@/features/menu/hooks'
import { useTables } from '@/features/tables/hooks'
import { Role, TableStatus } from '@/types/enums'

// หัวจอของพนักงาน — ปุ่ม "ของหมด" อยู่บน header ข้างหัวข้อหน้า และโผล่เฉพาะหน้า Order (จอครัว)
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

const soldOutButton = () => screen.queryByRole('button', { name: /^ของหมด/ })
/** ป้ายจำนวนโต๊ะว่างบน header (ตัวเลขอยู่ใน <span> แยก) */
const tableCount = () => screen.getByText(/จำนวนโต๊ะที่ว่าง/)
const header = () => screen.getByRole('banner')

describe('EmployeeLayout — ปุ่มของหมดบนหัวจอ', () => {
  beforeEach(() => vi.clearAllMocks())

  // ทดสอบ: หน้า Order (จอครัว) ต้องมีปุ่มของหมดบน header (ไม่กินอีกแถวเหนือบอร์ด) และบอกจำนวนที่ปิดอยู่
  // วิธี: เปิด /employee/order โดยมีเมนูหมด 1 + วัตถุดิบหมด 1 → เช็กปุ่ม "ของหมด (2)" อยู่ใน header (banner) และหน้าเนื้อหาครัวยังขึ้น
  it('หน้า Order → มีปุ่ม "ของหมด (จำนวน)" บน header', () => {
    setup()
    expect(screen.getByText('บอร์ดครัว')).toBeInTheDocument()
    const button = soldOutButton()
    expect(button).toHaveTextContent('ของหมด (2)')
    expect(within(header()).getByRole('button', { name: /^ของหมด/ })).toBe(button)
  })

  // ทดสอบ: ยังไม่มีอะไรหมด ปุ่มต้องเขียนแค่ "ของหมด" ไม่มีวงเล็บ (0)
  // วิธี: mock ไม่มีเมนูหรือวัตถุดิบที่ปิดอยู่ → เช็กข้อความปุ่มเป็น "ของหมด" พอดี
  it('ไม่มีอะไรหมด → ปุ่มเขียนแค่ "ของหมด"', () => {
    setup({ offMenus: 0, offIngredients: 0 })
    expect(soldOutButton()).toHaveTextContent(/^ของหมด$/)
  })

  // ทดสอบ: ปุ่มของหมดมีเฉพาะหน้า Order — หน้าอื่นของพนักงานต้องไม่มี (ปิดเมนูทำที่หน้า Manage แทน)
  // วิธี: เปิด /employee/check และ /employee/tables ด้วย role ที่เข้าได้ → เช็กว่าไม่มีปุ่มของหมด แต่จำนวนโต๊ะว่างยังแสดง
  it.each(['/employee/check', '/employee/tables'])('หน้าอื่น (%s) → ไม่มีปุ่มของหมด', (path) => {
    setup({ path, role: Role.STAFF })
    expect(soldOutButton()).not.toBeInTheDocument()
    expect(tableCount()).toHaveTextContent('จำนวนโต๊ะที่ว่าง 2 โต๊ะ')
  })

  // ทดสอบ: กดปุ่มของหมดบนหัวจอแล้วต้องเปิดกล่องเลือกเมนู/วัตถุดิบที่หมด (ย้ายมาจากในบอร์ดครัวแล้วยังใช้ได้)
  // วิธี: เปิดหน้า Order → กดปุ่มของหมด → เช็กว่ามี dialog และเห็นเมนูที่หมดอยู่ในรายการ
  it('กดปุ่มของหมด → เปิดกล่องเลือกของหมด', async () => {
    setup()
    await userEvent.click(soldOutButton()!)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('เมนูหมด 0')).toBeInTheDocument()
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
