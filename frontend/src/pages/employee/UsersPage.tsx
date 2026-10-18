import { PageHeader } from '@/components/ui/PageHeader'

export function UsersPage() {
  return (
    <div>
      <PageHeader title="ผู้ใช้งาน" description="จัดการพนักงานและสิทธิ์" />
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
        ยังไม่ได้ทำหน้านี้ — ต่อกับ <code>/users</code> (เฉพาะ ADMIN) ทีหลัง
      </div>
    </div>
  )
}
