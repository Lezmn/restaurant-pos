/**
 * รูปอาหาร — เมนูที่ยังไม่ได้ใส่ imageUrl (หรือโหลดรูปไม่ขึ้น)
 * วาดพื้นครีมอ่อนพร้อมตัวอักษรแรกของชื่อเมนูแทน
 * (ใช้โทนอ่อนเพื่อให้ตัดกับการ์ดสีส้ม เหมือนตอนมีรูปจริง)
 */
export function FoodImage({
  src,
  alt,
  className = '',
}: {
  src: string | null
  alt: string
  className?: string
}) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        loading="lazy"
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
