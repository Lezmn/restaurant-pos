import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useToasts } from '@/components/ui/toast'
import { useAllTables, useCreateTable, useDeleteTable, useUpdateTable } from '@/features/tables/hooks'
import { TableStatus } from '@/types/enums'
import type { RestaurantTable } from '@/types/models'
import { ManageTablesDialog } from '@/pages/employee/ManageTablesDialog'

vi.mock('@/features/tables/hooks', () => ({
  useAllTables: vi.fn(),
  useCreateTable: vi.fn(),
  useUpdateTable: vi.fn(),
  useDeleteTable: vi.fn(),
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

const table = (n: number, extra: Partial<RestaurantTable> = {}): RestaurantTable => ({
  id: `t${n}`,
  name: String(n),
  number: n,
  status: TableStatus.AVAILABLE,
  isActive: true,
  ...extra,
})

const t1 = table(1)
const t2 = table(2, { status: TableStatus.OCCUPIED })
const t7 = table(7, { isActive: false })

type Mut = { mutate: ReturnType<typeof vi.fn>; reset: ReturnType<typeof vi.fn> }
let create: Mut
let update: Mut
let remove: Mut
let onClose: ReturnType<typeof vi.fn<() => void>>

const mutation = (extra: Record<string, unknown> = {}) => ({
  mutate: vi.fn(),
  reset: vi.fn(),
  isPending: false,
  error: null,
  ...extra,
})

function setup({
  tables = [t1, t2, t7] as RestaurantTable[] | null,
  createExtra = {} as Record<string, unknown>,
  updateExtra = {} as Record<string, unknown>,
} = {}) {
  create = mutation(createExtra)
  update = mutation(updateExtra)
  remove = mutation()
  onClose = vi.fn<() => void>()
  vi.mocked(useAllTables).mockReturnValue({ data: tables ?? undefined, isPending: tables === null } as never)
  vi.mocked(useCreateTable).mockReturnValue(create as never)
  vi.mocked(useUpdateTable).mockReturnValue(update as never)
  vi.mocked(useDeleteTable).mockReturnValue(remove as never)
  const user = userEvent.setup()
  render(<ManageTablesDialog onClose={onClose} />)
  return { user, dialog: screen.getByRole('dialog', { name: 'จัดการโต๊ะ' }) }
}

const row = (name: string) => screen.getByText(`โต๊ะ ${name}`, { selector: 'p' }).closest('li') as HTMLElement
const lastToast = () => useToasts.getState().toasts.at(-1)?.message
const newNumber = () => screen.getByLabelText(/^เลขโต๊ะ/, { selector: '#new-table-number' })

describe('ManageTablesDialog — เพิ่มโต๊ะ', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useToasts.setState({ toasts: [] })
  })

  // ทดสอบ: เลขถัดไป = มากสุด + 1 (นับโต๊ะที่ปิดใช้งานด้วย), สรุปจำนวนใช้งาน/ปิด
  it('เลขเริ่มต้น = มากสุด + 1 และสรุปจำนวนใช้งาน/ปิดใช้งาน', () => {
    const { dialog } = setup()
    expect(newNumber()).toHaveValue(8)
    expect(dialog).toHaveTextContent('ใช้งาน 2 โต๊ะ · ปิดใช้งาน 1 โต๊ะ')
  })

  it('ยังไม่มีโต๊ะ → เริ่มที่ 1 และไม่บอกจำนวนปิดใช้งาน', () => {
    const { dialog } = setup({ tables: [] })
    expect(newNumber()).toHaveValue(1)
    expect(dialog).not.toHaveTextContent('ปิดใช้งาน 0')
  })

  it('กำลังโหลด → "กำลังโหลด..."', () => {
    const { dialog } = setup({ tables: null })
    expect(dialog).toHaveTextContent('กำลังโหลด...')
  })

  // ทดสอบ: เลขว่าง/ศูนย์/ทศนิยม → เตือนและกดเพิ่มไม่ได้
  it.each([
    ['0', 'เลขโต๊ะต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป'],
    ['2.5', 'เลขโต๊ะต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป'],
  ])('เลข %s → "%s" และกดเพิ่มไม่ได้', async (value, message) => {
    const { dialog } = setup()
    // ลบจนว่างแล้วช่องจะเด้งกลับเป็นเลขแนะนำ — จำลองการเลือกทั้งหมดแล้วพิมพ์ทับ
    fireEvent.change(newNumber(), { target: { value } })
    expect(dialog).toHaveTextContent(message)
    expect(within(dialog).getByRole('button', { name: 'เพิ่มโต๊ะ' })).toBeDisabled()
  })

  // ทดสอบ: เพิ่มด้วยเลขที่แนะนำ → ส่ง number แล้ว toast
  it('กดเพิ่มด้วยเลขที่แนะนำ → ส่ง { number: 8 } และ toast', async () => {
    const { user, dialog } = setup()
    await user.click(within(dialog).getByRole('button', { name: 'เพิ่มโต๊ะ' }))
    expect(create.mutate).toHaveBeenCalledWith({ number: 8 }, expect.anything())
    act(() => create.mutate.mock.calls[0][1].onSuccess({ name: '8' }))
    expect(lastToast()).toBe('เพิ่มโต๊ะ 8 แล้ว — เปิดโต๊ะสร้าง QR ได้เลย')
  })

  // ทดสอบ: พิมพ์เลขเองแล้ว Enter → ส่งเลขนั้น และหลังสำเร็จกลับไปใช้เลขแนะนำ
  it('พิมพ์เลข 12 แล้ว Enter → ส่ง 12 แล้วล้างกลับเป็นเลขแนะนำ', async () => {
    const { user } = setup()
    fireEvent.change(newNumber(), { target: { value: '12' } })
    await user.type(newNumber(), '{Enter}')
    expect(create.mutate).toHaveBeenCalledWith({ number: 12 }, expect.anything())
    act(() => create.mutate.mock.calls[0][1].onSuccess({ name: '12' }))
    expect(newNumber()).toHaveValue(8)
  })

  // ทดสอบ: กำลังเพิ่ม → ปุ่มกดไม่ได้ และ error โชว์
  it('กำลังเพิ่ม → "กำลังเพิ่ม..." และ error โชว์', () => {
    const { dialog } = setup({ createExtra: { isPending: true, error: new Error('เลขโต๊ะซ้ำ') } })
    expect(within(dialog).getByRole('button', { name: 'กำลังเพิ่ม...' })).toBeDisabled()
    expect(dialog).toHaveTextContent('เลขโต๊ะซ้ำ')
  })
})

