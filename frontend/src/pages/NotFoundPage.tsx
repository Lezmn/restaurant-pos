import { Link } from 'react-router-dom'

/**
 * เดิม path ที่ไม่รู้จักถูก redirect ไป /employee ทั้งหมด
 * ทำให้ลูกค้าที่ URL เพี้ยนถูกโยนเข้าหน้า login พนักงานโดยไม่รู้เรื่อง
 */
export function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-5xl font-bold text-brand-300">404</p>
      <h1 className="text-xl font-bold text-ink">ไม่พบหน้านี้</h1>
      <p className="max-w-md text-sm text-gray-600">
        ถ้าคุณเป็นลูกค้า กรุณาสแกน QR ที่โต๊ะอีกครั้ง
        เพราะลิงก์สั่งอาหารจะผูกกับโต๊ะที่นั่งอยู่
      </p>

      <Link
        to="/employee"
        className="rounded-full border-2 border-brand-300 px-6 py-2.5 text-sm font-bold text-brand-400"
      >
        เข้าสู่ระบบพนักงาน
      </Link>
    </div>
  )
}
