import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { uploadMenuImage } from '@/features/menu/api'
import { useIngredients } from '@/features/ingredients/hooks'
import { useCategories, useCreateMenuOption, useDeleteMenuOption, useMenuItem, useUpdateMenuOption } from '@/features/menu/hooks'
import { resizeImage } from '@/lib/image-resize'
import { MenuOptionGroupKind } from '@/types/enums'
import type { Ingredient, MenuItem } from '@/types/models'
import { MenuFormDialog } from '@/pages/employee/MenuFormDialog'

// ข้อมูลหมวด/วัตถุดิบมาจาก hook — mock ตรง ๆ ส่วนการบันทึกเมนูดูจาก onSubmit ที่ฟอร์มส่งออกมา
vi.mock('@/features/menu/hooks', () => ({
  useCategories: vi.fn(),
  useMenuItem: vi.fn(),
  useCreateMenuOption: vi.fn(),
  useUpdateMenuOption: vi.fn(),
  useDeleteMenuOption: vi.fn(),
}))
vi.mock('@/features/ingredients/hooks', () => ({ useIngredients: vi.fn() }))
// อัปโหลดรูปยิง API จริง และย่อรูปต้องใช้ canvas ที่ jsdom ไม่มี — mock ทั้งสองตัว
vi.mock('@/features/menu/api', async (orig) => ({
  ...(await orig<typeof import('@/features/menu/api')>()),
  uploadMenuImage: vi.fn(),
}))
vi.mock('@/lib/image-resize', () => ({ resizeImage: vi.fn() }))

// jsdom ยังไม่มี showModal ของ <dialog>
beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false
  }
})

const categories = [
  { id: 'c1', name: 'อาหารจานเดียว' },
  { id: 'c2', name: 'เครื่องดื่ม' },
]

const ingredient = (id: string, name: string, isAvailable = true): Ingredient => ({
  id,
  name,
  isAvailable,
  menuOptionCount: 0,
  menuItemCount: 0,
  stockQty: null,
  lowStockAt: null,
  imageUrl: null,
})
const ingredients = [ingredient('rice', 'ข้าว'), ingredient('egg', 'ไข่'), ingredient('pork', 'หมู', false)]

const kaprao: MenuItem = {
  id: 'm1',
  categoryId: 'c1',
  name: 'กะเพรา',
  price: 60,
  imageUrl: 'https://img.example/kaprao.jpg',
  isAvailable: true,
  proteinRequired: true,
  optionGroups: [],
  ingredients: [{ id: 'rice', name: 'ข้าว' } as MenuItem['ingredients'][number]],
  ingredientsOutOfStock: [],
}

type Props = Partial<Parameters<typeof MenuFormDialog>[0]>

function setup(props: Props = {}, { categoryList = categories }: { categoryList?: typeof categories } = {}) {
  vi.mocked(useCategories).mockReturnValue({ data: categoryList } as never)
  vi.mocked(useIngredients).mockReturnValue({ data: ingredients } as never)
  vi.mocked(useMenuItem).mockReturnValue({ data: props.item } as never)
  const idle = { mutate: vi.fn(), isPending: false, error: null }
  vi.mocked(useCreateMenuOption).mockReturnValue(idle as never)
  vi.mocked(useUpdateMenuOption).mockReturnValue(idle as never)
  vi.mocked(useDeleteMenuOption).mockReturnValue(idle as never)
  const handlers = { onCancel: vi.fn(), onSubmit: vi.fn(), onDelete: vi.fn() }
  const view = render(<MenuFormDialog isSaving={false} error={null} {...handlers} {...props} />)
  return { ...handlers, ...view }
}

const nameInput = () => screen.getByLabelText(/^ชื่อเมนู/)
const priceInput = () => screen.getByLabelText(/^ราคา \(บาท\)/)
const categorySelect = (container: HTMLElement) => container.querySelector('select[name="category"]') as HTMLSelectElement

