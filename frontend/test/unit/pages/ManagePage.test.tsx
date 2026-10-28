import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useToasts } from '@/components/ui/toast'
import { useAuth } from '@/features/auth/use-auth'
import {
  useCategories,
  useCreateMenuItem,
  useCreateMenuOption,
  useDeleteMenuItem,
  useMenuItems,
  useSetMenuItemAvailability,
  useUpdateMenuItem,
} from '@/features/menu/hooks'
import { Role } from '@/types/enums'
import type { MenuItem } from '@/types/models'
import { ManagePage } from '@/pages/employee/ManagePage'

// ข้อมูลเมนู/หมวดและการบันทึกมาจาก hook — mock ตรง ๆ แล้วดูว่าหน้าเรียกอะไรด้วยค่าอะไร
vi.mock('@/features/menu/hooks', () => ({
  useMenuItems: vi.fn(),
  useCategories: vi.fn(),
  useSetMenuItemAvailability: vi.fn(),
  useCreateMenuItem: vi.fn(),
  useCreateMenuOption: vi.fn(),
  useUpdateMenuItem: vi.fn(),
  useDeleteMenuItem: vi.fn(),
}))
// ฟอร์มเมนูมีเทสต์ของตัวเอง (MenuFormDialog.test.tsx) — ที่นี่แทนด้วยปุ่มที่ส่งค่าออกมาเหมือนฟอร์มจริง
vi.mock('@/pages/employee/MenuFormDialog', () => ({
  MenuFormDialog: (props: {
    item?: MenuItem
    onSubmit: (input: unknown, pendingOptions: unknown[]) => void
    onCancel: () => void
    onDelete?: () => void
  }) => (
    <div role="dialog" aria-label={props.item ? `แก้ไข ${props.item.name}` : 'เพิ่มเมนู'}>
      <button
        type="button"
        onClick={() =>
          props.onSubmit({ name: 'ต้มยำ', price: 80, categoryId: 'c1' }, [
            { name: 'กุ้ง', price: 20 },
            { name: 'หมู', price: 0 },
          ])
        }
      >
        ส่งฟอร์ม
      </button>
      {props.onDelete && (
        <button type="button" onClick={props.onDelete}>
          ลบจากฟอร์ม
        </button>
      )}
      <button type="button" onClick={props.onCancel}>
        ปิดฟอร์ม
      </button>
    </div>
  ),
}))
vi.mock('@/pages/employee/IngredientsPanel', () => ({
  IngredientsPanel: ({ canEdit }: { canEdit: boolean }) => <p>แผงวัตถุดิบ canEdit={String(canEdit)}</p>,
}))

// ConfirmDialog ใช้ <dialog> — jsdom ยังไม่มี showModal
beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false
  }
})

const menu = (id: string, name: string, categoryId: string, extra: Partial<MenuItem> = {}): MenuItem => ({
  id,
  categoryId,
  name,
  price: 50,
  imageUrl: null,
  isAvailable: true,
  proteinRequired: false,
  optionGroups: [],
  ingredients: [],
  ingredientsOutOfStock: [],
  ...extra,
})

const items = [
  menu('m1', 'ข้าวผัด', 'c1'),
  menu('m2', 'ข้าวไข่เจียว', 'c1', { ingredientsOutOfStock: ['ไข่'] }),
  menu('m3', 'ผัดไทย', 'c2', { isAvailable: false }),
  menu('m4', 'ชาไทย', 'c3'),
]
const categories = [
  { id: 'c1', name: 'อาหารจานเดียว' },
  { id: 'c2', name: 'เมนูเส้น' },
  { id: 'c3', name: 'เครื่องดื่ม' },
  { id: 'c4', name: 'ของหวาน' },
]

let setAvailability: { mutateAsync: ReturnType<typeof vi.fn>; error: null }
let createItem: { mutate: ReturnType<typeof vi.fn>; isPending: boolean; error: null }
let createOption: { mutateAsync: ReturnType<typeof vi.fn> }
let updateItem: { mutate: ReturnType<typeof vi.fn>; isPending: boolean; error: null }
let deleteItem: { mutate: ReturnType<typeof vi.fn>; reset: ReturnType<typeof vi.fn>; isPending: boolean; error: null }

