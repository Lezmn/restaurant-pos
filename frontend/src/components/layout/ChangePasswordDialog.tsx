import { ErrorNote } from '@/components/ui/ErrorNote'
import { Modal } from '@/components/ui/Modal'
import { toast } from '@/components/ui/toast'
import { button, field, fieldLabel } from '@/components/ui/styles'
import { useChangePassword } from '@/features/auth/hooks'
import { useState } from 'react'

/** ตรงกับ @MinLength ของ ChangePasswordDto / CreateUserDto ฝั่ง backend */
export const MIN_PASSWORD_LENGTH = 8

/**
 * เปลี่ยนรหัสผ่านของตัวเอง — เฉพาะ ADMIN (บัญชีกลางของครัว/หน้าร้าน ADMIN ตั้งให้ที่หน้าบัญชีผู้ใช้)
 * ใช้ตอนรับมอบระบบ: เจ้าของร้านเปลี่ยนรหัส ADMIN ที่ได้มาเป็นรหัสที่รู้คนเดียว
 */
export function ChangePasswordDialog({ onClose }: Readonly<{ onClose: () => void }>) {
  const change = useChangePassword()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [attempted, setAttempted] = useState(false)

  const errors = {
    current: current ? '' : 'กรอกรหัสผ่านปัจจุบัน',
    next:
      next.length < MIN_PASSWORD_LENGTH
        ? `รหัสผ่านใหม่อย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`
        : next === current
          ? 'รหัสผ่านใหม่ต้องต่างจากรหัสเดิม'
          : '',
    confirm: confirm === next ? '' : 'รหัสผ่านใหม่สองช่องไม่ตรงกัน',
  }
  const invalid = Object.values(errors).some(Boolean)
  const show = (key: keyof typeof errors) => (attempted ? errors[key] : '')

  return (
    <Modal title="เปลี่ยนรหัสผ่านของฉัน" onClose={onClose}>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          setAttempted(true)
          if (invalid) return
          change.mutate(
            { currentPassword: current, newPassword: next },
            {
              onSuccess: () => {
                toast('เปลี่ยนรหัสผ่านแล้ว — ครั้งหน้าใช้รหัสใหม่')
                onClose()
              },
            },
          )
        }}
        className="space-y-3"
      >
        <ErrorNote error={change.error} />
        <PasswordField
          label="รหัสผ่านปัจจุบัน"
          value={current}
          onChange={setCurrent}
          error={show('current')}
          autoComplete="current-password"
        />
        <PasswordField
          label="รหัสผ่านใหม่"
          hint={`อย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`}
          value={next}
          onChange={setNext}
          error={show('next')}
          autoComplete="new-password"
        />
        <PasswordField
          label="ยืนยันรหัสผ่านใหม่"
          value={confirm}
          onChange={setConfirm}
          error={show('confirm')}
          autoComplete="new-password"
        />
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button type="button" onClick={onClose} className={button('secondary', 'lg')}>
            ยกเลิก
          </button>
          <button type="submit" disabled={change.isPending} className={button('primary', 'lg')}>
            {change.isPending ? 'กำลังบันทึก...' : 'เปลี่ยนรหัสผ่าน'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** ช่องรหัสผ่าน + ข้อความผิดใต้ช่อง — ใช้ซ้ำในหน้าพนักงานด้วย */
export function PasswordField({
  label,
  hint,
  value,
  onChange,
  error,
  autoComplete,
}: Readonly<{
  label: string
  hint?: string
  value: string
  onChange: (value: string) => void
  error: string
  autoComplete: 'current-password' | 'new-password'
}>) {
  return (
    <label className="block text-sm">
      <span className={fieldLabel}>{label}</span>
      {hint && <span className="ml-1 text-sm text-gray-600">({hint})</span>}
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        className={`${field} ${error ? 'border-danger' : ''}`}
      />
      {error && (
        <span role="alert" className="mt-1 block text-sm font-semibold text-danger-ink">
          {error}
        </span>
      )}
    </label>
  )
}