describe('ManageTablesDialog — แต่ละโต๊ะ', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useToasts.setState({ toasts: [] })
  })

  // ทดสอบ: ป้ายสถานะ, โต๊ะที่มีลูกค้าปิดใช้งาน/ลบไม่ได้
  it('ป้ายมีลูกค้า/ปิดใช้งาน และโต๊ะที่มีลูกค้าปิด/ลบไม่ได้', () => {
    setup()
    expect(row('2')).toHaveTextContent('มีลูกค้า')
    expect(within(row('2')).getByRole('button', { name: 'ปิดใช้งาน' })).toBeDisabled()
    expect(within(row('2')).getByRole('button', { name: 'ลบโต๊ะ 2' })).toBeDisabled()
    expect(row('7')).toHaveTextContent('ปิดใช้งาน')
    expect(within(row('7')).getByRole('button', { name: 'เปิดใช้งาน' })).toBeEnabled()
  })

  // ทดสอบ: ปิด/เปิดใช้งาน → ส่ง isActive กลับค่า และ toast ตามทิศทาง
  it.each([
    ['1', 'ปิดใช้งาน', false, 'ปิดใช้งานโต๊ะ 1 แล้ว — ไม่โผล่ในหน้าพนักงาน'],
    ['7', 'เปิดใช้งาน', true, 'เปิดใช้งานโต๊ะ 7 แล้ว'],
  ])('โต๊ะ %s กด %s → isActive=%s และ toast', async (name, label, isActive, message) => {
    const { user } = setup()
    await user.click(within(row(name)).getByRole('button', { name: label }))
    expect(update.mutate).toHaveBeenCalledWith({ id: `t${name}`, input: { isActive } }, expect.anything())
    act(() => update.mutate.mock.calls[0][1].onSuccess())
    expect(lastToast()).toBe(message)
  })

  // ทดสอบ: แก้เลขโต๊ะ → ตรวจเลข, บันทึกส่ง number ใหม่ แล้วกลับเป็นแถวปกติ + toast
  it('แก้เลขโต๊ะ 1 → 3 → ส่ง number:3 แล้ว toast และกลับเป็นแถวปกติ', async () => {
    const { user } = setup()
    await user.click(within(row('1')).getByRole('button', { name: 'แก้ไข' }))
    const input = screen.getByLabelText(/^เลขโต๊ะ/, { selector: '#edit-t1-number' })
    expect(input).toHaveValue(1)
    await user.clear(input)
    expect(screen.getByText('กรอกเลขโต๊ะ')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'บันทึก' })).toBeDisabled()
    await user.type(input, '3')
    await user.click(screen.getByRole('button', { name: 'บันทึก' }))
    expect(update.mutate).toHaveBeenCalledWith({ id: 't1', input: { number: 3 } }, expect.anything())
    act(() => update.mutate.mock.calls[0][1].onSuccess({ name: '3' }))
    expect(lastToast()).toBe('บันทึกโต๊ะ 3 แล้ว')
    expect(screen.queryByRole('button', { name: 'บันทึก' })).not.toBeInTheDocument()
  })

  // ทดสอบ: ยกเลิกการแก้ไข → คืนค่าเดิม ล้าง error
  it('ยกเลิกการแก้ไข → ล้าง error และคืนเลขเดิม', async () => {
    const { user } = setup()
    await user.click(within(row('1')).getByRole('button', { name: 'แก้ไข' }))
    const input = screen.getByLabelText(/^เลขโต๊ะ/, { selector: '#edit-t1-number' })
    await user.clear(input)
    await user.type(input, '9')
    await user.click(screen.getByRole('button', { name: 'ยกเลิก' }))
    expect(update.reset).toHaveBeenCalled()
    await user.click(within(row('1')).getByRole('button', { name: 'แก้ไข' }))
    expect(screen.getByLabelText(/^เลขโต๊ะ/, { selector: '#edit-t1-number' })).toHaveValue(1)
  })

  // ทดสอบ: บันทึกไม่ผ่าน → error โชว์ทั้งในแถวปกติ และในโหมดแก้ไข (ปุ่ม "กำลังบันทึก...")
  it('update error/pending → error โชว์ที่แถว และปุ่มบันทึกเป็น "กำลังบันทึก..."', async () => {
    const { user } = setup({ updateExtra: { error: new Error('เลขซ้ำกับโต๊ะอื่น'), isPending: true } })
    expect(row('1')).toHaveTextContent('เลขซ้ำกับโต๊ะอื่น')
    await user.click(within(row('1')).getByRole('button', { name: 'แก้ไข' }))
    expect(screen.getByRole('button', { name: 'กำลังบันทึก...' })).toBeDisabled()
  })

  // ทดสอบ: ลบ → ยืนยัน → ส่ง id และ toast / ย้อนกลับ → ล้าง error
  it('ลบโต๊ะ → ยืนยัน → ส่ง id และ toast / ย้อนกลับ → ไม่ลบ', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'ลบโต๊ะ 1' }))
    await user.click(within(screen.getByRole('dialog', { name: 'ลบโต๊ะ' })).getByRole('button', { name: 'ย้อนกลับ' }))
    expect(remove.reset).toHaveBeenCalled()
    expect(remove.mutate).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'ลบโต๊ะ 1' }))
    await user.click(within(screen.getByRole('dialog', { name: 'ลบโต๊ะ' })).getByRole('button', { name: 'ลบโต๊ะ' }))
    expect(remove.mutate).toHaveBeenCalledWith('t1', expect.anything())
    act(() => remove.mutate.mock.calls[0][1].onSuccess())
    expect(lastToast()).toBe('ลบโต๊ะ 1 แล้ว')
    expect(screen.queryByRole('dialog', { name: 'ลบโต๊ะ' })).not.toBeInTheDocument()
  })
})