function setup({
  role = Role.ADMIN,
  menuItems = items,
  query = {},
}: { role?: Role; menuItems?: MenuItem[]; query?: Record<string, unknown> } = {}) {
  useAuth.setState({ user: { id: 'u', email: 'e', name: 'n', role } })
  vi.mocked(useMenuItems).mockReturnValue({
    data: menuItems,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...query,
  } as never)
  vi.mocked(useCategories).mockReturnValue({ data: categories } as never)
  setAvailability = { mutateAsync: vi.fn().mockResolvedValue({}), error: null }
  createItem = { mutate: vi.fn(), isPending: false, error: null }
  createOption = { mutateAsync: vi.fn().mockResolvedValue({}) }
  updateItem = { mutate: vi.fn(), isPending: false, error: null }
  deleteItem = { mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null }
  vi.mocked(useSetMenuItemAvailability).mockReturnValue(setAvailability as never)
  vi.mocked(useCreateMenuItem).mockReturnValue(createItem as never)
  vi.mocked(useCreateMenuOption).mockReturnValue(createOption as never)
  vi.mocked(useUpdateMenuItem).mockReturnValue(updateItem as never)
  vi.mocked(useDeleteMenuItem).mockReturnValue(deleteItem as never)
  return render(<ManagePage />)
}

/** ชื่อเมนูบนการ์ดที่เห็นอยู่ ตามลำดับ */
const visibleNames = () => screen.queryAllByRole('heading', { level: 2 }).map((h) => h.textContent)
const chip = (name: RegExp) => screen.getByRole('button', { name })
const switchOf = (name: string) => screen.getByRole('switch', { name: `เปิดขาย ${name}` })
const lastToast = () => useToasts.getState().toasts.at(-1)
/** ปล่อยให้ promise ที่ค้าง (mutateAsync) ทำงานจนจบ */
const flush = () => act(async () => {})

