import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useIngredients } from '@/features/ingredients/hooks'
import { useCreateMenuOption, useDeleteMenuOption, useMenuItem, useUpdateMenuOption } from '@/features/menu/hooks'
import { MenuOptionGroupKind } from '@/types/enums'
import type { Ingredient, MenuItem, MenuOption } from '@/types/models'
import { MenuOptionsEditor } from '@/pages/employee/MenuOptionsEditor'

// โหมดแก้ไขเมนู: ตัวเลือกยิง API ทันทีทุกครั้งที่กด — mock hook ตรง ๆ แล้วตรวจว่าส่งอะไรออกไป
vi.mock('@/features/menu/hooks', () => ({
  useMenuItem: vi.fn(),
  useCreateMenuOption: vi.fn(),
  useUpdateMenuOption: vi.fn(),
  useDeleteMenuOption: vi.fn(),
}))
vi.mock('@/features/ingredients/hooks', () => ({ useIngredients: vi.fn() }))

// jsdom ยังไม่มี showModal ของ <dialog>
beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false
  }
})

const ingredient = (id: string, name: string, overrides: Partial<Ingredient> = {}): Ingredient => ({
  id,
  name,
  isAvailable: true,
  menuOptionCount: 0,
  menuItemCount: 0,
  stockQty: null,
  lowStockAt: null,
  imageUrl: null,
  ...overrides,
})

const ingredients = [
  ingredient('pork', 'หมู'),
  ingredient('chicken', 'ไก่'),
  ingredient('egg', 'ไข่', { stockQty: 12 }),
  ingredient('shrimp', 'กุ้ง', { isAvailable: false }),
]

const option = (id: string, name: string, overrides: Partial<MenuOption> = {}): MenuOption => ({
  id,
  name,
  price: 0,
  group: MenuOptionGroupKind.EXTRA,
  isAvailable: true,
  ingredientId: null,
  ingredientName: null,
  ingredientOutOfStock: false,
  ingredientStockQty: null,
  usageQty: 1,
  ...overrides,
})

const defaultOptions = [
  option('o-pork', 'หมู', { group: MenuOptionGroupKind.PROTEIN, ingredientId: 'pork', ingredientName: 'หมู' }),
  option('o-beef', 'เนื้อ', { group: MenuOptionGroupKind.PROTEIN }),
  option('o-egg', 'ไข่ดาว', { price: 10, ingredientId: 'egg', ingredientName: 'ไข่', ingredientStockQty: 12, usageQty: 2 }),
  option('o-special', 'พิเศษ', { price: 15 }),
  option('o-old', 'ตัวเลือกที่ลบแล้ว', { isAvailable: false }),
]

const menuItem = (options: MenuOption[]): MenuItem => ({
  id: 'm1',
  categoryId: 'c1',
  name: 'กะเพรา',
  price: 60,
  imageUrl: null,
  isAvailable: true,
  proteinRequired: true,
  optionGroups: [{ id: 'g', name: 'ทั้งหมด', selectType: 'multiple', required: false, options }],
  ingredients: [],
  ingredientsOutOfStock: [],
})

type Mutation = { mutate: ReturnType<typeof vi.fn>; isPending: boolean; error: unknown }
let createOption: Mutation
let updateOption: Mutation
let deleteOption: Mutation

function setup(options: MenuOption[] = defaultOptions, state: { pending?: boolean; error?: unknown } = {}) {
  vi.mocked(useMenuItem).mockReturnValue({ data: menuItem(options) } as never)
  vi.mocked(useIngredients).mockReturnValue({ data: ingredients } as never)
  createOption = { mutate: vi.fn(), isPending: state.pending ?? false, error: state.error ?? null }
  updateOption = { mutate: vi.fn(), isPending: false, error: null }
  deleteOption = { mutate: vi.fn(), isPending: false, error: null }
  vi.mocked(useCreateMenuOption).mockReturnValue(createOption as never)
  vi.mocked(useUpdateMenuOption).mockReturnValue(updateOption as never)
  vi.mocked(useDeleteMenuOption).mockReturnValue(deleteOption as never)
  const onDraftChange = vi.fn()
  render(<MenuOptionsEditor menuItemId="m1" onDraftChange={onDraftChange} />)
  return { onDraftChange }
}

