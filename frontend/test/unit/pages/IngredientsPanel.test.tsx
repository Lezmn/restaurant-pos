import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useToasts } from '@/components/ui/toast'
import {
  useCreateIngredient,
  useDeleteIngredient,
  useIngredients,
  useUpdateIngredient,
} from '@/features/ingredients/hooks'
import { uploadMenuImage } from '@/features/menu/api'
import { resizeImage } from '@/lib/image-resize'
import type { Ingredient } from '@/types/models'
import { IngredientsPanel } from '@/pages/employee/IngredientsPanel'

vi.mock('@/features/ingredients/hooks', () => ({
  useIngredients: vi.fn(),
  useCreateIngredient: vi.fn(),
  useUpdateIngredient: vi.fn(),
  useDeleteIngredient: vi.fn(),
}))
vi.mock('@/features/menu/api', () => ({ uploadMenuImage: vi.fn() }))
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

const ingredient = (id: string, name: string, extra: Partial<Ingredient> = {}): Ingredient => ({
  id,
  name,
  isAvailable: true,
  menuOptionCount: 0,
  menuItemCount: 0,
  stockQty: null,
  lowStockAt: null,
  imageUrl: null,
  ...extra,
})

const pork = ingredient('i-pork', 'หมู', { menuOptionCount: 3 })
const egg = ingredient('i-egg', 'ไข่', { menuItemCount: 2, stockQty: 4, lowStockAt: 5 })
const shrimp = ingredient('i-shrimp', 'กุ้ง', { isAvailable: false, stockQty: 0, menuItemCount: 1, menuOptionCount: 1 })
const basil = ingredient('i-basil', 'กะเพรา', { stockQty: 10, isAvailable: false, imageUrl: '/basil.jpg' })

let create: { mutate: ReturnType<typeof vi.fn> }
let update: { mutateAsync: ReturnType<typeof vi.fn> }
let remove: { mutate: ReturnType<typeof vi.fn>; reset: ReturnType<typeof vi.fn> }

function setup({
  canEdit = true,
  items = [pork, egg, shrimp, basil] as Ingredient[] | null,
  updateExtra = {} as Record<string, unknown>,
} = {}) {
  create = { mutate: vi.fn(), isPending: false, error: null } as never
  update = { mutateAsync: vi.fn(async () => undefined), isPending: false, error: null, ...updateExtra } as never
  remove = { mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null } as never
  vi.mocked(useIngredients).mockReturnValue({ data: items ?? undefined, isPending: items === null } as never)
  vi.mocked(useCreateIngredient).mockReturnValue(create as never)
  vi.mocked(useUpdateIngredient).mockReturnValue(update as never)
  vi.mocked(useDeleteIngredient).mockReturnValue(remove as never)
  const user = userEvent.setup()
  render(<IngredientsPanel canEdit={canEdit} />)
  return { user }
}

const card = (name: string) => screen.getByText(name, { selector: 'p' }).closest('article') as HTMLElement
const toasts = () => useToasts.getState().toasts

describe('IngredientsPanel — รายการ', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useToasts.setState({ toasts: [] })
  })

  // ทดสอบ: การ์ดบอกว่าใช้ในกี่เมนู/ตัวเลือก และสถานะสต็อก (ไม่นับ/ใกล้หมด/หมด/ปิดอยู่)
  it('บอกการใช้งานและสถานะสต็อกของแต่ละวัตถุดิบ', () => {
    setup()
    expect(card('หมู')).toHaveTextContent('ใช้ใน 3 ตัวเลือก')
    expect(card('หมู')).toHaveTextContent('มีของ· ไม่นับสต็อก')
    expect(card('ไข่')).toHaveTextContent('ใช้ใน 2 เมนู')
    expect(card('ไข่')).toHaveTextContent('เหลือ 4ใกล้หมด')
    expect(card('กุ้ง')).toHaveTextContent('ใช้ใน 1 เมนู · 1 ตัวเลือก')
    expect(card('กุ้ง')).toHaveTextContent('เหลือ 0หมด')
    expect(card('กะเพรา')).toHaveTextContent('ยังไม่ได้ผูกกับเมนูไหน')
    expect(card('กะเพรา')).toHaveTextContent('เหลือ 10ปิดอยู่')
  })

  it('ไม่นับสต็อกและของหมด → "ของหมด · ไม่นับสต็อก"', () => {
    setup({ items: [ingredient('i-x', 'ผักชี', { isAvailable: false })] })
    expect(card('ผักชี')).toHaveTextContent('ของหมด· ไม่นับสต็อก')
  })

  // ทดสอบ: ยังไม่มีวัตถุดิบ ข้อความต่างกันตามสิทธิ์ / กำลังโหลด
  it.each([
    [true, 'ยังไม่มีวัตถุดิบ — เพิ่มอันแรกด้านบนได้เลย'],
    [false, 'ยังไม่มีวัตถุดิบ'],
  ])('ว่าง (canEdit=%s) → "%s"', (canEdit, text) => {
    setup({ canEdit, items: [] })
    expect(screen.getByText(text)).toBeInTheDocument()
  })

  it('กำลังโหลด → "กำลังโหลด..."', () => {
    setup({ items: null })
    expect(screen.getByText('กำลังโหลด...')).toBeInTheDocument()
  })

  // ทดสอบ: ครัว (canEdit=false) ไม่มีฟอร์มเพิ่ม ปุ่มลบ หรือปุ่มเปลี่ยนรูป แต่ตั้งยอด/สลับสวิตช์ได้
  it('ครัว → ไม่มีเพิ่ม/ลบ/เปลี่ยนรูป แต่ตั้งยอดและสลับสวิตช์ได้', () => {
    setup({ canEdit: false })
    expect(screen.queryByLabelText('ชื่อวัตถุดิบ')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ลบ' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/เพิ่มรูป|เปลี่ยนรูป/)).not.toBeInTheDocument()
    expect(within(card('หมู')).getByRole('button', { name: 'ตั้งยอด' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'มีของ หมู' })).toBeInTheDocument()
  })
})