beforeEach(() => {
  vi.clearAllMocks()
  useToasts.setState({ toasts: [] })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ManagePage — ดูและกรองเมนู', () => {
  // ทดสอบ: หัวหน้าบอกจำนวนเมนูทั้งหมดและที่ปิดขายอยู่ (นับทั้งปิดขายเองและวัตถุดิบหลักหมด) และชิปแต่ละหมวดบอกจำนวนของหมวดนั้น
  // วิธี: render เมนู 4 รายการ (ปิดขายเอง 1, วัตถุดิบหมด 1) → เช็กข้อความหัวหน้า และตัวเลขท้ายชิปทั้งหมด/แต่ละหมวด/เฉพาะที่ปิดขาย
  it('นับจำนวนเมนู ที่ปิดขาย และจำนวนต่อหมวด', () => {
    setup()
    expect(screen.getByText(/4 เมนู/)).toBeInTheDocument()
    expect(screen.getByText('ปิดขายอยู่ 2')).toBeInTheDocument()
    expect(chip(/^ทั้งหมด \(4\)/)).toBeInTheDocument()
    expect(chip(/^อาหารจานเดียว \(2\)/)).toBeInTheDocument()
    expect(chip(/^ของหวาน \(0\)/)).toBeInTheDocument()
    expect(chip(/^เฉพาะที่ปิดขาย \(2\)/)).toBeInTheDocument()
  })

  // ทดสอบ: การ์ดบอกเหตุผลที่สั่งไม่ได้ให้ชัด — ปิดขายเองขึ้น "ปิดขาย" ส่วนวัตถุดิบหลักหมดขึ้นชื่อวัตถุดิบ
  // วิธี: render → หาการ์ดของผัดไทย (ปิดขายเอง) และข้าวไข่เจียว (ไข่หมด) → เช็กป้ายบนการ์ด
  it('ป้ายบนการ์ดแยก "ปิดขาย" กับ "วัตถุดิบหมด"', () => {
    setup()
    const card = (name: string) => screen.getByRole('heading', { name }).closest('article') as HTMLElement
    expect(within(card('ผัดไทย')).getAllByText('ปิดขาย').length).toBeGreaterThan(0)
    expect(within(card('ข้าวไข่เจียว')).getAllByText('ไข่ หมด').length).toBeGreaterThan(0)
    expect(within(card('ข้าวผัด')).getByText('เปิดขาย')).toBeInTheDocument()
  })

  // ทดสอบ: ช่องค้นหากรองตามชื่อเมนู (ไม่สนช่องว่างหัวท้าย) และถ้าไม่เจอบอก "ไม่พบเมนูที่ค้นหา"
  // วิธี: พิมพ์ "  ข้าว " → เช็กว่าเหลือแค่เมนูที่มีคำว่าข้าว → พิมพ์คำที่ไม่มี → เช็กข้อความไม่พบ
  it('ค้นหาตามชื่อ', () => {
    setup()
    const search = screen.getByRole('searchbox')
    fireEvent.change(search, { target: { value: '  ข้าว ' } })
    expect(visibleNames()).toEqual(['ข้าวผัด', 'ข้าวไข่เจียว'])
    fireEvent.change(search, { target: { value: 'พิซซ่า' } })
    expect(visibleNames()).toEqual([])
    expect(screen.getByText('ไม่พบเมนูที่ค้นหา')).toBeInTheDocument()
  })

  // ทดสอบ: กดชิปหมวดแล้วเหลือแค่เมนูหมวดนั้น ใช้ร่วมกับช่องค้นหาได้ และกด "ทั้งหมด" กลับมาครบ
  // วิธี: กดชิปอาหารจานเดียว → เช็กรายชื่อ → พิมพ์ค้นหา "ผัด" → เหลือข้าวผัด → กดทั้งหมด + ล้างค้นหา → ครบ 4
  it('กรองตามหมวด ร่วมกับค้นหา', () => {
    setup()
    fireEvent.click(chip(/^อาหารจานเดียว/))
    expect(chip(/^อาหารจานเดียว/)).toHaveAttribute('aria-pressed', 'true')
    expect(visibleNames()).toEqual(['ข้าวผัด', 'ข้าวไข่เจียว'])
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ผัด' } })
    expect(visibleNames()).toEqual(['ข้าวผัด'])
    fireEvent.click(chip(/^ทั้งหมด/))
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } })
    expect(visibleNames()).toHaveLength(4)
  })

  // ทดสอบ: หมวดที่ยังไม่มีเมนู — ADMIN ได้คำแนะนำให้กด "เพิ่มเมนู" ส่วนครัวได้แค่บอกว่าไม่มี (ไม่ชี้ไปปุ่มที่ตัวเองไม่มี)
  // วิธี: render เป็น ADMIN แล้วกดชิปของหวาน → เช็กข้อความ → render ใหม่เป็น KITCHEN กดชิปเดิม → เช็กข้อความสั้น
  it('หมวดว่าง: ข้อความต่างกันตามสิทธิ์', () => {
    const { unmount } = setup({ role: Role.ADMIN })
    fireEvent.click(chip(/^ของหวาน/))
    expect(screen.getByText('หมวดนี้ยังไม่มีเมนู กด "เพิ่มเมนู" แล้วเลือกหมวดนี้ได้เลย')).toBeInTheDocument()
    unmount()
    setup({ role: Role.KITCHEN })
    fireEvent.click(chip(/^ของหวาน/))
    expect(screen.getByText('หมวดนี้ยังไม่มีเมนู')).toBeInTheDocument()
  })

  // ทดสอบ: "เฉพาะที่ปิดขาย" เหลือทั้งเมนูที่ปิดขายเองและที่วัตถุดิบหมด และถ้าไม่มีเลยบอกว่าทุกเมนูพร้อมขาย
  // วิธี: กดชิปเฉพาะที่ปิดขาย → เช็กรายชื่อ → render ใหม่ด้วยเมนูที่เปิดขายหมด กดชิปเดิม → เช็กข้อความ
  it('กรองเฉพาะที่ปิดขาย', () => {
    const { unmount } = setup()
    fireEvent.click(chip(/^เฉพาะที่ปิดขาย/))
    expect(visibleNames()).toEqual(['ข้าวไข่เจียว', 'ผัดไทย'])
    unmount()
    setup({ menuItems: [menu('m1', 'ข้าวผัด', 'c1')] })
    fireEvent.click(chip(/^เฉพาะที่ปิดขาย/))
    expect(screen.getByText('ไม่มีเมนูที่ปิดขายอยู่ ทุกเมนูพร้อมขาย')).toBeInTheDocument()
  })

  // ทดสอบ: โหลดเมนูไม่สำเร็จ ต้องบอกให้ลองใหม่ ไม่ขึ้นข้อความ "ไม่พบเมนู" ให้เข้าใจผิดว่าร้านไม่มีเมนู
  // วิธี: useMenuItems คืน isError และไม่มีข้อมูล → เช็กว่ามีปุ่มลองใหม่ (กดแล้วเรียก refetch) และไม่มีข้อความไม่พบเมนู
  it('โหลดเมนูไม่สำเร็จ → ปุ่มลองใหม่', () => {
    const refetch = vi.fn()
    setup({ query: { data: undefined, isError: true, error: new Error('down'), refetch } })
    fireEvent.click(screen.getByRole('button', { name: /ลองใหม่/ }))
    expect(refetch).toHaveBeenCalled()
    expect(screen.queryByText('ไม่พบเมนูที่ค้นหา')).not.toBeInTheDocument()
  })
})

