import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChangePasswordDialog, ChangePasswordForm } from '@/components/layout/ChangePasswordDialog'
import { passwordLengthError } from '@/lib/password'
import { ForcePasswordChange } from '@/components/layout/ForcePasswordChange'
import { useToasts } from '@/components/ui/toast'
import { useChangePassword } from '@/features/auth/hooks'
import { useAuth } from '@/features/auth/use-auth'
import { Role } from '@/types/enums'

vi.mock('@/features/auth/hooks', () => ({ useChangePassword: vi.fn() }))

// jsdom ยังไม่มี showModal ของ <dialog>
beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false
  }
})

let change: { mutate: ReturnType<typeof vi.fn>; isPending: boolean; error: unknown }

function mockChange(extra: Partial<typeof change> = {}) {
  change = { mutate: vi.fn(), isPending: false, error: null, ...extra }
  vi.mocked(useChangePassword).mockReturnValue(change as never)
}

const lastToast = () => useToasts.getState().toasts.at(-1)?.message
/** เรียก onSuccess ของ mutate ครั้งล่าสุด (เหมือน backend ตอบ 200) */
const succeed = () => act(() => change.mutate.mock.calls.at(-1)![1].onSuccess())
const alerts = () => screen.queryAllByRole('alert').map((a) => a.textContent)

async function fill(
  user: ReturnType<typeof userEvent.setup>,
  { current = '', next = '', confirm = '' }: { current?: string; next?: string; confirm?: string },
  currentLabel: RegExp = /^รหัสผ่านปัจจุบัน/,
) {
  if (current) await user.type(screen.getByLabelText(currentLabel), current)
  if (next) await user.type(screen.getByLabelText(/^รหัสผ่านใหม่/), next)
  if (confirm) await user.type(screen.getByLabelText(/^ยืนยันรหัสผ่านใหม่/), confirm)
}
/** ป้าย <label> ที่ครอบช่องกรอก (มีชื่อช่อง คำใบ้ และข้อความผิดอยู่ข้างใน) */
const labelOf = (label: RegExp) => screen.getByLabelText(label).closest('label') as HTMLElement
/** ข้อความผิดที่ขึ้นใต้ช่องนั้น ('' = ไม่มี) */
const errorUnder = (label: RegExp) => labelOf(label).querySelector('[role="alert"]')?.textContent ?? ''
/** มี error แค่ช่องเดียว: ข้อความอยู่ใต้ช่องนั้น ช่องนั้นขอบแดง (aria-invalid) และช่องอื่นไม่แดง */
function expectOnlyError(label: RegExp, message: string) {
  expect(alerts()).toEqual([message])
  expect(errorUnder(label)).toBe(message)
  expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true')
  expect(document.querySelectorAll('input[aria-invalid="true"]')).toHaveLength(1)
}
/** วางข้อความยาวทีเดียว (พิมพ์ 73 ตัวทีละตัวช้า) */
async function paste(user: ReturnType<typeof userEvent.setup>, label: RegExp, text: string) {
  await user.click(screen.getByLabelText(label))
  await user.paste(text)
}
const submit = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'เปลี่ยนรหัสผ่าน' }))

beforeEach(() => {
  vi.clearAllMocks()
  useToasts.setState({ toasts: [] })
  mockChange()
})

describe('passwordLengthError — กฎความยาวรหัส (ตรงกับ backend 8–72)', () => {
  // ทดสอบ: ขอบล่าง/บนของความยาวรหัส 7/8/72/73 ตัว ให้ข้อความตรงกับกฎ backend
  // วิธี: เรียกฟังก์ชันด้วยรหัสยาว 7, 8, 72, 73 ตัว → 7 และ 73 ต้องได้ข้อความผิด, 8 และ 72 ต้องได้ ''
  it.each([
    [7, 'รหัสผ่านอย่างน้อย 8 ตัวอักษร'],
    [8, ''],
    [72, ''],
    [73, 'รหัสผ่านยาวได้ไม่เกิน 72 ตัวอักษร'],
  ])('ยาว %i ตัว → "%s"', (length, message) => {
    expect(passwordLengthError('a'.repeat(length))).toBe(message)
  })
})

