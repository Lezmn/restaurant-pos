import { sizedImageUrl } from '@/lib/image-url'
import { useState } from 'react'

/**
 * รูปอาหาร — เมนูที่ยังไม่ได้ใส่ imageUrl หรือโหลดรูปไม่ขึ้น (ลิงก์เสีย/โดเมนปิด)
 * วาดพื้นครีมอ่อนพร้อมตัวอักษรแรกของชื่อเมนูแทน
 * (ใช้โทนอ่อนเพื่อให้ตัดกับการ์ดสีส้ม เหมือนตอนมีรูปจริง)
 *
 * width = ความกว้างที่แสดงจริงโดยประมาณ (px) ใช้ขอรูปขนาดพอดีจาก CDN — ค่าเริ่มต้นพอสำหรับการ์ดเมนู
 */
export function FoodImage({
  src,
  alt,
  className = '',
  width = 240,
}: Readonly<{
  src: string | null
  alt: string
  className?: string
  width?: number
}>) {
  // จำ src ที่โหลดไม่ขึ้นไว้ — ถ้าแก้ลิงก์ใหม่ (src เปลี่ยน) จะลองโหลดอีกรอบเอง
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  if (src && src !== failedSrc) {
    return (
      <img
        src={sizedImageUrl(src, width)}
        alt={alt}
        loading="lazy"
        // ถอดรหัสรูปนอก main thread — ไม่ขวางการเปลี่ยนหน้า
        decoding="async"
        onError={() => setFailedSrc(src)}
        className={`h-full w-full object-cover ${className}`}
      />
    )
  }

  return (
    <div
      role="img"
      aria-label={alt}
      className={`flex h-full w-full items-center justify-center bg-brand-50 ${className}`}
    >
      <span className="text-3xl font-bold text-brand-100 sm:text-4xl">
        {alt.slice(0, 1)}
      </span>
    </div>
  )
}