describe('ManagePage — สวิตช์เปิด/ปิดขาย', () => {
  // ทดสอบ: กดสวิตช์แล้วเปลี่ยนให้เห็นทันที แต่รอให้หยุดกด 0.6 วิ ก่อนค่อยบันทึกครั้งเดียว จากนั้นขึ้นข้อความพร้อม "เลิกทำ"
  // วิธี: ใช้เวลาจำลอง → กดสวิตช์ข้าวผัด → สวิตช์เป็นปิดทันที แต่ยังไม่ยิง API → เดินเวลา 600ms → ยิงครั้งเดียวด้วย isAvailable false → เช็ก toast
  it('เปลี่ยนทันที บันทึกหลังหยุดกด และขึ้นข้อความพร้อมเลิกทำ', async () => {
    vi.useFakeTimers()
    setup()
    fireEvent.click(switchOf('ข้าวผัด'))
    expect(switchOf('ข้าวผัด')).toHaveAttribute('aria-checked', 'false')
    act(() => vi.advanceTimersByTime(599))
    expect(setAvailability.mutateAsync).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    await flush()
    expect(setAvailability.mutateAsync).toHaveBeenCalledTimes(1)
    expect(setAvailability.mutateAsync).toHaveBeenCalledWith({ id: 'm1', isAvailable: false })
    expect(lastToast()).toMatchObject({ message: 'ปิดขาย ข้าวผัด แล้ว', action: { label: 'เลิกทำ' } })
  })

  // ทดสอบ: กดรัว ๆ แล้วจบที่ค่าเดิม ต้องไม่ยิง API เลย (กันกดถี่จนโดน rate limit)
  // วิธี: ใช้เวลาจำลอง → กดสวิตช์ 2 ครั้งติดกัน → เดินเวลา 600ms → เช็กว่าไม่เรียก API และสวิตช์กลับเป็นเปิด
  it('กดสองครั้งกลับที่เดิม → ไม่ยิง API', async () => {
    vi.useFakeTimers()
    setup()
    fireEvent.click(switchOf('ข้าวผัด'))
    fireEvent.click(switchOf('ข้าวผัด'))
    act(() => vi.advanceTimersByTime(600))
    await flush()
    expect(setAvailability.mutateAsync).not.toHaveBeenCalled()
    expect(switchOf('ข้าวผัด')).toHaveAttribute('aria-checked', 'true')
  })

  // ทดสอบ: กดหลายครั้งติดกันแล้วจบที่ค่าใหม่ ต้องบันทึกครั้งเดียวด้วยค่าสุดท้าย
  // วิธี: ใช้เวลาจำลอง → กดสวิตช์ผัดไทย (ปิดอยู่) 3 ครั้งห่างกันไม่ถึง 0.6 วิ → เดินเวลา → เช็กว่ายิงครั้งเดียวด้วย isAvailable true
  it('กดหลายครั้ง → บันทึกครั้งเดียวด้วยค่าสุดท้าย', async () => {
    vi.useFakeTimers()
    setup()
    for (let i = 0; i < 3; i++) {
      fireEvent.click(switchOf('ผัดไทย'))
      act(() => vi.advanceTimersByTime(300))
    }
    act(() => vi.advanceTimersByTime(600))
    await flush()
    expect(setAvailability.mutateAsync).toHaveBeenCalledTimes(1)
    expect(setAvailability.mutateAsync).toHaveBeenCalledWith({ id: 'm3', isAvailable: true })
  })

  // ทดสอบ: กด "เลิกทำ" ในข้อความ ต้องเปลี่ยนเมนูนั้นกลับเป็นค่าเดิม
  // วิธี: ปิดขายข้าวผัดจนบันทึกเสร็จ → เรียก action ของ toast → เช็กว่ายิง API ครั้งที่สองด้วย isAvailable true
  it('เลิกทำ → เปลี่ยนกลับ', async () => {
    vi.useFakeTimers()
    setup()
    fireEvent.click(switchOf('ข้าวผัด'))
    act(() => vi.advanceTimersByTime(600))
    await flush()
    await act(async () => lastToast()!.action!.run())
    expect(setAvailability.mutateAsync).toHaveBeenLastCalledWith({ id: 'm1', isAvailable: true })
    expect(lastToast()?.message).toBe('เปิดขาย ข้าวผัด แล้ว')
  })

  // ทดสอบ: ออกจากหน้าระหว่างรอบันทึก ต้องทิ้งค่าที่ยังไม่บันทึก ไม่ยิง API หลังหน้าปิดไปแล้ว
  // วิธี: ใช้เวลาจำลอง → กดสวิตช์ → unmount ก่อนครบ 0.6 วิ → เดินเวลา → เช็กว่าไม่เรียก API
  it('ออกจากหน้าก่อนครบเวลา → ไม่บันทึก', async () => {
    vi.useFakeTimers()
    const { unmount } = setup()
    fireEvent.click(switchOf('ข้าวผัด'))
    unmount()
    act(() => vi.advanceTimersByTime(1000))
    await flush()
    expect(setAvailability.mutateAsync).not.toHaveBeenCalled()
  })
})

