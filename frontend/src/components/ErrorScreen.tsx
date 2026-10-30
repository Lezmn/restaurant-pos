import { isRouteErrorResponse } from 'react-router-dom'

/**
 * โหลดไฟล์ของหน้าไม่ได้ — ส่วนใหญ่เพราะร้าน deploy เวอร์ชันใหม่ระหว่างที่เปิดหน้าค้างไว้
 * (ไฟล์ชื่อเดิมถูกลบไปแล้ว) หรือเน็ตหลุดตอนเปลี่ยนหน้า โหลดใหม่ก็หาย
 */
const isChunkLoadError = (error: unknown) =>
  error instanceof Error &&
  /dynamically imported module|Importing a module script failed|error loading dynamically/i.test(error.message)

const describe = (error: unknown) => {
  if (isRouteErrorResponse(error)) return `${error.status} ${error.statusText}`
  if (error instanceof Error) return `${error.name}: ${error.message}`
  return String(error)
}

/** ลูกค้าอยู่ใต้ /t/:token — กลับหน้าเมนูของโต๊ะตัวเอง ไม่ใช่โยนไปหน้า login พนักงาน */
const homePath = () => {
  const table = /^\/t\/[^/]+/.exec(window.location.pathname)
  return table ? table[0] : '/employee'
}

/**
 * หน้าที่แสดงตอนระบบพัง — ใช้ทั้ง errorElement ของ router และ ErrorBoundary ชั้นนอก
 * ห้ามใช้ hook ของ router ที่นี่ เพราะ ErrorBoundary อยู่นอก RouterProvider
 * เปลี่ยนหน้าด้วย <a href> (โหลดใหม่ทั้งหน้า) เพราะ state ในหน่วยความจำอาจพังไปแล้ว
 */
export function ErrorScreen({ error }: Readonly<{ error: unknown }>) {
  const chunk = isChunkLoadError(error)

  return (
    <div role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-white px-6 text-center">
      <span aria-hidden className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-500">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-8 w-8">
          {chunk ? (
            <path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" strokeLinejoin="round" />
          ) : (
            <>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7.5v5.5M12 16.5v.01" />
            </>
          )}
        </svg>
      </span>

      <h1 className="text-xl font-bold text-ink md:text-2xl">
        {chunk ? 'มีการอัปเดตระบบ' : 'ขออภัย ระบบขัดข้อง'}
      </h1>
      <p className="max-w-md text-sm text-gray-600 md:text-base">
        {chunk
          ? 'กดโหลดหน้าใหม่เพื่อใช้งานต่อ'
          : 'ลองโหลดหน้าใหม่อีกครั้ง ถ้ายังไม่หาย กรุณาแจ้งพนักงานที่ร้าน'}
      </p>

      <div className="mt-2 flex w-full max-w-xs flex-col gap-3">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-12 rounded-2xl bg-brand-500 px-6 text-base font-bold text-white"
        >
          โหลดหน้าใหม่
        </button>
        <a
          href={homePath()}
          className="flex min-h-12 items-center justify-center rounded-2xl border-2 border-brand-500 bg-white px-6 text-base font-bold text-brand-500 hover:bg-brand-50"
        >
          กลับหน้าแรก
        </a>
      </div>

      {/* รายละเอียดทางเทคนิคให้ dev เท่านั้น — ลูกค้าเห็น stack trace แล้วไม่ได้อะไร */}
      {import.meta.env.DEV && (
        <details className="mt-4 w-full max-w-2xl text-left">
          <summary className="cursor-pointer text-xs font-semibold text-gray-600">รายละเอียด (เห็นเฉพาะตอน dev)</summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-gray-100 p-3 text-xs text-gray-700">
            {describe(error)}
            {error instanceof Error && error.stack ? `\n\n${error.stack}` : ''}
          </pre>
        </details>
      )}
    </div>
  )
}