describe('ChangePasswordDialog — เปลี่ยนรหัสผ่านของตัวเอง (ADMIN)', () => {
  const open = () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<ChangePasswordDialog onClose={onClose} />)
    return { user, onClose, dialog: screen.getByRole('dialog', { name: 'เปลี่ยนรหัสผ่านของฉัน' }) }
  }

  // ทดสอบ: กล่องมี 3 ช่องรหัส (เป็น type=password ไม่โชว์ตัวอักษร) และยังไม่โชว์ error ก่อนกดเปลี่ยน
  // วิธี: เปิดกล่อง → เช็กว่ามีช่องรหัสปัจจุบัน/ใหม่/ยืนยัน เป็น password ทั้งหมด autocomplete ถูกชนิด และไม่มี alert
  it('มี 3 ช่องรหัสแบบซ่อนตัวอักษร ยังไม่โชว์ error ก่อนกด', () => {
    open()
    const current = screen.getByLabelText(/^รหัสผ่านปัจจุบัน/)
    const next = screen.getByLabelText(/^รหัสผ่านใหม่/)
    const confirm = screen.getByLabelText(/^ยืนยันรหัสผ่านใหม่/)
    for (const input of [current, next, confirm]) expect(input).toHaveAttribute('type', 'password')
    expect(current).toHaveAttribute('autocomplete', 'current-password')
    expect(next).toHaveAttribute('autocomplete', 'new-password')
    expect(confirm).toHaveAttribute('autocomplete', 'new-password')
    expect(alerts()).toEqual([])
  })

  // ทดสอบ: ก่อนกดเปลี่ยน ผู้ใช้เห็นคำใบ้กฎความยาวที่ช่องรหัสใหม่ และทุกช่องมีเครื่องหมายช่องบังคับ
  // วิธี: เปิดกล่อง → ป้ายช่องรหัสใหม่ต้องมี "(อย่างน้อย 8 ตัวอักษร)" และทั้ง 3 ป้ายมี "(จำเป็น)"
  it('ก่อนกด: ช่องรหัสใหม่มีคำใบ้ "อย่างน้อย 8 ตัวอักษร" และทุกช่องบอกว่าจำเป็น', () => {
    open()
    expect(labelOf(/^รหัสผ่านใหม่/)).toHaveTextContent('(อย่างน้อย 8 ตัวอักษร)')
    for (const label of [/^รหัสผ่านปัจจุบัน/, /^รหัสผ่านใหม่/, /^ยืนยันรหัสผ่านใหม่/]) {
      expect(labelOf(label)).toHaveTextContent('(จำเป็น)')
    }
  })

  // ทดสอบ: กดเปลี่ยนโดยไม่กรอกอะไรเลย → ขึ้น error ทั้งช่องรหัสปัจจุบันและช่องรหัสใหม่ ไม่ยิง API
  // วิธี: กดปุ่มเปลี่ยนรหัสผ่านทันที → เช็กข้อความใต้แต่ละช่อง (ช่องยืนยันว่าง = ตรงกับรหัสใหม่ที่ว่าง จึงไม่ขึ้น) และ mutate ไม่ถูกเรียก
  it('ไม่กรอกอะไรเลย → error ใต้ช่องรหัสปัจจุบันและรหัสใหม่ ไม่ยิง API', async () => {
    const { user } = open()
    await submit(user)
    expect(errorUnder(/^รหัสผ่านปัจจุบัน/)).toBe('กรอกรหัสผ่านปัจจุบัน')
    expect(errorUnder(/^รหัสผ่านใหม่/)).toBe('รหัสผ่านใหม่อย่างน้อย 8 ตัวอักษร')
    expect(errorUnder(/^ยืนยันรหัสผ่านใหม่/)).toBe('')
    expect(change.mutate).not.toHaveBeenCalled()
  })

  // ทดสอบ: ไม่กรอกรหัสปัจจุบัน (ช่องอื่นถูก) → error ขึ้นใต้ช่องรหัสปัจจุบันช่องเดียว ช่องนั้นขอบแดง
  // วิธี: กรอกแค่รหัสใหม่/ยืนยันที่ถูก กดเปลี่ยน → ข้อความใต้ช่องรหัสปัจจุบัน, aria-invalid เฉพาะช่องนั้น, ไม่ยิง API
  it('ไม่กรอกรหัสปัจจุบัน → "กรอกรหัสผ่านปัจจุบัน" ใต้ช่องนั้น', async () => {
    const { user } = open()
    await fill(user, { next: 'NewPass123', confirm: 'NewPass123' })
    await submit(user)
    expectOnlyError(/^รหัสผ่านปัจจุบัน/, 'กรอกรหัสผ่านปัจจุบัน')
    expect(change.mutate).not.toHaveBeenCalled()
  })

  // ทดสอบ: ไม่กรอกรหัสใหม่ (กรอกรหัสปัจจุบันแล้ว) → error ใต้ช่องรหัสใหม่ช่องเดียว
  // วิธี: กรอกแค่รหัสปัจจุบัน กดเปลี่ยน → ข้อความ "รหัสผ่านใหม่อย่างน้อย 8 ตัวอักษร" ใต้ช่องรหัสใหม่ ไม่ยิง API
  it('ไม่กรอกรหัสใหม่ → "รหัสผ่านใหม่อย่างน้อย 8 ตัวอักษร" ใต้ช่องรหัสใหม่', async () => {
    const { user } = open()
    await fill(user, { current: 'OldPass123' })
    await submit(user)
    expectOnlyError(/^รหัสผ่านใหม่/, 'รหัสผ่านใหม่อย่างน้อย 8 ตัวอักษร')
    expect(change.mutate).not.toHaveBeenCalled()
  })

  // ทดสอบ: รหัสใหม่ 7 ตัว (สั้นกว่ากฎ 1 ตัว) → error ใต้ช่องรหัสใหม่ช่องเดียว
  // วิธี: กรอกรหัสปัจจุบัน รหัสใหม่/ยืนยัน 7 ตัว กดเปลี่ยน → ข้อความใต้ช่องรหัสใหม่ ไม่ยิง API
  it('รหัสใหม่ 7 ตัว → "รหัสผ่านใหม่อย่างน้อย 8 ตัวอักษร" ใต้ช่องรหัสใหม่', async () => {
    const { user } = open()
    await fill(user, { current: 'OldPass123', next: 'a'.repeat(7), confirm: 'a'.repeat(7) })
    await submit(user)
    expectOnlyError(/^รหัสผ่านใหม่/, 'รหัสผ่านใหม่อย่างน้อย 8 ตัวอักษร')
    expect(change.mutate).not.toHaveBeenCalled()
  })

  // ทดสอบ: รหัสใหม่ 73 ตัว (ยาวเกินกฎ 1 ตัว) → error ใต้ช่องรหัสใหม่ช่องเดียว
  // วิธี: วางรหัส 73 ตัวในช่องรหัสใหม่และยืนยัน กดเปลี่ยน → ข้อความ "ยาวได้ไม่เกิน 72" ใต้ช่องรหัสใหม่ ไม่ยิง API
  it('รหัสใหม่ 73 ตัว → "รหัสผ่านใหม่ยาวได้ไม่เกิน 72 ตัวอักษร" ใต้ช่องรหัสใหม่', async () => {
    const { user } = open()
    await fill(user, { current: 'OldPass123' })
    await paste(user, /^รหัสผ่านใหม่/, 'a'.repeat(73))
    await paste(user, /^ยืนยันรหัสผ่านใหม่/, 'a'.repeat(73))
    await submit(user)
    expectOnlyError(/^รหัสผ่านใหม่/, 'รหัสผ่านใหม่ยาวได้ไม่เกิน 72 ตัวอักษร')
    expect(change.mutate).not.toHaveBeenCalled()
  })

  // ทดสอบ: รหัสใหม่เหมือนรหัสปัจจุบัน → error ใต้ช่องรหัสใหม่ช่องเดียว
  // วิธี: กรอกรหัสใหม่/ยืนยันเท่ากับรหัสปัจจุบัน กดเปลี่ยน → "รหัสผ่านใหม่ต้องต่างจากรหัสเดิม" ใต้ช่องรหัสใหม่ ไม่ยิง API
  it('รหัสใหม่ซ้ำรหัสปัจจุบัน → "รหัสผ่านใหม่ต้องต่างจากรหัสเดิม" ใต้ช่องรหัสใหม่', async () => {
    const { user } = open()
    await fill(user, { current: 'OldPass123', next: 'OldPass123', confirm: 'OldPass123' })
    await submit(user)
    expectOnlyError(/^รหัสผ่านใหม่/, 'รหัสผ่านใหม่ต้องต่างจากรหัสเดิม')
    expect(change.mutate).not.toHaveBeenCalled()
  })

  // ทดสอบ: ช่องยืนยันไม่ตรงกับรหัสใหม่ → error ใต้ช่องยืนยันช่องเดียว
  // วิธี: กรอกยืนยันต่างจากรหัสใหม่ 1 ตัว กดเปลี่ยน → "รหัสผ่านใหม่สองช่องไม่ตรงกัน" ใต้ช่องยืนยัน ไม่ยิง API
  it('ยืนยันไม่ตรง → "รหัสผ่านใหม่สองช่องไม่ตรงกัน" ใต้ช่องยืนยัน', async () => {
    const { user } = open()
    await fill(user, { current: 'OldPass123', next: 'NewPass123', confirm: 'NewPass124' })
    await submit(user)
    expectOnlyError(/^ยืนยันรหัสผ่านใหม่/, 'รหัสผ่านใหม่สองช่องไม่ตรงกัน')
    expect(change.mutate).not.toHaveBeenCalled()
  })

  // ทดสอบ: รหัสใหม่ยาว 8 และ 72 ตัวพอดี (ขอบของกฎ) ต้องส่งได้
  // วิธี: กรอกรหัสใหม่ยาว 8 / 72 ตัว ยืนยันตรงกัน แล้วกดเปลี่ยน → ไม่มี error และ mutate ถูกเรียก
  it.each([8, 72])('รหัสใหม่ยาว %i ตัวพอดี → ส่งได้', async (length) => {
    const { user } = open()
    const next = 'b'.repeat(length)
    await fill(user, { current: 'OldPass123', next, confirm: next })
    await submit(user)
    expect(alerts()).toEqual([])
    expect(change.mutate).toHaveBeenCalledTimes(1)
  })

  // ทดสอบ: error โชว์หลังกดครั้งแรก แล้วหายเองเมื่อแก้ให้ถูก
  // วิธี: กรอกยืนยันไม่ตรง กดเปลี่ยน → เห็น error → แก้ช่องยืนยันให้ตรง → error หาย
  it('แก้ช่องที่ผิดให้ถูก → error หายทันที', async () => {
    const { user } = open()
    await fill(user, { current: 'OldPass123', next: 'NewPass123', confirm: 'NewPass12' })
    await submit(user)
    expect(alerts()).toEqual(['รหัสผ่านใหม่สองช่องไม่ตรงกัน'])
    await user.type(screen.getByLabelText(/^ยืนยันรหัสผ่านใหม่/), '3')
    expect(alerts()).toEqual([])
  })

  // ทดสอบ: กรอกถูกครบ → ส่งแค่ currentPassword/newPassword (ไม่ส่งช่องยืนยัน) แล้ว toast + ปิดกล่อง
  // วิธี: กรอกครบแล้วกดเปลี่ยน → เช็ก argument ของ mutate → จำลอง backend ตอบสำเร็จ → เช็ก toast และ onClose
  it('กรอกถูก → ส่ง {currentPassword, newPassword} แล้ว toast และปิดกล่อง', async () => {
    const { user, onClose } = open()
    await fill(user, { current: 'OldPass123', next: 'NewPass123', confirm: 'NewPass123' })
    await submit(user)
    expect(change.mutate).toHaveBeenCalledWith(
      { currentPassword: 'OldPass123', newPassword: 'NewPass123' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    expect(onClose).not.toHaveBeenCalled()
    succeed()
    expect(lastToast()).toBe('เปลี่ยนรหัสผ่านแล้ว — ครั้งหน้าใช้รหัสใหม่')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // ทดสอบ: backend ตอบรหัสปัจจุบันผิด → โชว์ข้อความในกล่อง กล่องยังเปิดอยู่ ไม่ toast
  // วิธี: ให้ hook มี error "รหัสผ่านปัจจุบันไม่ถูกต้อง" → เช็กว่ามี alert ข้อความนั้น onClose ไม่ถูกเรียก และไม่มี toast
  it('backend ตอบรหัสปัจจุบันผิด → โชว์ error ในกล่อง ไม่ปิด', () => {
    mockChange({ error: new Error('รหัสผ่านปัจจุบันไม่ถูกต้อง') })
    const { onClose, dialog } = open()
    expect(within(dialog).getByRole('alert')).toHaveTextContent('รหัสผ่านปัจจุบันไม่ถูกต้อง')
    expect(onClose).not.toHaveBeenCalled()
    expect(lastToast()).toBeUndefined()
  })

  // ทดสอบ: ระหว่างบันทึก (bcrypt ช้า) ปุ่มกดซ้ำไม่ได้ และบอกว่ากำลังบันทึก
  // วิธี: ให้ hook isPending=true → ปุ่มต้องเป็น "กำลังบันทึก..." และ disabled
  it('กำลังบันทึก → ปุ่ม "กำลังบันทึก..." กดไม่ได้', () => {
    mockChange({ isPending: true })
    open()
    expect(screen.getByRole('button', { name: 'กำลังบันทึก...' })).toBeDisabled()
  })

  // ทดสอบ: กดยกเลิก → ปิดกล่อง ไม่ยิง API
  // วิธี: กรอกบางช่องแล้วกดยกเลิก → onClose ถูกเรียก และ mutate ไม่ถูกเรียก
  it('ยกเลิก → ปิดกล่อง ไม่ยิง API', async () => {
    const { user, onClose } = open()
    await fill(user, { current: 'OldPass123' })
    await user.click(screen.getByRole('button', { name: 'ยกเลิก' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(change.mutate).not.toHaveBeenCalled()
  })
})

describe('ChangePasswordForm — โหมดบังคับ (ไม่มีปุ่มยกเลิก)', () => {
  // ทดสอบ: ไม่ส่ง onCancel = ไม่มีปุ่มยกเลิก (หน้าบังคับต้องเปลี่ยนก่อนใช้งาน) และใช้ป้ายช่องรหัสปัจจุบันที่ส่งมา
  // วิธี: render ฟอร์มโดยไม่ส่ง onCancel แต่ส่ง currentLabel → ไม่มีปุ่มยกเลิก และเจอช่องตามป้ายใหม่
  it('ไม่มีปุ่มยกเลิก และใช้ป้ายรหัสชั่วคราว', () => {
    render(<ChangePasswordForm onDone={vi.fn()} currentLabel="รหัสผ่านชั่วคราว" />)
    expect(screen.queryByRole('button', { name: 'ยกเลิก' })).not.toBeInTheDocument()
    expect(screen.getByLabelText(/^รหัสผ่านชั่วคราว/)).toBeInTheDocument()
  })
})

describe('ForcePasswordChange — หน้าบังคับตั้งรหัสใหม่ (ADMIN รหัสชั่วคราว)', () => {
  const admin = {
    id: 'a2',
    email: 'admin2@restaurant.local',
    name: 'ผู้จัดการ',
    role: Role.ADMIN,
    mustChangePassword: true,
  }

  const openPage = () => {
    useAuth.setState({ user: admin })
    const user = userEvent.setup()
    render(<ForcePasswordChange />)
    return { user }
  }

  // ทดสอบ: หน้าบังคับบอกชื่อบัญชี ใช้ป้าย "รหัสผ่านชั่วคราว" และไม่มีปุ่มยกเลิก
  // วิธี: ตั้ง user ที่ mustChangePassword=true แล้ว render → เช็กหัวข้อ ชื่อบัญชี ป้ายช่อง และไม่มีปุ่มยกเลิก
  it('บอกชื่อบัญชี ป้ายรหัสชั่วคราว ไม่มีปุ่มยกเลิก', () => {
    openPage()
    expect(screen.getByRole('heading', { name: 'ตั้งรหัสผ่านใหม่ก่อนใช้งาน' })).toBeInTheDocument()
    expect(screen.getByText('ผู้จัดการ')).toBeInTheDocument()
    expect(screen.getByLabelText(/^รหัสผ่านชั่วคราว \(ที่ใช้ login เมื่อกี้\)/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ยกเลิก' })).not.toBeInTheDocument()
  })

  // ทดสอบ: ตั้งรหัสใหม่สำเร็จ → ปลด mustChangePassword ในเครื่อง (เข้าใช้งานต่อได้ทันที ไม่ต้อง login ใหม่) และ toast
  // วิธี: กรอกรหัสชั่วคราว/ใหม่/ยืนยัน กดเปลี่ยน → จำลองสำเร็จ → เช็ก useAuth.user.mustChangePassword=false และ toast
  it('ตั้งสำเร็จ → mustChangePassword=false ในเครื่อง และ toast', async () => {
    const { user } = openPage()
    await fill(user, { current: 'TempPass1', next: 'MyOwnPass22', confirm: 'MyOwnPass22' }, /^รหัสผ่านชั่วคราว/)
    await submit(user)
    expect(change.mutate).toHaveBeenCalledWith(
      { currentPassword: 'TempPass1', newPassword: 'MyOwnPass22' },
      expect.anything(),
    )
    succeed()
    expect(useAuth.getState().user?.mustChangePassword).toBe(false)
    expect(lastToast()).toBe('ตั้งรหัสผ่านใหม่แล้ว')
  })

  // ทดสอบ: รหัสใหม่ซ้ำรหัสชั่วคราว → error ไม่ส่ง (ต้องตั้งรหัสที่รู้คนเดียวจริง ๆ)
  // วิธี: กรอกรหัสใหม่เท่ากับรหัสชั่วคราวแล้วกดเปลี่ยน → เห็น "รหัสผ่านใหม่ต้องต่างจากรหัสเดิม" และ mutate ไม่ถูกเรียก
  // ทดสอบ: หน้าบังคับ ไม่กรอกรหัสชั่วคราว → error ขึ้นใต้ช่อง "รหัสผ่านชั่วคราว" ช่องเดียว
  // วิธี: กรอกแค่รหัสใหม่/ยืนยัน กดเปลี่ยน → ข้อความใต้ช่องรหัสชั่วคราว และ mutate ไม่ถูกเรียก
  it('ไม่กรอกรหัสชั่วคราว → error ใต้ช่องรหัสชั่วคราว ไม่ส่ง', async () => {
    const { user } = openPage()
    await fill(user, { next: 'MyOwnPass22', confirm: 'MyOwnPass22' })
    await submit(user)
    expectOnlyError(/^รหัสผ่านชั่วคราว/, 'กรอกรหัสผ่านปัจจุบัน')
    expect(change.mutate).not.toHaveBeenCalled()
  })

  it('รหัสใหม่ซ้ำรหัสชั่วคราว → error ไม่ส่ง', async () => {
    const { user } = openPage()
    await fill(user, { current: 'TempPass1', next: 'TempPass1', confirm: 'TempPass1' }, /^รหัสผ่านชั่วคราว/)
    await submit(user)
    expect(alerts()).toEqual(['รหัสผ่านใหม่ต้องต่างจากรหัสเดิม'])
    expect(change.mutate).not.toHaveBeenCalled()
  })

  // ทดสอบ: ไม่อยากตั้งตอนนี้ → ออกจากระบบได้ (ไม่ติดอยู่ที่หน้านี้)
  // วิธี: กดปุ่ม "ออกจากระบบ" → useAuth.user ต้องเป็น null
  it('กดออกจากระบบ → user = null', async () => {
    const { user } = openPage()
    await user.click(screen.getByRole('button', { name: 'ออกจากระบบ' }))
    expect(useAuth.getState().user).toBeNull()
  })
})