describe('IngredientsPanel — เพิ่ม/ลบ', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useToasts.setState({ toasts: [] })
  })

  // ทดสอบ: ชื่อว่างเพิ่มไม่ได้ / ชื่อมีช่องว่างหัวท้าย ส่งแบบตัดแล้ว ล้างช่องและ toast เมื่อสำเร็จ
  it('ชื่อว่าง → เตือน / กรอกแล้ว → ส่งชื่อที่ตัดช่องว่าง ล้างช่อง และ toast', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'เพิ่มวัตถุดิบ' }))
    expect(screen.getByRole('alert')).toHaveTextContent('กรุณากรอกชื่อวัตถุดิบ')
    expect(create.mutate).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('ชื่อวัตถุดิบ'), '  ไก่  ')
    await user.click(screen.getByRole('button', { name: 'เพิ่มวัตถุดิบ' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(create.mutate).toHaveBeenCalledWith('ไก่', expect.anything())
    act(() => create.mutate.mock.calls[0][1].onSuccess())
    expect(screen.getByLabelText('ชื่อวัตถุดิบ')).toHaveValue('')
    expect(toasts().at(-1)?.message).toBe('เพิ่มวัตถุดิบ ไก่ แล้ว')
  })

  // ทดสอบ: ข้อความยืนยันลบบอกผลตามสิ่งที่ผูกอยู่ (ตัวเลือก / เมนู / ไม่ผูก)
  it.each([
    ['หมู', 'ตัวเลือกที่ยังไม่เคยถูกสั่งจะถูกลบ'],
    ['ไข่', 'เมนูที่ใช้วัตถุดิบนี้จะถูกปลดออก'],
    ['กะเพรา', 'ลบแล้วกู้คืนไม่ได้ ถ้าแค่ของหมด ให้ปิดสวิตช์แทน'],
  ])('ลบ %s → ข้อความยืนยันบอกผล "%s"', async (name, consequence) => {
    const { user } = setup()
    await user.click(within(card(name)).getByRole('button', { name: 'ลบ' }))
    expect(screen.getByRole('dialog', { name: 'ลบวัตถุดิบ' })).toHaveTextContent(consequence)
  })

  it('ลบ → ยืนยัน → ส่ง id และ toast / ย้อนกลับ → ล้าง error ไม่ลบ', async () => {
    const { user } = setup()
    await user.click(within(card('หมู')).getByRole('button', { name: 'ลบ' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ย้อนกลับ' }))
    expect(remove.reset).toHaveBeenCalled()
    expect(remove.mutate).not.toHaveBeenCalled()

    await user.click(within(card('หมู')).getByRole('button', { name: 'ลบ' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ลบวัตถุดิบ' }))
    expect(remove.mutate).toHaveBeenCalledWith('i-pork', expect.anything())
    act(() => remove.mutate.mock.calls[0][1].onSuccess())
    expect(toasts().at(-1)?.message).toBe('ลบวัตถุดิบ หมู แล้ว')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('IngredientsPanel — สวิตช์มีของ/หมด', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useToasts.setState({ toasts: [] })
  })

  // ทดสอบ: ปิดสวิตช์ → ส่ง isAvailable false แล้ว toast พร้อมเลิกทำ ที่เปิดคืนได้
  it('ปิดหมู → ของหมด + toast เลิกทำ → เปิดคืน', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('switch', { name: 'มีของ หมู' }))
    expect(update.mutateAsync).toHaveBeenCalledWith({ id: 'i-pork', isAvailable: false })
    await waitFor(() => expect(toasts().at(-1)?.message).toBe('หมู: ของหมด'))
    await act(async () => toasts().at(-1)?.action?.run())
    expect(update.mutateAsync).toHaveBeenLastCalledWith({ id: 'i-pork', isAvailable: true })
    await waitFor(() => expect(toasts().at(-1)?.message).toBe('หมู: มีของแล้ว'))
  })

  // ทดสอบ: นับสต็อกอยู่และเหลือ 0 → เปิดสวิตช์ไม่ได้ตรง ๆ แต่เปิดฟอร์มตั้งยอดแทน
  it('กุ้งเหลือ 0 → เปิดสวิตช์ = เปิดฟอร์มตั้งยอด ไม่ส่ง isAvailable', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('switch', { name: 'มีของ กุ้ง' }))
    expect(screen.getByRole('dialog', { name: 'ตั้งยอด กุ้ง' })).toBeInTheDocument()
    expect(update.mutateAsync).not.toHaveBeenCalled()
  })

  // ทดสอบ: บันทึกไม่ผ่าน ไม่ขึ้น toast (error โชว์ที่ ErrorNote แทน)
  it('สลับไม่สำเร็จ → ไม่ขึ้น toast และ error โชว์บนหน้า', async () => {
    const { user } = setup({ updateExtra: { error: new Error('บันทึกไม่ได้') } })
    update.mutateAsync.mockRejectedValueOnce(new Error('บันทึกไม่ได้'))
    await user.click(screen.getByRole('switch', { name: 'มีของ หมู' }))
    await waitFor(() => expect(update.mutateAsync).toHaveBeenCalled())
    expect(toasts()).toHaveLength(0)
    expect(screen.getByText('บันทึกไม่ได้')).toBeInTheDocument()
  })

  // ทดสอบ: กำลังบันทึกตัวไหน สวิตช์ตัวนั้นขึ้น busy
  it('กำลังบันทึกหมู → สวิตช์หมู busy ตัวอื่นไม่', () => {
    setup({ updateExtra: { isPending: true, variables: { id: 'i-pork' } } })
    expect(screen.getByRole('switch', { name: 'มีของ หมู' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('switch', { name: 'มีของ ไข่' })).toHaveAttribute('aria-busy', 'false')
  })
})

describe('IngredientsPanel — ตั้งยอดคงเหลือ', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useToasts.setState({ toasts: [] })
  })

  const openStock = async (name: string) => {
    const r = setup()
    await r.user.click(within(card(name)).getByRole('button', { name: 'ตั้งยอด' }))
    return { ...r, dialog: screen.getByRole('dialog', { name: `ตั้งยอด ${name}` }) }
  }

  // ทดสอบ: ยังไม่นับสต็อก ช่องว่าง บันทึกไม่ได้ และไม่มีปุ่มเลิกนับ / ใส่ทศนิยมหรือติดลบไม่ได้
  it('หมู (ไม่นับสต็อก) → ช่องว่าง บันทึกไม่ได้ ไม่มีปุ่มเลิกนับ, ทศนิยม/ติดลบไม่ผ่าน', async () => {
    const { user, dialog } = await openStock('หมู')
    const [stock, warn] = within(dialog).getAllByRole('spinbutton')
    expect(stock).toHaveValue(null)
    expect(warn).toHaveValue(null)
    expect(within(dialog).queryByRole('button', { name: /เลิกนับสต็อก/ })).not.toBeInTheDocument()
    const save = within(dialog).getByRole('button', { name: 'บันทึก' })
    expect(save).toBeDisabled()

    await user.type(stock, '2.5')
    expect(stock).toHaveAttribute('aria-invalid', 'true')
    expect(save).toBeDisabled()
    await user.clear(stock)
    await user.type(stock, '30')
    await user.type(warn, '-1')
    expect(warn).toHaveAttribute('aria-invalid', 'true')
    expect(save).toBeDisabled()
  })

  // ทดสอบ: ตั้งยอด 30 ไม่ใส่จุดเตือน → ส่ง lowStockAt null แล้วปิดกล่อง + toast
  it('ตั้งยอด 30 ไม่เตือน → ส่ง (30, null) ปิดกล่อง และ toast', async () => {
    const { user, dialog } = await openStock('หมู')
    await user.type(within(dialog).getAllByRole('spinbutton')[0], '30')
    await user.click(within(dialog).getByRole('button', { name: 'บันทึก' }))
    expect(update.mutateAsync).toHaveBeenCalledWith({ id: 'i-pork', stockQty: 30, lowStockAt: null })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(toasts().at(-1)?.message).toBe('หมู: ตั้งยอดคงเหลือ 30')
  })

  // ทดสอบ: นับสต็อกอยู่แล้ว ค่าเดิมเติมไว้ / เลิกนับสต็อกได้
  it('ไข่ (นับอยู่) → เติมค่าเดิม และเลิกนับสต็อกได้', async () => {
    const { user, dialog } = await openStock('ไข่')
    const [stock, warn] = within(dialog).getAllByRole('spinbutton')
    expect(stock).toHaveValue(4)
    expect(warn).toHaveValue(5)
    await user.click(within(dialog).getByRole('button', { name: /เลิกนับสต็อก/ }))
    expect(update.mutateAsync).toHaveBeenCalledWith({ id: 'i-egg', stockQty: null, lowStockAt: null })
    await waitFor(() => expect(toasts().at(-1)?.message).toBe('ไข่: เลิกนับสต็อกแล้ว'))
  })

  // ทดสอบ: บันทึกไม่ผ่าน กล่องยังเปิดอยู่ ไม่ขึ้น toast / ยกเลิกปิดกล่อง
  it('บันทึกไม่ผ่าน → กล่องยังเปิด ไม่ toast / ยกเลิก → ปิด', async () => {
    const { user, dialog } = await openStock('ไข่')
    update.mutateAsync.mockRejectedValueOnce(new Error('x'))
    await user.click(within(dialog).getByRole('button', { name: 'บันทึก' }))
    await waitFor(() => expect(update.mutateAsync).toHaveBeenCalled())
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(toasts()).toHaveLength(0)
    await user.click(within(dialog).getByRole('button', { name: 'ยกเลิก' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('IngredientsPanel — รูปวัตถุดิบ', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useToasts.setState({ toasts: [] })
  })

  const file = new File(['x'], 'pork.png', { type: 'image/png' })

  // ทดสอบ: เลือกรูป → ย่อ → อัปโหลด → บันทึก imageUrl แล้ว toast
  it('เลือกรูป → ย่อแล้วอัปโหลด → บันทึก imageUrl และ toast', async () => {
    const resized = new Blob(['small'])
    vi.mocked(resizeImage).mockResolvedValue(resized as never)
    vi.mocked(uploadMenuImage).mockResolvedValue('/uploads/pork.webp')
    const { user } = setup()
    await user.upload(screen.getByLabelText('เพิ่มรูป หมู'), file)
    await waitFor(() =>
      expect(update.mutateAsync).toHaveBeenCalledWith({ id: 'i-pork', imageUrl: '/uploads/pork.webp' }),
    )
    expect(resizeImage).toHaveBeenCalledWith(file)
    expect(uploadMenuImage).toHaveBeenCalledWith(resized)
    await waitFor(() => expect(toasts().at(-1)?.message).toBe('หมู: บันทึกรูปแล้ว'))
  })

  // ทดสอบ: อัปโหลดล้ม → toast ข้อความ error
  it('อัปโหลดไม่สำเร็จ → toast ข้อความ error', async () => {
    vi.mocked(resizeImage).mockRejectedValue(new Error('รูปเสีย'))
    const { user } = setup()
    await user.upload(screen.getByLabelText('เพิ่มรูป หมู'), file)
    await waitFor(() => expect(toasts().at(-1)?.message).toBe('รูปเสีย'))
    expect(update.mutateAsync).not.toHaveBeenCalled()
  })

  // ทดสอบ: มีรูปแล้ว ปุ่มเป็น "เปลี่ยนรูป" และเอารูปออกได้
  it('มีรูปแล้ว → เปลี่ยนรูป / เอารูปออก → ส่ง imageUrl null และ toast', async () => {
    const { user } = setup()
    expect(screen.getByLabelText('เปลี่ยนรูป กะเพรา')).toBeInTheDocument()
    await user.click(within(card('กะเพรา')).getByRole('button', { name: 'เอารูปออก' }))
    expect(update.mutateAsync).toHaveBeenCalledWith({ id: 'i-basil', imageUrl: null })
    await waitFor(() => expect(toasts().at(-1)?.message).toBe('กะเพรา: เอารูปออกแล้ว'))
  })
})
