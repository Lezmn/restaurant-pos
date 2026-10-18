import { useEffect, useRef, type ReactNode } from 'react'

/**
 * สแตกของกล่องที่เปิดอยู่ทั้งแอป (เรียงจากล่างขึ้นบน)
 *
 * ต้องมีเพราะกล่องซ้อนกันได้ เช่น กล่องยืนยันลบตัวเลือก เปิดทับฟอร์มแก้เมนู แล้ว:
 *   - Esc ต้องปิดเฉพาะกล่องบนสุด ไม่ใช่ปิดรูดทีเดียวทุกชั้น
 *   - พื้นหลังต้องยังล็อกสกรอลล์อยู่จนกว่ากล่องสุดท้ายจะปิด
 *
 * ดัก Esc ที่ document แทนที่จะดักที่ตัว <dialog> เพราะพอกล่องบนถูก unmount
 * เบราว์เซอร์ไม่ได้คืนโฟกัสกลับเข้ากล่องที่อยู่ข้างล่าง (โฟกัสตกไปที่ body)
 * ถ้าดักที่ element กล่องล่างจะรับ Esc ต่อไม่ได้เลย
 */
const modalStack: symbol[] = []

/**
 * กล่องซ้อนกลางจอ — ใช้ <dialog> ของเบราว์เซอร์จริง ไม่ใช่ div + role="dialog"
 *
 * showModal() แถมมาให้ฟรีโดยไม่ต้องเขียนเอง:
 *   - focus trap: Tab วนอยู่แต่ในกล่อง ไม่หลุดไปหลังฉาก
 *   - โฟกัสช่องแรกให้อัตโนมัติ
 *   - อยู่ top layer จึงลอยเหนือทุกอย่างโดยไม่ต้องไล่จัด z-index
 */
export function Modal({
  title,
  onClose,
  children,
}: Readonly<{
  title: string
  onClose: () => void
  children: ReactNode
}>) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  // เก็บ onClose ล่าสุดไว้ใน ref เพื่อให้ effect ด้านล่างรันแค่ตอน mount
  // ไม่งั้นพ่อที่ส่ง inline arrow มา (identity ใหม่ทุก render) จะทำให้กล่องถูกเปิดใหม่
  // ทุกครั้งที่ข้อมูลข้างในรีเฟรช แล้วโฟกัสกระโดดกลับช่องแรก
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()

    const id = Symbol('modal')
    modalStack.push(id)
    document.body.style.overflow = 'hidden'

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // ไม่ใช่กล่องบนสุด → ปล่อยให้กล่องบนจัดการ
      if (modalStack[modalStack.length - 1] !== id) return
      // กัน close-watcher ของเบราว์เซอร์ปิด <dialog> เอง ต้องให้พ่อเป็นคนสั่ง unmount
      // ไม่งั้น DOM ปิดไปแล้วแต่ state ฝั่ง React ยังคิดว่าเปิดอยู่ กดเปิดใหม่ไม่ขึ้น
      e.preventDefault()
      onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)

    return () => {
      document.removeEventListener('keydown', onKey)
      const index = modalStack.indexOf(id)
      if (index >= 0) modalStack.splice(index, 1)
      if (modalStack.length === 0) document.body.style.overflow = ''
      // สั่ง close() เอง — React ถอด element ทิ้งเฉย ๆ เบราว์เซอร์จะไม่เอาออกจาก top layer ให้
      if (dialog.open) dialog.close()
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      aria-label={title}
      // เผื่อกรณีที่ปิดมาจากทางอื่นที่ไม่ใช่ Esc (เช่น ปุ่ม back ของ Android)
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      // คลิกฉากหลัง: เนื้อหาอยู่ใน <div> ลูก คลิกโดนเนื้อหา target จะเป็น div นั้น
      // จะเท่ากับตัว <dialog> ก็ต่อเมื่อคลิกพื้นที่ว่างรอบกล่องเท่านั้น
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose()
      }}
      className="print-shell m-0 h-full max-h-none w-full max-w-none items-center justify-center bg-transparent p-4 backdrop:bg-black/40 open:flex"
    >
      <div className="print-shell max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-lg border-2 border-gray-300 bg-white p-5 shadow-xl">
        <h2 className="mb-4 text-center text-lg font-bold text-black print:hidden">
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  )
}
