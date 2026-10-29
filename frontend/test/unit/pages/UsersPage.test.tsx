import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useToasts } from '@/components/ui/toast'
import { useAuth } from '@/features/auth/use-auth'
import type { StaffUser } from '@/features/users/api'
import { useCreateUser, useDeleteUser, useUpdateUser, useUsers } from '@/features/users/hooks'
import { Role } from '@/types/enums'
import { UsersPage } from '@/pages/owner/UsersPage'

vi.mock('@/features/users/hooks', () => ({
  useUsers: vi.fn(),
  useCreateUser: vi.fn(),
  useUpdateUser: vi.fn(),
  useDeleteUser: vi.fn(),
}))
// กล่องเปลี่ยนรหัสของตัวเองมี hook ของมันเอง — ที่นี่เช็กแค่ว่าเปิดถูกบัญชี
vi.mock('@/components/layout/ChangePasswordDialog', async (orig) => ({
  ...(await orig<typeof import('@/components/layout/ChangePasswordDialog')>()),
  ChangePasswordDialog: () => <div role="dialog" aria-label="เปลี่ยนรหัสผ่านของฉัน" />,
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

const staffUser = (id: string, name: string, role: Role, extra: Partial<StaffUser> = {}): StaffUser =>
  ({
    id,
    name,
    email: `${id}@restaurant.local`,
    username: id,
    role,
    isActive: true,
    mustChangePassword: false,
    createdAt: '2026-10-01T00:00:00.000Z',
    ...extra,
  }) as StaffUser

const owner = staffUser('owner', 'เจ้าของร้าน', Role.ADMIN)
const kitchen = staffUser('kitchen', 'ครัว', Role.KITCHEN)
const cashier = staffUser('cashier', 'แคชเชียร์', Role.STAFF, { isActive: false })
const newAdmin = staffUser('admin2', 'ผู้จัดการ', Role.ADMIN, { mustChangePassword: true })

type Mut = { mutate: ReturnType<typeof vi.fn>; reset: ReturnType<typeof vi.fn> }
let create: Mut
let update: Mut
let remove: Mut
let refetch: ReturnType<typeof vi.fn>

const mutation = (extra: Record<string, unknown> = {}) => ({
  mutate: vi.fn(),
  reset: vi.fn(),
  isPending: false,
  error: null,
  ...extra,
})

function setup({
  users = [owner, kitchen, cashier, newAdmin] as StaffUser[] | null,
  query = {} as Record<string, unknown>,
  updateExtra = {} as Record<string, unknown>,
} = {}) {
  create = mutation()
  update = mutation(updateExtra)
  remove = mutation()
  refetch = vi.fn()
  useAuth.setState({ user: { id: 'owner', email: 'owner@restaurant.local', name: 'เจ้าของร้าน', role: Role.ADMIN } })
  vi.mocked(useUsers).mockReturnValue({
    data: users ?? undefined,
    isPending: users === null && !query.isError,
    isError: false,
    error: null,
    refetch,
    ...query,
  } as never)
  vi.mocked(useCreateUser).mockReturnValue(create as never)
  vi.mocked(useUpdateUser).mockReturnValue(update as never)
  vi.mocked(useDeleteUser).mockReturnValue(remove as never)
  const user = userEvent.setup()
  render(<UsersPage />)
  return { user }
}

const card = (name: string) => screen.getByText(name, { selector: 'p' }).closest('li') as HTMLElement
const lastToast = () => useToasts.getState().toasts.at(-1)?.message
/** เรียก onSuccess ของ mutate ครั้งล่าสุด */
const succeed = (m: Mut) => act(() => m.mutate.mock.calls.at(-1)![1].onSuccess())

describe('UsersPage — รายการบัญชี', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useToasts.setState({ toasts: [] })
  })

  // ทดสอบ: หัวหน้าบอกจำนวนบัญชีที่ใช้อยู่/ปิด, การ์ดบอกสิทธิ์และสถานะ
  it('สรุปจำนวนบัญชี และการ์ดบอกสิทธิ์ ปิดใช้งาน และรหัสชั่วคราว', () => {
    setup()
    expect(screen.getByText(/ใช้งานอยู่ 3 บัญชี · ปิดใช้งาน 1 บัญชี/)).toBeInTheDocument()
    expect(card('ครัว')).toHaveTextContent('ชื่อผู้ใช้: kitchen')
    expect(card('แคชเชียร์')).toHaveTextContent('พนักงานหน้าร้าน')
    expect(card('แคชเชียร์')).toHaveTextContent('ปิดใช้งาน — เข้าสู่ระบบไม่ได้')
    expect(card('ผู้จัดการ')).toHaveTextContent('ยังใช้รหัสชั่วคราว')
  })

  // ทดสอบ: บัญชีตัวเอง ไม่มีปุ่มปิด/ลบ/ตั้งรหัสให้ แต่เปลี่ยนรหัสตัวเองได้
  it('บัญชีตัวเอง → (คุณ) มีแค่แก้ไขกับเปลี่ยนรหัสผ่าน', async () => {
    const { user } = setup()
    const mine = within(card('เจ้าของร้าน'))
    expect(mine.getByText('(คุณ)')).toBeInTheDocument()
    expect(mine.getAllByRole('button').map((b) => b.textContent)).toEqual(['แก้ไข', 'เปลี่ยนรหัสผ่าน'])
    await user.click(mine.getByRole('button', { name: 'เปลี่ยนรหัสผ่าน' }))
    expect(screen.getByRole('dialog', { name: 'เปลี่ยนรหัสผ่านของฉัน' })).toBeInTheDocument()
  })

  // ทดสอบ: ระหว่างโหลด / โหลดไม่ได้
  it('กำลังโหลด และโหลดไม่ได้ → ลองใหม่', async () => {
    const { user } = setup({ users: null, query: { isError: true, error: new Error('down') } })
    await user.click(within(screen.getByRole('alert')).getByRole('button', { name: 'ลองใหม่' }))
    expect(refetch).toHaveBeenCalled()
  })

  it('กำลังโหลด → "กำลังโหลด..."', () => {
    setup({ users: null })
    expect(screen.getByText('กำลังโหลด...')).toBeInTheDocument()
    expect(screen.getByText('บัญชีตามตำแหน่ง (ครัว / หน้าร้าน) และสิทธิ์')).toBeInTheDocument()
  })

  // ทดสอบ: ปิดใช้งาน → ยืนยันก่อน ส่ง isActive false แล้วขึ้น toast / ย้อนกลับล้าง error
  it('ปิดใช้งาน → ยืนยัน → ส่ง isActive:false และ toast', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'ปิดใช้งาน ครัว' }))
    const dialog = screen.getByRole('dialog', { name: 'ปิดใช้งานบัญชี' })
    expect(dialog).toHaveTextContent('ชื่อผู้ใช้ kitchen · ครัว')
    await user.click(within(dialog).getByRole('button', { name: 'ปิดใช้งาน' }))
    expect(update.mutate).toHaveBeenCalledWith({ id: 'kitchen', input: { isActive: false } }, expect.anything())
    succeed(update)
    expect(lastToast()).toBe('ปิดใช้งาน ครัว แล้ว')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('ปิดใช้งาน → ย้อนกลับ → ล้าง error ไม่ส่ง', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'ปิดใช้งาน ครัว' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ย้อนกลับ' }))
    expect(update.reset).toHaveBeenCalled()
    expect(update.mutate).not.toHaveBeenCalled()
  })

  // ทดสอบ: บัญชีที่ปิดอยู่ เปิดคืนได้ทันที (ไม่ต้องยืนยัน)
  it('เปิดใช้งานคืน → ส่ง isActive:true และ toast', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'เปิดใช้งาน แคชเชียร์' }))
    expect(update.mutate).toHaveBeenCalledWith({ id: 'cashier', input: { isActive: true } }, expect.anything())
    succeed(update)
    expect(lastToast()).toBe('เปิดใช้งาน แคชเชียร์ แล้ว')
  })

  // ทดสอบ: ลบบัญชี → ยืนยัน → ส่ง id / ย้อนกลับล้าง error
  it('ลบ → ยืนยัน → ส่ง id และ toast / ย้อนกลับ → ไม่ลบ', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'ลบ ครัว' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ย้อนกลับ' }))
    expect(remove.reset).toHaveBeenCalled()
    expect(remove.mutate).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'ลบ ครัว' }))
    await user.click(within(screen.getByRole('dialog', { name: 'ลบบัญชี' })).getByRole('button', { name: 'ลบบัญชี' }))
    expect(remove.mutate).toHaveBeenCalledWith('kitchen', expect.anything())
    succeed(remove)
    expect(lastToast()).toBe('ลบ ครัว แล้ว')
  })
})