describe('ManagePage — เลือกหลายเมนู', () => {
  // ทดสอบ: เลือกหลายเมนูแล้วกดปิดขาย ต้องบันทึกทีละเมนูตามลำดับ ขึ้นข้อความรวม แล้วออกจากโหมดเลือก
  // วิธี: กด "เลือกหลายเมนู" → เลือกข้าวผัดกับชาไทย → แถบล่างบอก "เลือกแล้ว 2 เมนู" → กดปิดขาย → เช็กการเรียก API 2 ครั้ง, toast และแถบหายไป
  it('ปิดขายหลายเมนูพร้อมกัน', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'เลือกหลายเมนู' }))
    fireEvent.click(screen.getByRole('button', { name: 'เลือก ข้าวผัด' }))
    fireEvent.click(screen.getByRole('button', { name: 'เลือก ชาไทย' }))
    const bar = screen.getByRole('region', { name: 'จัดการเมนูที่เลือก' })
    expect(within(bar).getByText('เลือกแล้ว 2 เมนู')).toBeInTheDocument()
    fireEvent.click(within(bar).getByRole('button', { name: 'ปิดขาย' }))
    await flush()
    expect(setAvailability.mutateAsync.mock.calls).toEqual([
      [{ id: 'm1', isAvailable: false }],
      [{ id: 'm4', isAvailable: false }],
    ])
    expect(lastToast()?.message).toBe('ปิดขาย 2 เมนู แล้ว')
    expect(screen.queryByRole('region', { name: 'จัดการเมนูที่เลือก' })).not.toBeInTheDocument()
  })

  // ทดสอบ: บันทึกหลายเมนูแล้วพังกลางทาง "เลิกทำ" ต้องย้อนเฉพาะเมนูที่เปลี่ยนสำเร็จจริง
  // วิธี: ให้ API สำเร็จตัวแรกแล้ว error ตัวที่สอง → ปิดขาย 2 เมนู → toast บอกชื่อเมนูแรก → กดเลิกทำ → เช็กว่าเรียกกลับแค่เมนูแรก
  it('พังกลางทาง → เลิกทำย้อนเฉพาะตัวที่สำเร็จ', async () => {
    setup()
    setAvailability.mutateAsync.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('429'))
    fireEvent.click(screen.getByRole('button', { name: 'เลือกหลายเมนู' }))
    fireEvent.click(screen.getByRole('button', { name: 'เลือก ข้าวผัด' }))
    fireEvent.click(screen.getByRole('button', { name: 'เลือก ชาไทย' }))
    fireEvent.click(screen.getByRole('button', { name: 'ปิดขาย' }))
    await flush()
    expect(lastToast()?.message).toBe('ปิดขาย ข้าวผัด แล้ว')
    setAvailability.mutateAsync.mockClear()
    await act(async () => lastToast()!.action!.run())
    expect(setAvailability.mutateAsync.mock.calls).toEqual([[{ id: 'm1', isAvailable: true }]])
  })

  // ทดสอบ: "เลือกทั้งหมดที่เห็น" เลือกเฉพาะเมนูที่ผ่านตัวกรองอยู่ ไม่ใช่ทุกเมนูในร้าน
  // วิธี: กรองเฉพาะที่ปิดขาย → เข้าโหมดเลือก → กดเลือกทั้งหมดที่เห็น (2) → กดเปิดขาย → เช็กว่าเรียก API แค่ 2 เมนูนั้น
  it('เลือกทั้งหมดที่เห็น ตามตัวกรอง', async () => {
    setup()
    fireEvent.click(chip(/^เฉพาะที่ปิดขาย/))
    fireEvent.click(screen.getByRole('button', { name: 'เลือกหลายเมนู' }))
    fireEvent.click(screen.getByRole('button', { name: 'เลือกทั้งหมดที่เห็น (2)' }))
    fireEvent.click(screen.getByRole('button', { name: 'เปิดขาย' }))
    await flush()
    expect(setAvailability.mutateAsync.mock.calls.map(([v]) => v.id)).toEqual(['m2', 'm3'])
  })

  // ทดสอบ: ระหว่างเลือกหลายเมนู ปุ่มเปิด/ปิดขายกดไม่ได้จนกว่าจะเลือก, ซ่อนสวิตช์/แก้ไข/เพิ่มเมนูกันกดผิด และกด "เลิกเลือก" กลับโหมดปกติ
  // วิธี: เข้าโหมดเลือก → เช็กปุ่มในแถบล่าง disabled, ไม่มี switch / ปุ่มแก้ไข / เพิ่มเมนู → กดเลิกเลือก → สวิตช์กลับมา
  it('โหมดเลือก: ปุ่มกดไม่ได้ก่อนเลือก และซ่อนปุ่มอื่น', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'เลือกหลายเมนู' }))
    const bar = screen.getByRole('region', { name: 'จัดการเมนูที่เลือก' })
    expect(within(bar).getByRole('button', { name: 'เปิดขาย' })).toBeDisabled()
    expect(within(bar).getByRole('button', { name: 'ปิดขาย' })).toBeDisabled()
    expect(screen.queryAllByRole('switch')).toEqual([])
    expect(screen.queryByRole('button', { name: 'แก้ไข' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'เพิ่มเมนู' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'เลิกเลือก' }))
    expect(screen.getAllByRole('switch')).toHaveLength(4)
  })
})

