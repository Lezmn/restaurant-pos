import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ErrorNote } from '@/components/ui/ErrorNote'
import { LoadError } from '@/components/ui/LoadError'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { toast } from '@/components/ui/toast'
import { button, field, fieldLabel } from '@/components/ui/styles'
import {
  MIN_PASSWORD_LENGTH,
  PasswordField,
} from '@/components/layout/ChangePasswordDialog'
import { toLoginEmail } from '@/features/auth/api'
import { useAuth } from '@/features/auth/use-auth'
import type { StaffUser } from '@/features/users/api'
import { useCreateUser, useDeleteUser, useUpdateUser, useUsers } from '@/features/users/hooks'
import { LOGIN_EMAIL_DOMAIN } from '@/lib/config'
import { Role } from '@/types/enums'
import { useState } from 'react'

/** สิทธิ์แต่ละแบบ — บอกเป็นงานที่ทำได้ ไม่ใช่ชื่อ role เฉย ๆ เจ้าของร้านจะได้เลือกถูก */
const ROLE_INFO: Record<Role, { label: string; detail: string }> = {
  [Role.STAFF]: { label: 'พนักงานหน้าร้าน', detail: 'เปิดโต๊ะ รับออเดอร์ เก็บเงิน' },
  [Role.KITCHEN]: { label: 'ครัว', detail: 'ดูคิวอาหาร ปิดเมนู/วัตถุดิบที่หมด' },
  [Role.ADMIN]: { label: 'เจ้าของร้าน', detail: 'ทุกหน้า รวมถึงรายงานและจัดการพนักงาน' },
}
const ROLES = [Role.STAFF, Role.KITCHEN, Role.ADMIN] as const

/** ชื่อผู้ใช้ที่พิมพ์ login ได้สะดวกบนแท็บเล็ต — หรือจะใส่อีเมลเต็มก็ได้ */
const USERNAME_PATTERN = /^[a-z0-9._-]+$/

/**
 * หน้าจัดการพนักงาน — เข้าได้เฉพาะ ADMIN (route + @Roles(ADMIN) ที่ backend)
 * พนักงานลาออก = ปิดใช้งาน ไม่ใช่ลบ (ประวัติปิดยอด/เบิกเงินยังผูกกับคนเดิม)
 */
