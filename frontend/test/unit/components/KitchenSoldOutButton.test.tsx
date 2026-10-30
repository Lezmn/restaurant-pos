import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useIngredients } from '@/features/ingredients/hooks'
import { useMenuItems } from '@/features/menu/hooks'
import { KitchenSoldOutButton } from '@/pages/employee/KitchenSoldOut'

// ใส่ของจริงที่เหลือไว้ด้วย — Chrome จริง (npm run test:browser) ไม่ยอม import ชื่อที่ mock ไม่มี
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

// jsdom ยังไม่มี showModal ของ <dialog>
beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false
  }
})

const menu = (id: string, name: string, isAvailable: boolean) => ({ id, name, isAvailable, ingredientsOutOfStock: [] })
const ingredient = (id: string, name: string) => ({
  id,
  name,
  isAvailable: false,
  stockQty: null,
  menuItemCount: 1,
  menuOptionCount: 0,
})

function setup() {
  vi.mocked(useMenuItems).mockReturnValue({
    data: [
      menu('m-off-0', 'เมนูหมด 0', false),
      menu('m-on', 'ข้าวผัด', true),
    ],
    isPending: false,
  } as never)
  vi.mocked(useIngredients).mockReturnValue({
    data: [ingredient('i-off-0', 'วัตถุดิบหมด 0')],
    isPending: false,
  } as never)
  return render(<KitchenSoldOutButton />)
}

describe('KitchenSoldOutButton (ปุ่มปิดเมนูที่หมด บนจอครัว)', () => {
  beforeEach(() => vi.clearAllMocks())

  // ทดสอบ: ปุ่มเขียนแค่ "ปิดเมนูที่หมด" ตามดีไซน์ ไม่มีตัวเลขจำนวนต่อท้าย แม้มีของหมดอยู่
  // วิธี: mock เมนูหมด 1 + วัตถุดิบหมด 1 → เช็กข้อความปุ่มเป็น "ปิดเมนูที่หมด" พอดี
  it('ข้อความปุ่มไม่มีตัวเลขต่อท้าย', () => {
    setup()
    expect(screen.getByRole('button', { name: /ปิดเมนูที่หมด/ })).toHaveTextContent(/^ปิดเมนูที่หมด$/)
  })

  // ทดสอบ: กดปุ่มแล้วเปิดกล่องเลือกเมนู/วัตถุดิบที่หมด
  // วิธี: กดปุ่ม → เช็กว่ามี dialog และเห็นเมนูที่หมดอยู่ในรายการ
  it('กดปุ่ม → เปิดกล่องเลือกของหมด', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: /ปิดเมนูที่หมด/ }))
    expect(within(screen.getByRole('dialog')).getByText('เมนูหมด 0')).toBeInTheDocument()
  })
})