/** แถวตัวเลือกที่มีอยู่แล้ว หาจากปุ่มแก้ไขของตัวเลือกนั้น */
const optionRow = (name: string) =>
  screen.getByRole('button', { name: `แก้ไขตัวเลือก ${name}` }).closest('li') as HTMLElement

/** แถวเพิ่มตัวเลือกใหม่อยู่ล่างสุด (กล่องกลุ่มอันสุดท้าย) */
const newRow = () => {
  const selects = screen.getAllByRole('combobox', { name: 'กลุ่มตัวเลือก' })
  return selects[selects.length - 1].parentElement!.parentElement as HTMLElement
}

describe('MenuOptionsEditor — ตัวเลือกของเมนู (โหมดแก้ไข)', () => {
  beforeEach(() => vi.clearAllMocks())

  // ทดสอบ: ตัวเลือกถูกแบ่งเป็นกลุ่มเนื้อสัตว์/เพิ่มเติม และตัวเลือกที่ลบไปแล้ว (isAvailable = false) ต้องไม่โผล่
  // วิธี: mock ตัวเลือก 5 ตัว (มี 1 ตัวที่ลบแล้ว) → เช็กหัวกลุ่มทั้งสอง ตัวเลือกในแต่ละกลุ่ม และไม่มีตัวที่ลบแล้ว
  it('แบ่งกลุ่มเนื้อสัตว์/เพิ่มเติม และซ่อนตัวเลือกที่ลบแล้ว', () => {
    setup()
    const protein = screen.getByText('เนื้อสัตว์ (เลือกได้ 1)').parentElement as HTMLElement
    const extra = screen.getByText('เพิ่มเติม (เลือกได้หลายอย่าง)').parentElement as HTMLElement
    expect(within(protein).getAllByRole('listitem')).toHaveLength(2)
    expect(within(extra).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.queryByText('ตัวเลือกที่ลบแล้ว')).not.toBeInTheDocument()
  })

  // ทดสอบ: ป้ายของแต่ละตัวเลือกบอกถูก: ราคาเพิ่ม, เนื้อสัตว์ที่ยังไม่ผูกวัตถุดิบ, วัตถุดิบที่ผูกพร้อมจำนวนคงเหลือและจำนวนที่ใช้ต่อจาน
  // วิธี: เช็กข้อความในแถว เนื้อ (ยังไม่ผูกวัตถุดิบ), ไข่ดาว (+฿10, ไข่ · เหลือ 12 · ใช้ 2), หมู (มีของ ไม่ซ้ำชื่อวัตถุดิบ), พิเศษ (+฿15 ไม่มีป้ายวัตถุดิบ)
  it('ป้ายราคา วัตถุดิบ และสต็อกของแต่ละตัวเลือก', () => {
    setup()
    expect(optionRow('เนื้อ')).toHaveTextContent('ยังไม่ผูกวัตถุดิบ')
    expect(optionRow('ไข่ดาว')).toHaveTextContent('+฿10')
    expect(optionRow('ไข่ดาว')).toHaveTextContent('ไข่ · เหลือ 12 · ใช้ 2')
    expect(optionRow('หมู')).toHaveTextContent('มีของ')
    expect(optionRow('หมู')).not.toHaveTextContent('หมู · ')
    expect(optionRow('พิเศษ')).toHaveTextContent('+฿15')
    expect(optionRow('พิเศษ')).not.toHaveTextContent('มีของ')
  })

  // ทดสอบ: ป้ายสต็อกแสดงแบบอื่นถูก: วัตถุดิบหมดขึ้น "หมด" และใช้ 0 หน่วยต่อจานขึ้น "ไม่ตัดสต็อก"
  // วิธี: mock ตัวเลือกที่วัตถุดิบหมด และตัวเลือกที่ usageQty = 0 → เช็กข้อความป้าย
  it('ป้ายสต็อก: หมด / ไม่ตัดสต็อก', () => {
    setup([
      option('o1', 'กุ้ง', { group: MenuOptionGroupKind.PROTEIN, ingredientId: 'shrimp', ingredientName: 'กุ้ง', ingredientOutOfStock: true }),
      option('o2', 'ไข่เจียว', { ingredientId: 'egg', ingredientName: 'ไข่', ingredientStockQty: 5, usageQty: 0 }),
    ])
    expect(optionRow('กุ้ง')).toHaveTextContent('หมด')
    expect(optionRow('ไข่เจียว')).toHaveTextContent('ไข่ · เหลือ 5 · ไม่ตัดสต็อก')
  })

  // ทดสอบ: เมนูที่ยังไม่มีตัวเลือก ต้องบอกว่ายังไม่มี
  // วิธี: mock รายการตัวเลือกว่าง → เช็กข้อความ "ยังไม่มีตัวเลือก"
  it('ยังไม่มีตัวเลือก → บอกว่ายังไม่มี', () => {
    setup([])
    expect(screen.getByText('ยังไม่มีตัวเลือก')).toBeInTheDocument()
  })

  // ทดสอบ: เพิ่มตัวเลือกกลุ่มเพิ่มเติมแล้วยิง API ทันที ด้วยชื่อที่ตัดช่องว่าง ราคาเป็นตัวเลข ไม่ผูกวัตถุดิบ และใช้ 1 หน่วย แล้วล้างช่องให้กรอกตัวต่อไป
  // วิธี: พิมพ์ชื่อ '  ชีส  ' และราคา 20 ในแถวเพิ่ม → กด "+ เพิ่ม" → เช็ก payload ที่ส่ง createOption.mutate → เช็กว่าช่องชื่อกลับมาว่าง
  it('เพิ่มตัวเลือกเพิ่มเติม → ยิง API พร้อมข้อมูลถูกต้อง แล้วล้างช่อง', async () => {
    const user = userEvent.setup()
    setup()
    const row = newRow()
    await user.type(within(row).getByLabelText('ชื่อตัวเลือกใหม่'), '  ชีส  ')
    await user.type(within(row).getByLabelText('ราคาเพิ่ม (บาท)'), '20')
    await user.click(within(row).getByRole('button', { name: '+ เพิ่ม' }))
    expect(createOption.mutate).toHaveBeenCalledWith({
      menuItemId: 'm1',
      input: { name: 'ชีส', price: 20, group: MenuOptionGroupKind.EXTRA, isAvailable: true, ingredientId: null, usageQty: 1 },
    })
    expect(within(row).getByLabelText('ชื่อตัวเลือกใหม่')).toHaveValue('')
  })

  // ทดสอบ: กด Enter ในช่องชื่อตัวเลือกต้องเพิ่มตัวเลือก (ไม่ไป submit ฟอร์มเมนูทั้งใบ) และผูกวัตถุดิบพร้อมจำนวนที่ใช้ได้
  // วิธี: พิมพ์ชื่อ ไข่เจียว เลือกวัตถุดิบไข่ ใส่จำนวนที่ใช้ 0 → กด Enter ในช่องชื่อ → เช็กว่า payload มี ingredientId 'egg' และ usageQty 0
  it('Enter เพิ่มตัวเลือก และผูกวัตถุดิบพร้อมจำนวนที่ใช้ต่อจาน', async () => {
    const user = userEvent.setup()
    setup()
    const row = newRow()
    await user.selectOptions(within(row).getByLabelText('วัตถุดิบที่ใช้'), 'egg')
    await user.clear(within(row).getByLabelText('ใช้วัตถุดิบกี่หน่วยต่อจาน'))
    await user.type(within(row).getByLabelText('ใช้วัตถุดิบกี่หน่วยต่อจาน'), '0')
    await user.type(within(row).getByLabelText('ชื่อตัวเลือกใหม่'), 'ไข่เจียว{Enter}')
    expect(createOption.mutate).toHaveBeenCalledWith({
      menuItemId: 'm1',
      input: expect.objectContaining({ name: 'ไข่เจียว', ingredientId: 'egg', usageQty: 0, price: 0 }),
    })
  })

  // ทดสอบ: ชื่อตัวเลือกซ้ำกับที่มีอยู่ (ไม่สนตัวพิมพ์เล็กใหญ่และช่องว่างหัวท้าย) ต้องเตือน และกดเพิ่มไม่ได้
  // วิธี: พิมพ์ '  พิเศษ ' ซึ่งซ้ำกับตัวเลือกที่มี → เช็กข้อความ "เมนูนี้มีตัวเลือกชื่อนี้แล้ว" และปุ่ม "+ เพิ่ม" กดไม่ได้
  it('ชื่อซ้ำ → เตือน และกดเพิ่มไม่ได้', async () => {
    const user = userEvent.setup()
    setup()
    const row = newRow()
    await user.type(within(row).getByLabelText('ชื่อตัวเลือกใหม่'), '  พิเศษ ')
    expect(within(row).getByRole('alert')).toHaveTextContent('เมนูนี้มีตัวเลือกชื่อนี้แล้ว')
    expect(within(row).getByRole('button', { name: '+ เพิ่ม' })).toBeDisabled()
  })

  // ทดสอบ: ตัวเลือกเนื้อสัตว์ต้องเลือกจากวัตถุดิบ (พิมพ์ชื่อเองไม่ได้) ชื่อมาจากวัตถุดิบ และวัตถุดิบที่เป็นเนื้อสัตว์ในเมนูนี้แล้วเลือกซ้ำไม่ได้
  // วิธี: เปลี่ยนกลุ่มเป็นเนื้อสัตว์ → เช็กว่าไม่มีช่องชื่อ ปุ่มเพิ่มกดไม่ได้ และตัวเลือกวัตถุดิบไม่มีหมู (ใช้แล้ว) → เลือกไก่แล้วกดเพิ่ม → เช็ก payload ชื่อ ไก่ กลุ่ม PROTEIN
  it('เพิ่มเนื้อสัตว์: เลือกจากวัตถุดิบ และไม่ให้เลือกซ้ำ', async () => {
    const user = userEvent.setup()
    setup()
    const row = newRow()
    await user.selectOptions(within(row).getByLabelText('กลุ่มตัวเลือก'), MenuOptionGroupKind.PROTEIN)
    expect(within(row).queryByLabelText('ชื่อตัวเลือกใหม่')).not.toBeInTheDocument()
    expect(within(row).getByRole('button', { name: '+ เพิ่ม' })).toBeDisabled()

    const choices = within(within(row).getByLabelText('วัตถุดิบที่ใช้')).getAllByRole('option').map((o) => o.textContent)
    expect(choices).toEqual(['เลือกวัตถุดิบ', 'ไก่', 'ไข่', 'กุ้ง (ตอนนี้ของหมด)'])

    await user.selectOptions(within(row).getByLabelText('วัตถุดิบที่ใช้'), 'chicken')
    await user.click(within(row).getByRole('button', { name: '+ เพิ่ม' }))
    expect(createOption.mutate).toHaveBeenCalledWith({
      menuItemId: 'm1',
      input: expect.objectContaining({ name: 'ไก่', group: MenuOptionGroupKind.PROTEIN, ingredientId: 'chicken' }),
    })
  })

  // ทดสอบ: พิมพ์ตัวเลือกค้างไว้โดยยังไม่กดเพิ่ม ต้องเตือนในแถว และแจ้งฟอร์มเมนูว่ามีของค้าง (ใช้เตือนก่อนปิดกล่อง)
  // วิธี: พิมพ์ชื่อในแถวเพิ่ม → เช็กข้อความ "ยังไม่ได้เพิ่ม" และ onDraftChange ถูกเรียกด้วย true
  it('พิมพ์ค้างไว้ → เตือน และแจ้งฟอร์มว่ามีตัวเลือกค้าง', async () => {
    const user = userEvent.setup()
    const { onDraftChange } = setup()
    expect(onDraftChange).toHaveBeenLastCalledWith(false)
    await user.type(within(newRow()).getByLabelText('ชื่อตัวเลือกใหม่'), 'ซอส')
    expect(screen.getByText(/ยังไม่ได้เพิ่ม/)).toBeInTheDocument()
    expect(onDraftChange).toHaveBeenLastCalledWith(true)
  })

  // ทดสอบ: แก้ตัวเลือกที่มีอยู่แล้วกดบันทึก ต้องยิง API พร้อม id ของตัวเลือกและค่าใหม่ (ราคา, วัตถุดิบ, จำนวนที่ใช้เดิม)
  // วิธี: กดแก้ไขไข่ดาว → เปลี่ยนราคาเป็น 12 → กดบันทึก → เช็ก payload ที่ส่ง updateOption.mutate และแถวกลับเป็นโหมดดู
  it('แก้ไขตัวเลือก → ยิง API พร้อมค่าใหม่', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'แก้ไขตัวเลือก ไข่ดาว' }))
    const editRow = screen.getByDisplayValue('ไข่ดาว').closest('li') as HTMLElement
    const editPrice = within(editRow).getByPlaceholderText('+บาท')
    await user.clear(editPrice)
    await user.type(editPrice, '12')
    await user.click(within(editRow).getByRole('button', { name: 'บันทึก' }))
    expect(updateOption.mutate).toHaveBeenCalledWith({
      menuItemId: 'm1',
      optionId: 'o-egg',
      input: { name: 'ไข่ดาว', price: 12, group: MenuOptionGroupKind.EXTRA, ingredientId: 'egg', usageQty: 2 },
    })
    expect(screen.getByRole('button', { name: 'แก้ไขตัวเลือก ไข่ดาว' })).toBeInTheDocument()
  })

  // ทดสอบ: กดยกเลิกตอนแก้ตัวเลือก ต้องไม่ยิง API และค่าที่พิมพ์ไว้ต้องถูกทิ้ง
  // วิธี: กดแก้ไขพิเศษ → เปลี่ยนชื่อ → กดยกเลิก → เช็กว่า updateOption.mutate ไม่ถูกเรียก → กดแก้ไขอีกครั้ง เช็กว่าชื่อกลับเป็นค่าเดิม
  it('แก้ไขตัวเลือกแล้วยกเลิก → ไม่บันทึก และคืนค่าเดิม', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'แก้ไขตัวเลือก พิเศษ' }))
    const nameInput = screen.getByDisplayValue('พิเศษ')
    await user.clear(nameInput)
    await user.type(nameInput, 'จัมโบ้')
    await user.click(within(nameInput.closest('li') as HTMLElement).getByRole('button', { name: 'ยกเลิก' }))
    expect(updateOption.mutate).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'แก้ไขตัวเลือก พิเศษ' }))
    expect(screen.getByDisplayValue('พิเศษ')).toBeInTheDocument()
  })

  // ทดสอบ: ลบตัวเลือกต้องยืนยันก่อน กล่องบอกชื่อ ราคาเพิ่ม และเตือนว่าถ้าแค่ของหมดให้ปิดที่วัตถุดิบ, ยืนยันแล้วยิง API และพอสำเร็จกล่องปิด
  // วิธี: กดลบไข่ดาว → เช็กข้อความในกล่อง "ลบตัวเลือก" → กดปุ่มลบตัวเลือกในกล่อง → เช็ก payload → เรียก onSuccess → เช็กว่ากล่องปิด
  it('ลบตัวเลือก: ยืนยันก่อน แล้วยิง API', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'ลบตัวเลือก ไข่ดาว' }))
    const dialog = screen.getByRole('dialog', { name: 'ลบตัวเลือก' })
    expect(dialog).toHaveTextContent('ไข่ดาว')
    expect(dialog).toHaveTextContent('เพิ่มเงิน ฿10')
    expect(dialog).toHaveTextContent('ให้ปิดที่แท็บ "วัตถุดิบ" แทน')
    await user.click(within(dialog).getByRole('button', { name: 'ลบตัวเลือก' }))
    expect(deleteOption.mutate).toHaveBeenCalledWith({ menuItemId: 'm1', optionId: 'o-egg' }, expect.anything())
    deleteOption.mutate.mock.calls[0][1].onSuccess()
    expect(await screen.findByRole('heading', { name: 'ตัวเลือกของเมนู' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'ลบตัวเลือก' })).not.toBeInTheDocument()
  })

  // ทดสอบ: ระหว่างยิง API ปุ่มแก้ไข/ลบ/เพิ่มต้องกดไม่ได้ กันกดซ้ำ และ error จาก backend ต้องแสดงในส่วนตัวเลือก
  // วิธี: mock createOption เป็น isPending พร้อม error → เช็กว่าปุ่มแก้ไขและลบกดไม่ได้ และเห็นข้อความ error
  it('กำลังบันทึก → ปุ่มกดไม่ได้ และ error แสดงให้เห็น', () => {
    setup(defaultOptions, { pending: true, error: new Error('ชื่อตัวเลือกซ้ำ') })
    expect(screen.getByRole('button', { name: 'แก้ไขตัวเลือก ไข่ดาว' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'ลบตัวเลือก ไข่ดาว' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('ชื่อตัวเลือกซ้ำ')
  })
})