export function UsersPage() {
  const me = useAuth((s) => s.user)
  const usersQuery = useUsers()
  const users = usersQuery.data
  const update = useUpdateUser()
  const remove = useDeleteUser()

  const [editing, setEditing] = useState<StaffUser | 'new' | null>(null)
  const [resetting, setResetting] = useState<StaffUser | null>(null)
  const [deactivating, setDeactivating] = useState<StaffUser | null>(null)
  const [deleting, setDeleting] = useState<StaffUser | null>(null)

  const activeCount = users?.filter((u) => u.isActive).length ?? 0

  const reactivate = (user: StaffUser) =>
    update.mutate(
      { id: user.id, input: { isActive: true } },
      { onSuccess: () => toast(`เปิดใช้งาน ${user.name} แล้ว`) },
    )

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="พนักงาน"
        description={
          users
            ? `ใช้งานอยู่ ${activeCount} คน · ปิดใช้งาน ${users.length - activeCount} คน`
            : 'เพิ่มบัญชีพนักงานและกำหนดสิทธิ์'
        }
        action={
          <button
            type="button"
            onClick={() => setEditing('new')}
            className={`${button('primary', 'lg')} shrink-0`}
          >
            เพิ่มพนักงาน
          </button>
        }
      />

      {usersQuery.isError && (
        <LoadError
          what="รายชื่อพนักงาน"
          stale={Boolean(users)}
          error={usersQuery.error}
          onRetry={() => usersQuery.refetch()}
        />
      )}
      <ErrorNote error={update.error} />

      {usersQuery.isPending && <p className="text-sm text-gray-600">กำลังโหลด...</p>}

      <ul className="grid gap-3 md:grid-cols-2">
        {users?.map((user) => {
          const isMe = user.id === me?.id
          return (
            <li
              key={user.id}
              className={`rounded-xl border-2 p-4 ${
                user.isActive ? 'border-gray-200 bg-white' : 'border-gray-200 bg-gray-50'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={`truncate font-bold ${user.isActive ? 'text-black' : 'text-gray-500'}`}>
                    {user.name}
                    {isMe && <span className="ml-1 font-normal text-gray-600">(คุณ)</span>}
                  </p>
                  <p className="truncate text-sm text-gray-600">ชื่อผู้ใช้: {user.username}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-semibold ${
                    user.role === Role.ADMIN
                      ? 'bg-brand-100 text-brand-500'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {ROLE_INFO[user.role].label}
                </span>
              </div>

              {!user.isActive && (
                <p className="mt-2 text-sm font-semibold text-danger-ink">
                  ปิดใช้งาน — เข้าสู่ระบบไม่ได้
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-200 pt-3">
                <button
                  type="button"
                  onClick={() => setEditing(user)}
                  aria-label={`แก้ไข ${user.name}`}
                  className={button('outline', 'sm')}
                >
                  แก้ไข
                </button>
                {!isMe && (
                  <button
                    type="button"
                    onClick={() => setResetting(user)}
                    aria-label={`ตั้งรหัสผ่านใหม่ให้ ${user.name}`}
                    className={button('outline', 'sm')}
                  >
                    ตั้งรหัสผ่านใหม่
                  </button>
                )}
                {/* บัญชีตัวเองปิด/ลบไม่ได้ — กดพลาดแล้วหลุดออกจากหน้าจัดการ (backend ก็ห้าม) */}
                {!isMe &&
                  (user.isActive ? (
                    <button
                      type="button"
                      onClick={() => setDeactivating(user)}
                      aria-label={`ปิดใช้งาน ${user.name}`}
                      className={button('danger-outline', 'sm')}
                    >
                      ปิดใช้งาน
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={update.isPending}
                      onClick={() => reactivate(user)}
                      aria-label={`เปิดใช้งาน ${user.name}`}
                      className={button('outline', 'sm')}
                    >
                      เปิดใช้งาน
                    </button>
                  ))}
                {!isMe && (
                  <button
                    type="button"
                    onClick={() => setDeleting(user)}
                    aria-label={`ลบ ${user.name}`}
                    className={`${button('danger-outline', 'sm')} ml-auto`}
                  >
                    ลบ
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {editing && (
        <UserFormDialog
          user={editing === 'new' ? undefined : editing}
          isMe={editing !== 'new' && editing.id === me?.id}
          onClose={() => setEditing(null)}
        />
      )}

      {resetting && <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} />}

      {deactivating && (
        <ConfirmDialog
          title="ปิดใช้งานพนักงาน"
          subject={deactivating.name}
          detail={`ชื่อผู้ใช้ ${deactivating.username} · ${ROLE_INFO[deactivating.role].label}`}
          consequence="เข้าสู่ระบบไม่ได้ และเครื่องที่ login ค้างไว้จะหลุดทันที ประวัติปิดยอด/บิลยังอยู่ครบ เปิดใช้งานคืนได้ทุกเมื่อ"
          confirmLabel="ปิดใช้งาน"
          pendingLabel="กำลังปิด..."
          isPending={update.isPending}
          error={update.error}
          onCancel={() => {
            update.reset()
            setDeactivating(null)
          }}
          onConfirm={() =>
            update.mutate(
              { id: deactivating.id, input: { isActive: false } },
              {
                onSuccess: () => {
                  toast(`ปิดใช้งาน ${deactivating.name} แล้ว`)
                  setDeactivating(null)
                },
              },
            )
          }
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="ลบพนักงาน"
          subject={deleting.name}
          detail={`ชื่อผู้ใช้ ${deleting.username} · ${ROLE_INFO[deleting.role].label}`}
          consequence="ลบแล้วกู้คืนไม่ได้ ถ้าพนักงานคนนี้เคยปิดยอดหรือเบิกเงินจะลบไม่ได้ — ใช้ “ปิดใช้งาน” แทน"
          confirmLabel="ลบพนักงาน"
          pendingLabel="กำลังลบ..."
          isPending={remove.isPending}
          error={remove.error}
          onCancel={() => {
            remove.reset()
            setDeleting(null)
          }}
          onConfirm={() =>
            remove.mutate(deleting.id, {
              onSuccess: () => {
                toast(`ลบ ${deleting.name} แล้ว`)
                setDeleting(null)
              },
            })
          }
        />
      )}
    </div>
  )
}

/** เพิ่มพนักงานใหม่ / แก้ชื่อและสิทธิ์ — ชื่อผู้ใช้แก้ไม่ได้หลังสร้าง (เป็นตัว login) */
function UserFormDialog({
  user,
  isMe,
  onClose,
}: Readonly<{ user?: StaffUser; isMe: boolean; onClose: () => void }>) {
  const create = useCreateUser()
  const update = useUpdateUser()
  const [name, setName] = useState(user?.name ?? '')
  const [username, setUsername] = useState('')
  const [role, setRole] = useState<Role>(user?.role ?? Role.STAFF)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [attempted, setAttempted] = useState(false)

  const isNew = !user
  const login = username.trim().toLowerCase()
  const errors = {
    name: name.trim() ? '' : 'กรอกชื่อพนักงาน',
    username: !isNew
      ? ''
      : !login
        ? 'กรอกชื่อผู้ใช้'
        : login.includes('@') || USERNAME_PATTERN.test(login)
          ? ''
          : 'ใช้ได้แค่ a-z, 0-9 และ . _ -',
    password: !isNew || password.length >= MIN_PASSWORD_LENGTH
      ? ''
      : `รหัสผ่านอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`,
    confirm: !isNew || confirm === password ? '' : 'รหัสผ่านสองช่องไม่ตรงกัน',
  }
  const invalid = Object.values(errors).some(Boolean)
  const show = (key: keyof typeof errors) => (attempted ? errors[key] : '')
  const pending = create.isPending || update.isPending

  const submit = () => {
    setAttempted(true)
    if (invalid) return
    const done = (message: string) => () => {
      toast(message)
      onClose()
    }
    if (isNew) {
      create.mutate(
        { name: name.trim(), email: toLoginEmail(login), password, role },
        { onSuccess: done(`เพิ่ม ${name.trim()} แล้ว — login ด้วยชื่อผู้ใช้ ${login}`) },
      )
    } else {
      update.mutate(
        { id: user.id, input: { name: name.trim(), ...(isMe ? {} : { role }) } },
        { onSuccess: done(`บันทึก ${name.trim()} แล้ว`) },
      )
    }
  }

  return (
    <Modal title={isNew ? 'เพิ่มพนักงาน' : `แก้ไข ${user.name}`} onClose={onClose}>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        className="space-y-3"
      >
        <ErrorNote error={create.error ?? update.error} />

        <label className="block text-sm">
          <span className={fieldLabel}>ชื่อที่แสดง</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="เช่น สมชาย (แคชเชียร์เช้า)"
            maxLength={100}
            aria-invalid={Boolean(show('name'))}
            className={`${field} ${show('name') ? 'border-danger' : ''}`}
          />
          <FieldError message={show('name')} />
        </label>

        {isNew ? (
          <label className="block text-sm">
            <span className={fieldLabel}>ชื่อผู้ใช้ (ใช้ตอน login)</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="เช่น somchai"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={Boolean(show('username'))}
              className={`${field} ${show('username') ? 'border-danger' : ''}`}
            />
            <span className="mt-1 block text-sm text-gray-600">
              เก็บเป็น {login ? toLoginEmail(login) : `ชื่อผู้ใช้@${LOGIN_EMAIL_DOMAIN}`}
            </span>
            <FieldError message={show('username')} />
          </label>
        ) : (
          <p className="text-sm text-gray-600">
            ชื่อผู้ใช้: <b className="text-black">{user.username}</b> (เปลี่ยนไม่ได้)
          </p>
        )}

        <fieldset>
          <legend className={fieldLabel}>สิทธิ์</legend>
          {isMe && (
            <p className="text-sm text-gray-600">เปลี่ยนสิทธิ์ของบัญชีตัวเองไม่ได้</p>
          )}
          <div className="mt-2 grid gap-2">
            {ROLES.map((r) => (
              <label
                key={r}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border-2 p-3 ${
                  role === r ? 'border-brand-400 bg-brand-50' : 'border-gray-200 bg-white'
                } ${isMe ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <input
                  type="radio"
                  name="role"
                  value={r}
                  checked={role === r}
                  disabled={isMe}
                  onChange={() => setRole(r)}
                  className="mt-1 h-4 w-4"
                />
                <span>
                  <span className="block font-bold text-black">{ROLE_INFO[r].label}</span>
                  <span className="block text-sm text-gray-600">{ROLE_INFO[r].detail}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {isNew && (
          <>
            <PasswordField
              label="รหัสผ่านเริ่มต้น"
              hint={`อย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`}
              value={password}
              onChange={setPassword}
              error={show('password')}
              autoComplete="new-password"
            />
            <PasswordField
              label="ยืนยันรหัสผ่าน"
              value={confirm}
              onChange={setConfirm}
              error={show('confirm')}
              autoComplete="new-password"
            />
            <p className="text-sm text-gray-600">
              บอกรหัสนี้กับพนักงานด้วยตัวเอง แล้วให้กด “เปลี่ยนรหัสผ่าน” ที่หัวจอหลัง login ครั้งแรก
            </p>
          </>
        )}

        <div className="grid grid-cols-2 gap-3 pt-2">
          <button type="button" onClick={onClose} className={button('secondary', 'lg')}>
            ยกเลิก
          </button>
          <button type="submit" disabled={pending} className={button('primary', 'lg')}>
            {pending ? 'กำลังบันทึก...' : isNew ? 'เพิ่มพนักงาน' : 'บันทึก'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** พนักงานลืมรหัส — เจ้าของร้านตั้งรหัสใหม่ให้ (ไม่ต้องรู้รหัสเดิม) */
function ResetPasswordDialog({
  user,
  onClose,
}: Readonly<{ user: StaffUser; onClose: () => void }>) {
  const update = useUpdateUser()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [attempted, setAttempted] = useState(false)

  const errors = {
    password:
      password.length >= MIN_PASSWORD_LENGTH ? '' : `รหัสผ่านอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`,
    confirm: confirm === password ? '' : 'รหัสผ่านสองช่องไม่ตรงกัน',
  }
  const show = (key: keyof typeof errors) => (attempted ? errors[key] : '')

  return (
    <Modal title={`ตั้งรหัสผ่านใหม่ให้ ${user.name}`} onClose={onClose}>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          setAttempted(true)
          if (errors.password || errors.confirm) return
          update.mutate(
            { id: user.id, input: { password } },
            {
              onSuccess: () => {
                toast(`ตั้งรหัสผ่านใหม่ให้ ${user.name} แล้ว`)
                onClose()
              },
            },
          )
        }}
        className="space-y-3"
      >
        <ErrorNote error={update.error} />
        <p className="text-sm text-gray-600">
          ชื่อผู้ใช้ <b className="text-black">{user.username}</b> — รหัสเดิมใช้ไม่ได้ทันทีหลังบันทึก
        </p>
        <PasswordField
          label="รหัสผ่านใหม่"
          hint={`อย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`}
          value={password}
          onChange={setPassword}
          error={show('password')}
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
          <button type="submit" disabled={update.isPending} className={button('primary', 'lg')}>
            {update.isPending ? 'กำลังบันทึก...' : 'ตั้งรหัสผ่าน'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function FieldError({ message }: Readonly<{ message: string }>) {
  if (!message) return null
  return (
    <span role="alert" className="mt-1 block text-sm font-semibold text-danger-ink">
      {message}
    </span>
  )
}