describe('MenuFormDialog — เพิ่มเมนูใหม่', () => {
  beforeEach(() => vi.clearAllMocks())

  // ทดสอบ: กดบันทึกตอนฟอร์มว่าง ต้องบอกข้อผิดพลาดตรงช่อง (ชื่อ, ราคา, หมวดหมู่) พาโฟกัสไปช่องแรกที่ผิด และไม่ส่งข้อมูล
  // วิธี: เปิดฟอร์มเพิ่มเมนู → กดบันทึก → เช็กข้อความเตือนทั้งสามช่อง ช่องชื่อได้โฟกัส และ onSubmit ไม่ถูกเรียก
  it('ฟอร์มว่าง → เตือนทุกช่องที่ขาด และไม่บันทึก', async () => {
    const user = userEvent.setup()
    const { onSubmit } = setup()
    expect(screen.getByRole('dialog', { name: 'เพิ่มเมนูใหม่' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'บันทึก' }))
    expect(screen.getByText('กรอกชื่อเมนู')).toBeInTheDocument()
    expect(screen.getByText('กรอกราคา (ใส่ 0 ได้ถ้าแจกฟรี)')).toBeInTheDocument()
    expect(screen.getByText('เลือกหมวดหมู่', { selector: '[role="alert"]' })).toBeInTheDocument()
    expect(nameInput()).toHaveFocus()
    expect(nameInput()).toHaveAttribute('aria-invalid', 'true')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  // ทดสอบ: ราคาติดลบต้องไม่ผ่าน แต่ราคา 0 (แจกฟรี) ผ่าน
  // วิธี: กรอกชื่อและเลือกหมวด → ใส่ราคา -5 กดบันทึก เช็กข้อความเตือน → เปลี่ยนเป็น 0 กดบันทึก เช็กว่า onSubmit ได้ price 0
  it('ราคาติดลบไม่ผ่าน ราคา 0 ผ่าน', async () => {
    const user = userEvent.setup()
    const { onSubmit, container } = setup()
    await user.type(nameInput(), 'น้ำเปล่า')
    await user.selectOptions(categorySelect(container), 'c2')
    await user.type(priceInput(), '-5')
    await user.click(screen.getByRole('button', { name: 'บันทึก' }))
    expect(screen.getByText('ราคาต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()

    await user.clear(priceInput())
    await user.type(priceInput(), '0')
    await user.click(screen.getByRole('button', { name: 'บันทึก' }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ price: 0 }), [])
  })

  // ทดสอบ: ลิงก์รูปที่ไม่ได้ขึ้นต้นด้วย http:// หรือ https:// ต้องไม่ผ่าน
  // วิธี: กรอกข้อมูลครบ แต่ลิงก์รูปเป็น 'ftp://x' → กดบันทึก → เช็กข้อความเตือนลิงก์รูป และ onSubmit ไม่ถูกเรียก
  it('ลิงก์รูปผิดรูปแบบ → เตือน', async () => {
    const user = userEvent.setup()
    const { onSubmit, container } = setup()
    await user.type(nameInput(), 'น้ำเปล่า')
    await user.type(priceInput(), '10')
    await user.selectOptions(categorySelect(container), 'c2')
    await user.type(screen.getByLabelText('หรือวางลิงก์รูปจากที่อื่น'), 'ftp://x')
    await user.click(screen.getByRole('button', { name: 'บันทึก' }))
    expect(screen.getByText('ลิงก์รูปต้องขึ้นต้นด้วย http:// หรือ https://')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  // ทดสอบ: ร้านที่ยังไม่มีหมวดหมู่เลย ต้องบอกว่ายังไม่มีหมวดหมู่ในระบบ แทนการบอกให้เลือก
  // วิธี: mock หมวดหมู่ว่าง → กดบันทึก → เช็กข้อความ "ยังไม่มีหมวดหมู่ในระบบ"
  it('ยังไม่มีหมวดหมู่ในระบบ → บอกตรง ๆ', async () => {
    const user = userEvent.setup()
    setup({}, { categoryList: [] })
    await user.click(screen.getByRole('button', { name: 'บันทึก' }))
    expect(screen.getByText('ยังไม่มีหมวดหมู่ในระบบ')).toBeInTheDocument()
  })

  // ทดสอบ: เพิ่มเมนูครบทุกช่อง ต้องส่งชื่อที่ตัดช่องว่าง ราคาเป็นตัวเลข หมวด สถานะขาย วัตถุดิบหลัก ลิงก์รูป และตัวเลือกที่ใส่ไว้ (ทั้งเพิ่มเติมและเนื้อสัตว์) ออกไปพร้อมกัน
  // วิธี: กรอกชื่อมีช่องว่าง ราคา 55 หมวดอาหารจานเดียว เอาติ๊กพร้อมจำหน่ายออก กดวัตถุดิบหลัก ข้าว+ไข่ ใส่ลิงก์รูป → เพิ่มตัวเลือก ไข่ดาว +10 และเนื้อสัตว์ หมู → กดบันทึก → เช็กค่าที่ onSubmit ได้รับทั้งสองก้อน
  it('ข้อมูลครบ → ส่งเมนูพร้อมตัวเลือกที่ใส่ไว้', async () => {
    const user = userEvent.setup()
    const { onSubmit, container } = setup()
    await user.type(nameInput(), '  ข้าวไข่เจียว  ')
    await user.type(priceInput(), '55')
    await user.selectOptions(categorySelect(container), 'c1')
    await user.click(screen.getByRole('checkbox', { name: 'พร้อมจำหน่าย' }))
    await user.click(screen.getByRole('button', { name: 'ข้าว' }))
    await user.click(screen.getByRole('button', { name: 'ไข่' }))
    expect(screen.getByRole('button', { name: 'ไข่' })).toHaveAttribute('aria-pressed', 'true')
    await user.type(screen.getByLabelText('หรือวางลิงก์รูปจากที่อื่น'), ' https://img.example/omelet.jpg ')

    await user.type(screen.getByLabelText('ชื่อตัวเลือกใหม่'), 'ไข่ดาว')
    await user.type(screen.getByLabelText('ราคาเพิ่ม (บาท)'), '10')
    await user.click(screen.getByRole('button', { name: '+ เพิ่ม' }))
    await user.selectOptions(screen.getByLabelText('กลุ่มตัวเลือก'), MenuOptionGroupKind.PROTEIN)
    await user.selectOptions(screen.getByLabelText('วัตถุดิบที่ใช้'), 'pork')
    await user.click(screen.getByRole('button', { name: '+ เพิ่ม' }))
    expect(screen.getByRole('button', { name: 'ลบตัวเลือก ไข่ดาว' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ลบตัวเลือก หมู' })).toBeInTheDocument()

    // ข้าวไข่เจียว: เนื้อสัตว์เป็นของเพิ่ม สั่งเปล่า ๆ ได้ — ค่าเริ่มต้นติ๊กไว้ (ต้องเลือก) จึงเอาออก
    const protein = screen.getByRole('checkbox', { name: /ลูกค้าต้องเลือกเนื้อสัตว์ก่อนสั่ง/ })
    expect(protein).toBeChecked()
    await user.click(protein)

    await user.click(screen.getByRole('button', { name: 'บันทึก' }))
    expect(onSubmit).toHaveBeenCalledWith(
      {
        name: 'ข้าวไข่เจียว',
        price: 55,
        imageUrl: 'https://img.example/omelet.jpg',
        categoryId: 'c1',
        isAvailable: false,
        proteinRequired: false,
        ingredientIds: ['rice', 'egg'],
      },
      [
        { name: 'ไข่ดาว', price: 10, group: MenuOptionGroupKind.EXTRA, isAvailable: true, ingredientId: null, usageQty: 1 },
        { name: 'หมู', price: 0, group: MenuOptionGroupKind.PROTEIN, isAvailable: true, ingredientId: 'pork', usageQty: 1 },
      ],
    )
  })

  // ทดสอบ: ตัวเลือกที่ใส่ไว้ลบออกได้ก่อนบันทึก และลิงก์รูปว่างต้องส่งเป็น null
  // วิธี: เพิ่มตัวเลือก ชีส แล้วกดลบ → กรอกข้อมูลเมนูครบโดยไม่ใส่รูป → กดบันทึก → เช็กว่า imageUrl เป็น null และรายการตัวเลือกว่าง
  it('ลบตัวเลือกที่ใส่ไว้ได้ และไม่มีรูป = null', async () => {
    const user = userEvent.setup()
    const { onSubmit, container } = setup()
    await user.type(screen.getByLabelText('ชื่อตัวเลือกใหม่'), 'ชีส')
    await user.click(screen.getByRole('button', { name: '+ เพิ่ม' }))
    await user.click(screen.getByRole('button', { name: 'ลบตัวเลือก ชีส' }))
    expect(screen.getByText('ยังไม่มีตัวเลือก')).toBeInTheDocument()

    await user.type(nameInput(), 'ชาเย็น')
    await user.type(priceInput(), '35')
    await user.selectOptions(categorySelect(container), 'c2')
    await user.click(screen.getByRole('button', { name: 'บันทึก' }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ imageUrl: null, ingredientIds: [] }), [])
  })

  // ทดสอบ: พิมพ์ตัวเลือกค้างไว้แต่ยังไม่กด "+ เพิ่ม" ต้องบันทึกไม่ได้ (กันตัวเลือกหายเงียบ ๆ) และพาโฟกัสไปช่องตัวเลือก
  // วิธี: กรอกเมนูครบ → พิมพ์ชื่อตัวเลือกค้างไว้ → กดบันทึก → เช็กข้อความเตือน ช่องตัวเลือกได้โฟกัส และ onSubmit ไม่ถูกเรียก
  it('ตัวเลือกพิมพ์ค้างไว้ → บันทึกไม่ได้จนกว่าจะเพิ่มหรือลบ', async () => {
    const user = userEvent.setup()
    const { onSubmit, container } = setup()
    await user.type(nameInput(), 'กะเพรา')
    await user.type(priceInput(), '60')
    await user.selectOptions(categorySelect(container), 'c1')
    await user.type(screen.getByLabelText('ชื่อตัวเลือกใหม่'), 'ไข่ดาว')
    await user.click(screen.getByRole('button', { name: 'บันทึก' }))
    expect(screen.getByText(/ตัวเลือกที่พิมพ์ไว้ยังไม่ได้เพิ่ม/)).toBeInTheDocument()
    expect(screen.getByLabelText('ชื่อตัวเลือกใหม่')).toHaveFocus()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  // ทดสอบ: กดยกเลิกตอนมีตัวเลือกพิมพ์ค้าง ครั้งแรกต้องเตือนก่อน กดซ้ำถึงจะปิดจริง ส่วนฟอร์มที่ไม่มีของค้างปิดได้ทันที
  // วิธี: พิมพ์ชื่อตัวเลือกค้างไว้ → กดยกเลิก เช็กข้อความเตือนและ onCancel ยังไม่ถูกเรียก → กดยกเลิกอีกครั้ง เช็กว่า onCancel ถูกเรียก
  it('ปิดตอนมีตัวเลือกค้าง → เตือนครั้งแรก กดซ้ำถึงปิด', async () => {
    const user = userEvent.setup()
    const { onCancel } = setup()
    await user.type(screen.getByLabelText('ชื่อตัวเลือกใหม่'), 'ไข่ดาว')
    await user.click(screen.getByRole('button', { name: 'ยกเลิก' }))
    expect(screen.getByText(/กดปิดอีกครั้งเพื่อทิ้ง/)).toBeInTheDocument()
    expect(onCancel).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'ยกเลิก' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  // ทดสอบ: เปิดฟอร์มเพิ่มเมนูตอนกรองหมวดอยู่ ต้องตั้งหมวดนั้นไว้ให้ก่อน
  // วิธี: ส่ง defaultCategoryId = 'c2' → เช็กว่าช่องหมวดหมู่เลือก c2 ไว้แล้ว
  it('ตั้งหมวดเริ่มต้นตามหมวดที่กรองอยู่', () => {
    const { container } = setup({ defaultCategoryId: 'c2' })
    expect(categorySelect(container)).toHaveValue('c2')
  })

  // ทดสอบ: ระหว่างบันทึกปุ่มต้องขึ้น "กำลังบันทึก..." และกดไม่ได้ และ error จาก backend ต้องแสดงในฟอร์ม
  // วิธี: render ด้วย isSaving = true และ error → เช็กปุ่มและข้อความ error
  it('กำลังบันทึก / error จาก backend', () => {
    setup({ isSaving: true, error: new Error('ชื่อเมนูซ้ำ') })
    expect(screen.getByRole('button', { name: 'กำลังบันทึก...' })).toBeDisabled()
    expect(screen.getByText('ชื่อเมนูซ้ำ')).toBeInTheDocument()
  })
})

describe('MenuFormDialog — รูปเมนู', () => {
  beforeEach(() => vi.clearAllMocks())

  // ทดสอบ: เลือกรูปจากเครื่องแล้วต้องย่อรูปก่อนอัปโหลด ได้ลิงก์กลับมาใส่ช่องรูป และระหว่างอัปโหลดกดบันทึกไม่ได้ (กันเมนูบันทึกไปโดยไม่มีรูป)
  // วิธี: mock resizeImage และ uploadMenuImage (ให้ค้างไว้ก่อน) → อัปโหลดไฟล์ → เช็กว่าปุ่มบันทึกกดไม่ได้และขึ้น "กำลังอัปโหลด..." → ปล่อยผลอัปโหลด → เช็กว่าช่องลิงก์เป็น URL ที่ได้ และเห็นปุ่มเปลี่ยนรูป/เอารูปออก
  it('อัปโหลดรูป: ย่อก่อนส่ง ได้ลิงก์กลับมา และบันทึกไม่ได้ระหว่างอัปโหลด', async () => {
    const user = userEvent.setup()
    const small = new Blob(['small'], { type: 'image/webp' })
    vi.mocked(resizeImage).mockResolvedValue(small)
    let finish!: (url: string) => void
    vi.mocked(uploadMenuImage).mockReturnValue(new Promise((r) => (finish = r)))
    setup()

    const file = new File(['big'], 'menu.jpg', { type: 'image/jpeg' })
    await user.upload(screen.getByLabelText('เลือกรูปจากเครื่อง'), file)
    expect(resizeImage).toHaveBeenCalledWith(file)
    await waitFor(() => expect(uploadMenuImage).toHaveBeenCalledWith(small))
    expect(screen.getByRole('button', { name: 'บันทึก' })).toBeDisabled()
    expect(screen.getByText('กำลังอัปโหลด...')).toBeInTheDocument()

    finish('https://api.example/uploads/a.webp')
    await waitFor(() => expect(screen.getByLabelText('หรือวางลิงก์รูปจากที่อื่น')).toHaveValue('https://api.example/uploads/a.webp'))
    expect(screen.getByRole('button', { name: 'บันทึก' })).toBeEnabled()
    expect(screen.getByText('เปลี่ยนรูป')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'เอารูปออก' })).toBeInTheDocument()
  })

  // ทดสอบ: อัปโหลดรูปไม่สำเร็จ ต้องแสดงเหตุผล และกดบันทึกได้ตามปกติ
  // วิธี: mock uploadMenuImage ให้ throw → อัปโหลดไฟล์ → เช็กข้อความ error และปุ่มบันทึกกดได้
  it('อัปโหลดรูปไม่สำเร็จ → บอกเหตุผล', async () => {
    const user = userEvent.setup()
    vi.mocked(resizeImage).mockResolvedValue(new Blob(['x']))
    vi.mocked(uploadMenuImage).mockRejectedValue(new Error('ไฟล์ใหญ่เกินไป'))
    setup()
    await user.upload(screen.getByLabelText('เลือกรูปจากเครื่อง'), new File(['x'], 'a.png', { type: 'image/png' }))
    expect(await screen.findByText('ไฟล์ใหญ่เกินไป')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'บันทึก' })).toBeEnabled()
  })

  // ทดสอบ: กด "เอารูปออก" ต้องล้างลิงก์รูป
  // วิธี: เปิดฟอร์มแก้เมนูที่มีรูป → กดเอารูปออก → เช็กว่าช่องลิงก์ว่าง
  it('เอารูปออก → ลิงก์ว่าง', async () => {
    const user = userEvent.setup()
    setup({ item: kaprao })
    await user.click(screen.getByRole('button', { name: 'เอารูปออก' }))
    expect(screen.getByLabelText('หรือวางลิงก์รูปจากที่อื่น')).toHaveValue('')
  })
})

describe('MenuFormDialog — แก้ไขเมนู', () => {
  beforeEach(() => vi.clearAllMocks())

  // ทดสอบ: โหมดแก้ไขต้องเติมค่าเดิมของเมนูครบ (ชื่อ ราคา หมวด รูป วัตถุดิบหลัก) และปุ่มบันทึกเปลี่ยนชื่อเป็น "บันทึกข้อมูลเมนู"
  // วิธี: render ด้วยเมนูกะเพรา → เช็กหัวกล่อง ค่าในแต่ละช่อง ปุ่มวัตถุดิบข้าวถูกเลือก และป้ายวัตถุดิบหมดของหมู
  it('เติมค่าเดิมของเมนู', () => {
    const { container } = setup({ item: kaprao })
    expect(screen.getByRole('dialog', { name: 'แก้ไข กะเพรา' })).toBeInTheDocument()
    expect(nameInput()).toHaveValue('กะเพรา')
    expect(priceInput()).toHaveValue(60)
    expect(categorySelect(container)).toHaveValue('c1')
    expect(screen.getByLabelText('หรือวางลิงก์รูปจากที่อื่น')).toHaveValue('https://img.example/kaprao.jpg')
    expect(screen.getByRole('checkbox', { name: 'พร้อมจำหน่าย' })).toBeChecked()
    expect(screen.getByRole('button', { name: 'ข้าว' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /หมู · หมด/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'บันทึกข้อมูลเมนู' })).toBeInTheDocument()
  })

  // ทดสอบ: โหมดแก้ไขบันทึกเฉพาะข้อมูลเมนู (ตัวเลือกบันทึกแยกทันที) จึงส่งรายการตัวเลือกที่พักไว้เป็นว่างเสมอ และใช้ส่วนจัดการตัวเลือกแบบยิง API ทันที
  // วิธี: เปลี่ยนราคาเป็น 65 แล้วเอาวัตถุดิบข้าวออก → กดบันทึกข้อมูลเมนู → เช็ก payload และรายการตัวเลือกว่าง → เช็กว่ามีส่วน "บันทึกทันทีทุกครั้งที่กด"
  it('บันทึกการแก้ไขเมนู', async () => {
    const user = userEvent.setup()
    const { onSubmit } = setup({ item: kaprao })
    await user.clear(priceInput())
    await user.type(priceInput(), '65')
    await user.click(screen.getByRole('button', { name: 'ข้าว' }))
    await user.click(screen.getByRole('button', { name: 'บันทึกข้อมูลเมนู' }))
    expect(onSubmit).toHaveBeenCalledWith(
      { name: 'กะเพรา', price: 65, imageUrl: 'https://img.example/kaprao.jpg', categoryId: 'c1', isAvailable: true, proteinRequired: true, ingredientIds: [] },
      [],
    )
    expect(screen.getByText('บันทึกทันทีทุกครั้งที่กด')).toBeInTheDocument()
  })

  // ทดสอบ: เมนูที่ตั้งไว้ว่าไม่ต้องเลือกเนื้อสัตว์ ต้องเปิดมาไม่ติ๊ก และบันทึกแล้วยังเป็น false
  // วิธี: เปิดแก้ไขเมนูที่ proteinRequired = false → เช็กว่า checkbox ไม่ติ๊ก → กดบันทึก → เช็ก payload proteinRequired: false
  it('เมนูที่ไม่บังคับเลือกเนื้อสัตว์ → checkbox ไม่ติ๊ก และบันทึกค่า false', async () => {
    const user = userEvent.setup()
    const { onSubmit } = setup({ item: { ...kaprao, name: 'ข้าวไข่เจียว', proteinRequired: false } })
    expect(screen.getByRole('checkbox', { name: /ลูกค้าต้องเลือกเนื้อสัตว์ก่อนสั่ง/ })).not.toBeChecked()
    await user.click(screen.getByRole('button', { name: 'บันทึกข้อมูลเมนู' }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ proteinRequired: false }), [])
  })

  // ทดสอบ: ปุ่มลบเมนูมีเฉพาะโหมดแก้ไข และกดแล้วเรียก onDelete (เปิดกล่องยืนยันต่อ)
  // วิธี: render โหมดเพิ่ม เช็กว่าไม่มีปุ่ม → render โหมดแก้ไข กดลบเมนูนี้ → เช็กว่า onDelete ถูกเรียก
  it('ปุ่มลบเมนูมีเฉพาะโหมดแก้ไข', async () => {
    const user = userEvent.setup()
    const addMode = setup()
    expect(screen.queryByRole('button', { name: 'ลบเมนูนี้' })).not.toBeInTheDocument()
    addMode.unmount()

    const { onDelete } = setup({ item: kaprao })
    await user.click(screen.getByRole('button', { name: 'ลบเมนูนี้' }))
    expect(onDelete).toHaveBeenCalled()
    expect(within(screen.getByRole('dialog')).getByText(/เมนูที่เคยถูกสั่งแล้วลบไม่ได้/)).toBeInTheDocument()
  })
})