describe('ManagePage — สิทธิ์และการแก้ไขเมนู', () => {
  // ทดสอบ: ครัว (KITCHEN) เปิด/ปิดขายได้ แต่ไม่เห็นปุ่มเพิ่ม/แก้ไขเมนู (กดไปก็โดน 403) ส่วน ADMIN เห็นครบ
  // วิธี: render เป็น KITCHEN → มีสวิตช์ 4 อัน ไม่มีปุ่มเพิ่มเมนู/แก้ไข → render ใหม่เป็น ADMIN → มีปุ่มเพิ่มเมนูและแก้ไขทุกการ์ด
  it('KITCHEN ไม่เห็นปุ่มเพิ่ม/แก้ไข ADMIN เห็น', () => {
    const { unmount } = setup({ role: Role.KITCHEN })
    expect(screen.getAllByRole('switch')).toHaveLength(4)
    expect(screen.queryByRole('button', { name: 'เพิ่มเมนู' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'แก้ไข' })).not.toBeInTheDocument()
    unmount()
    setup({ role: Role.ADMIN })
    expect(screen.getByRole('button', { name: 'เพิ่มเมนู' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'แก้ไข' })).toHaveLength(4)
  })

  // ทดสอบ: เพิ่มเมนูใหม่ที่มีตัวเลือก ต้องสร้างเมนูก่อน แล้วค่อยสร้างตัวเลือกทีละตัวตามลำดับที่ใส่ (ต้องใช้ id เมนู) จากนั้นปิดฟอร์มและขึ้นข้อความ
  // วิธี: กดเพิ่มเมนู → ฟอร์ม (จำลอง) ส่งเมนู + ตัวเลือก 2 ตัว → เรียก onSuccess ของ createItem ด้วยเมนูที่สร้างแล้ว → เช็ก createOption ตามลำดับ, toast และฟอร์มปิด
  it('เพิ่มเมนูพร้อมตัวเลือก', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'เพิ่มเมนู' }))
    fireEvent.click(screen.getByRole('button', { name: 'ส่งฟอร์ม' }))
    const [input, options] = createItem.mutate.mock.calls[0]
    expect(input).toEqual({ name: 'ต้มยำ', price: 80, categoryId: 'c1' })
    await act(async () => options.onSuccess({ id: 'new1', name: 'ต้มยำ' }))
    expect(createOption.mutateAsync.mock.calls).toEqual([
      [{ menuItemId: 'new1', input: { name: 'กุ้ง', price: 20 } }],
      [{ menuItemId: 'new1', input: { name: 'หมู', price: 0 } }],
    ])
    expect(lastToast()?.message).toBe('เพิ่มเมนู ต้มยำ แล้ว')
    expect(screen.queryByRole('dialog', { name: 'เพิ่มเมนู' })).not.toBeInTheDocument()
  })

  // ทดสอบ: แก้ไขเมนูแล้วบันทึก ต้องส่ง id เมนูที่แก้ไปพร้อมค่าใหม่ แล้วปิดฟอร์มและขึ้นข้อความ
  // วิธี: กดแก้ไขบนการ์ดข้าวผัด → ฟอร์มส่งค่า → เช็ก updateItem.mutate ได้ id m1 → เรียก onSuccess → เช็ก toast และฟอร์มปิด
  it('แก้ไขเมนู', () => {
    setup()
    const card = screen.getByRole('heading', { name: 'ข้าวผัด' }).closest('article') as HTMLElement
    fireEvent.click(within(card).getByRole('button', { name: 'แก้ไข' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'แก้ไข ข้าวผัด' })).getByRole('button', { name: 'ส่งฟอร์ม' }))
    const [vars, options] = updateItem.mutate.mock.calls[0]
    expect(vars).toEqual({ id: 'm1', input: { name: 'ต้มยำ', price: 80, categoryId: 'c1' } })
    act(() => options.onSuccess())
    expect(lastToast()?.message).toBe('บันทึก ต้มยำ แล้ว')
    expect(screen.queryByRole('dialog', { name: 'แก้ไข ข้าวผัด' })).not.toBeInTheDocument()
  })

  // ทดสอบ: ลบเมนูต้องผ่านกล่องยืนยันก่อน ยืนยันแล้วลบเมนูนั้นและขึ้นข้อความ ส่วนกดยกเลิกต้องไม่ลบและล้าง error เดิม
  // วิธี: แก้ไขข้าวผัด → กดลบในฟอร์ม → กล่องยืนยันขึ้น → กดยกเลิก (reset ถูกเรียก, ไม่ลบ) → เปิดใหม่แล้วกดลบเมนู → เช็ก deleteItem.mutate('m1') และ toast หลัง onSuccess
  it('ลบเมนูต้องยืนยันก่อน', () => {
    setup()
    const openDelete = () => {
      const card = screen.getByRole('heading', { name: 'ข้าวผัด' }).closest('article') as HTMLElement
      fireEvent.click(within(card).getByRole('button', { name: 'แก้ไข' }))
      fireEvent.click(screen.getByRole('button', { name: 'ลบจากฟอร์ม' }))
    }
    openDelete()
    fireEvent.click(screen.getByRole('button', { name: /ยกเลิก|กลับ/ }))
    expect(deleteItem.reset).toHaveBeenCalled()
    expect(deleteItem.mutate).not.toHaveBeenCalled()

    openDelete()
    fireEvent.click(screen.getByRole('button', { name: 'ลบเมนู' }))
    const [id, options] = deleteItem.mutate.mock.calls[0]
    expect(id).toBe('m1')
    act(() => options.onSuccess())
    expect(lastToast()?.message).toBe('ลบ ข้าวผัด แล้ว')
  })

  // ทดสอบ: แท็บวัตถุดิบแสดงแผงวัตถุดิบพร้อมสิทธิ์แก้ไขตาม role ซ่อนช่องค้นหาเมนู และสลับแท็บแล้วออกจากโหมดเลือกหลายเมนู
  // วิธี: เข้าโหมดเลือก → กดแท็บวัตถุดิบ → เช็กแผงได้ canEdit=true และไม่มีช่องค้นหา → กลับแท็บเมนู → แถบเลือกหายไป
  it('แท็บวัตถุดิบ', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'เลือกหลายเมนู' }))
    fireEvent.click(screen.getByRole('button', { name: 'วัตถุดิบ' }))
    expect(screen.getByText('แผงวัตถุดิบ canEdit=true')).toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'เมนู' }))
    expect(screen.queryByRole('region', { name: 'จัดการเมนูที่เลือก' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('switch')).toHaveLength(4)
  })
})