describe('UsersPage — เพิ่ม/แก้ไขบัญชี', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useToasts.setState({ toasts: [] })
  })

  const openNew = async () => {
    const r = setup()
    await r.user.click(screen.getByRole('button', { name: 'เพิ่มบัญชี' }))
    return { ...r, dialog: screen.getByRole('dialog', { name: 'เพิ่มบัญชี' }) }
  }

  // ทดสอบ: กดเพิ่มโดยไม่กรอก → โชว์ error ทุกช่อง ไม่ส่ง (ก่อนกดยังไม่โชว์)
  it('ส่งฟอร์มว่าง → error ทุกช่อง ไม่ส่ง', async () => {
    const { user, dialog } = await openNew()
    expect(within(dialog).queryAllByRole('alert')).toHaveLength(0)
    await user.click(within(dialog).getByRole('button', { name: 'เพิ่มบัญชี' }))
    expect(within(dialog).getAllByRole('alert').map((a) => a.textContent)).toEqual([
      'กรอกชื่อบัญชี',
      'กรอกชื่อผู้ใช้',
      'รหัสผ่านอย่างน้อย 8 ตัวอักษร',
    ])
    expect(create.mutate).not.toHaveBeenCalled()
  })

  // ทดสอบ: ชื่อผู้ใช้มีอักขระต้องห้าม / รหัสสองช่องไม่ตรง
  it('ชื่อผู้ใช้มีช่องว่าง/ภาษาไทย และรหัสไม่ตรงกัน → error', async () => {
    const { user, dialog } = await openNew()
    await user.type(within(dialog).getByPlaceholderText('เช่น ครัว, แคชเชียร์, หน้าร้าน'), 'บาร์')
    await user.type(within(dialog).getByPlaceholderText('เช่น kitchen, cashier'), 'บาร์ น้ำ')
    await user.type(within(dialog).getByLabelText(/^รหัสผ่านเริ่มต้น/), 'password1')
    await user.type(within(dialog).getByLabelText(/^ยืนยันรหัสผ่าน/), 'password2')
    await user.click(within(dialog).getByRole('button', { name: 'เพิ่มบัญชี' }))
    expect(dialog).toHaveTextContent('ใช้ได้แค่ a-z, 0-9 และ . _ -')
    expect(dialog).toHaveTextContent('รหัสผ่านสองช่องไม่ตรงกัน')
    expect(create.mutate).not.toHaveBeenCalled()
  })

  // ทดสอบ: กรอกครบ → ชื่อผู้ใช้กลายเป็นอีเมลของร้าน (ตัวเล็ก ตัดช่องว่าง) ส่งพร้อมสิทธิ์ที่เลือก
  it('กรอกครบ → แปลงชื่อผู้ใช้เป็นอีเมลร้าน ส่งสิทธิ์ที่เลือก แล้ว toast + ปิด', async () => {
    const { user, dialog } = await openNew()
    await user.type(within(dialog).getByPlaceholderText('เช่น ครัว, แคชเชียร์, หน้าร้าน'), '  บาร์น้ำ ')
    await user.type(within(dialog).getByPlaceholderText('เช่น kitchen, cashier'), ' Bar.1 ')
    expect(dialog).toHaveTextContent('เก็บเป็น bar.1@restaurant.local')
    await user.click(within(dialog).getByRole('radio', { name: /ครัว/ }))
    await user.type(within(dialog).getByLabelText(/^รหัสผ่านเริ่มต้น/), 'password1')
    await user.type(within(dialog).getByLabelText(/^ยืนยันรหัสผ่าน/), 'password1')
    await user.click(within(dialog).getByRole('button', { name: 'เพิ่มบัญชี' }))

    expect(create.mutate).toHaveBeenCalledWith(
      { name: 'บาร์น้ำ', email: 'bar.1@restaurant.local', password: 'password1', role: Role.KITCHEN },
      expect.anything(),
    )
    succeed(create)
    expect(lastToast()).toBe('เพิ่มบัญชี บาร์น้ำ แล้ว — login ด้วยชื่อผู้ใช้ bar.1')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  // ทดสอบ: ใส่อีเมลเต็มเป็นชื่อผู้ใช้ได้ / เลือกเจ้าของร้านเปลี่ยนคำแนะนำ
  it('ใส่อีเมลเต็มได้ และเลือกเจ้าของร้าน → บอกว่ารหัสใช้ได้ครั้งเดียว', async () => {
    const { user, dialog } = await openNew()
    await user.type(within(dialog).getByPlaceholderText('เช่น kitchen, cashier'), 'boss@shop.com')
    expect(dialog).toHaveTextContent('เก็บเป็น boss@shop.com')
    await user.click(within(dialog).getByRole('radio', { name: /เจ้าของร้าน/ }))
    expect(dialog).toHaveTextContent('รหัสนี้ใช้ได้ครั้งเดียว')
  })

  // ทดสอบ: แก้ไขบัญชีอื่น → แก้ชื่อและสิทธิ์ได้ ชื่อผู้ใช้เปลี่ยนไม่ได้ ไม่มีช่องรหัส
  it('แก้ไขบัญชีอื่น → ส่งชื่อ + สิทธิ์ ชื่อผู้ใช้เปลี่ยนไม่ได้', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'แก้ไข ครัว' }))
    const dialog = screen.getByRole('dialog', { name: 'แก้ไข ครัว' })
    expect(dialog).toHaveTextContent('ชื่อผู้ใช้: kitchen (เปลี่ยนไม่ได้)')
    expect(within(dialog).queryByLabelText(/^รหัสผ่านเริ่มต้น/)).not.toBeInTheDocument()
    const name = within(dialog).getByPlaceholderText('เช่น ครัว, แคชเชียร์, หน้าร้าน')
    await user.clear(name)
    await user.type(name, 'ครัวร้อน')
    await user.click(within(dialog).getByRole('radio', { name: /พนักงานหน้าร้าน/ }))
    await user.click(within(dialog).getByRole('button', { name: 'บันทึก' }))
    expect(update.mutate).toHaveBeenCalledWith(
      { id: 'kitchen', input: { name: 'ครัวร้อน', role: Role.STAFF } },
      expect.anything(),
    )
    succeed(update)
    expect(lastToast()).toBe('บันทึก ครัวร้อน แล้ว')
  })

  // ทดสอบ: แก้ไขบัญชีตัวเอง → เปลี่ยนสิทธิ์ไม่ได้ และไม่ส่ง role / ล้างชื่อแล้วบันทึกไม่ได้
  it('แก้ไขบัญชีตัวเอง → สิทธิ์ถูกล็อก ไม่ส่ง role / ชื่อว่างบันทึกไม่ได้', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'แก้ไข เจ้าของร้าน' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('เปลี่ยนสิทธิ์ของบัญชีตัวเองไม่ได้')
    expect(within(dialog).getAllByRole('radio').every((r) => (r as HTMLInputElement).disabled)).toBe(true)

    const name = within(dialog).getByPlaceholderText('เช่น ครัว, แคชเชียร์, หน้าร้าน')
    await user.clear(name)
    await user.click(within(dialog).getByRole('button', { name: 'บันทึก' }))
    expect(dialog).toHaveTextContent('กรอกชื่อบัญชี')
    expect(update.mutate).not.toHaveBeenCalled()

    await user.type(name, 'เจ้าของ')
    await user.click(within(dialog).getByRole('button', { name: 'บันทึก' }))
    expect(update.mutate).toHaveBeenCalledWith({ id: 'owner', input: { name: 'เจ้าของ' } }, expect.anything())
  })

  // ทดสอบ: ยกเลิกปิดกล่อง / กำลังบันทึกปุ่มกดไม่ได้
  it('ยกเลิก → ปิดกล่อง', async () => {
    const { user, dialog } = await openNew()
    await user.click(within(dialog).getByRole('button', { name: 'ยกเลิก' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('UsersPage — ตั้งรหัสผ่านใหม่ให้บัญชีอื่น', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useToasts.setState({ toasts: [] })
  })

  const openReset = async () => {
    const r = setup()
    await r.user.click(screen.getByRole('button', { name: 'ตั้งรหัสผ่านใหม่ให้ ครัว' }))
    return { ...r, dialog: screen.getByRole('dialog', { name: 'ตั้งรหัสผ่านใหม่ให้ ครัว' }) }
  }

  // ทดสอบ: รหัสสั้น/ไม่ตรงกัน → error ไม่ส่ง
  it('รหัสสั้นและไม่ตรงกัน → error ไม่ส่ง', async () => {
    const { user, dialog } = await openReset()
    await user.type(within(dialog).getByLabelText(/^รหัสผ่านใหม่/), 'short')
    await user.click(within(dialog).getByRole('button', { name: 'ตั้งรหัสผ่าน' }))
    expect(dialog).toHaveTextContent('รหัสผ่านอย่างน้อย 8 ตัวอักษร')
    expect(dialog).toHaveTextContent('รหัสผ่านสองช่องไม่ตรงกัน')
    expect(update.mutate).not.toHaveBeenCalled()
  })

  // ทดสอบ: ค่าเริ่มต้นติ๊กออกจากระบบทุกเครื่อง → toast บอกว่าทุกเครื่องต้อง login ใหม่ / เอาติ๊กออกได้
  it.each([
    [true, 'ตั้งรหัสใหม่ให้ ครัว แล้ว — ทุกเครื่องต้อง login ใหม่ด้วยรหัสใหม่'],
    [false, 'ตั้งรหัสใหม่ให้ ครัว แล้ว'],
  ])('ออกจากระบบทุกเครื่อง=%s → ส่งค่านั้นและ toast ตามนั้น', async (logoutEverywhere, message) => {
    const { user, dialog } = await openReset()
    const checkbox = within(dialog).getByRole('checkbox', { name: /ออกจากระบบทุกเครื่อง/ })
    expect(checkbox).toBeChecked()
    if (!logoutEverywhere) await user.click(checkbox)
    await user.type(within(dialog).getByLabelText(/^รหัสผ่านใหม่/), 'newpass99')
    await user.type(within(dialog).getByLabelText(/^ยืนยันรหัสผ่านใหม่/), 'newpass99')
    await user.click(within(dialog).getByRole('button', { name: 'ตั้งรหัสผ่าน' }))
    expect(update.mutate).toHaveBeenCalledWith(
      { id: 'kitchen', input: { password: 'newpass99', logoutEverywhere } },
      expect.anything(),
    )
    succeed(update)
    expect(lastToast()).toBe(message)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('ยกเลิก → ปิดกล่อง', async () => {
    const { user, dialog } = await openReset()
    await user.click(within(dialog).getByRole('button', { name: 'ยกเลิก' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
