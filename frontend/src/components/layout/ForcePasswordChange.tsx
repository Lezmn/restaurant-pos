import { ChangePasswordForm } from '@/components/layout/ChangePasswordDialog'
import { toast } from '@/components/ui/toast'
import { useAuth } from '@/features/auth/use-auth'
import { RESTAURANT_NAME } from '@/lib/config'

/**
 * หน้าบังคับตั้งรหัสใหม่ — บัญชี ADMIN ที่ยังใช้รหัสชั่วคราว (ส่งมอบระบบ / ADMIN อีกคนตั้งให้)
 * แทนที่ทุกหน้าจนกว่าจะเปลี่ยนเสร็จ (backend ก็บล็อก API อื่นด้วย PasswordChangeGuard)
 */
export function ForcePasswordChange() {
  const user = useAuth((s) => s.user)
  const updateUser = useAuth((s) => s.updateUser)
  const signOut = useAuth((s) => s.signOut)

  return (
    <div className="flex min-h-dvh items-center justify-center bg-brand-50 px-4 py-8">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-brand-500">{RESTAURANT_NAME}</p>
        <h1 className="mt-1 text-2xl font-bold text-black">ตั้งรหัสผ่านใหม่ก่อนใช้งาน</h1>
        <p className="mt-2 text-sm text-gray-600">
          บัญชี <b className="text-black">{user?.name}</b> ยังใช้รหัสผ่านชั่วคราวที่คนอื่นตั้งให้
          ตั้งรหัสใหม่ที่รู้คนเดียว แล้วจะเข้าใช้งานได้ทันที
        </p>
        <div className="mt-5">
          <ChangePasswordForm
            currentLabel="รหัสผ่านชั่วคราว (ที่ใช้ login เมื่อกี้)"
            onDone={() => {
              updateUser({ mustChangePassword: false })
              toast('ตั้งรหัสผ่านใหม่แล้ว')
            }}
          />
        </div>
        <button
          type="button"
          onClick={signOut}
          className="mt-4 w-full text-center text-sm font-semibold text-gray-600 underline-offset-2 hover:underline"
        >
          ออกจากระบบ
        </button>
      </div>
    </div>
  )
}
