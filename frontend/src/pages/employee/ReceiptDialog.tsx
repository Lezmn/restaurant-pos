import { useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { button } from '@/components/ui/styles'
import { formatBaht } from '@/lib/format'
import { RESTAURANT_NAME } from '@/lib/config'
import { printSettings } from '@/lib/print-settings'
import { PaymentMethod, SlipStatus } from '@/types/enums'
import type { Payment } from '@/types/models'

const methodLabel: Record<string, string> = {
  [PaymentMethod.CASH]: 'เงินสด',
  [PaymentMethod.PROMPTPAY]: 'PromptPay',
}

const issuedAt = (iso: string) =>
  new Date(iso).toLocaleString('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

/** ใบเสร็จหลังรับชำระเงิน — พิมพ์ได้ด้วย .print-area เหมือนป้าย QR */
export function ReceiptDialog({
  payment,
  tendered = null,
  justPaid = false,
  onClose,
}: Readonly<{
  payment: Payment
  /** เงินที่ลูกค้ายื่นมา (เงินสด รับเงินเพิ่งเสร็จ) — โชว์เงินทอนให้แคชเชียร์ ไม่พิมพ์ลงกระดาษ */
  tendered?: number | null
  /** เพิ่งรับเงินเสร็จ (ไม่ใช่เปิดดูย้อนหลัง) — เครื่องที่เปิด "พิมพ์ทันที" ไว้จะสั่งพิมพ์เอง */
  justPaid?: boolean
  onClose: () => void
}>) {
  const receipt = payment.receipt
  // หมายเหตุอยู่ใน DB แล้ว — เปิดใบเสร็จย้อนหลังจาก PaidBills ก็เห็นเหมือนตอนพิมพ์ครั้งแรก
  const note = receipt?.note ?? payment.note
  const [autoPrint, setAutoPrint] = useState(printSettings.getAutoPrintReceipt)

  // ตัดสินตอนเปิดกล่องครั้งเดียว — ติ๊กเปิดทีหลังมีผลกับใบถัดไป ไม่พิมพ์ใบนี้ซ้ำ
  const [printOnOpen] = useState(() => justPaid && printSettings.getAutoPrintReceipt())
  // effect ของ Modal (ลูก) รันก่อน — ถึงตรงนี้ <dialog> showModal แล้ว เลื่อนไป task ถัดไปพอให้ render เสร็จ
  // ใช้ setTimeout ไม่ใช้ requestAnimationFrame: rAF ไม่ทำงานตอนหน้าต่างถูกบังหรือย่อ = ใบเสร็จไม่ออก
  // ตั้ง ref ตอนพิมพ์จริง: StrictMode รัน effect 2 รอบ รอบแรกถูก clear ไป — ref กันพิมพ์ซ้ำ 2 ใบ
  // Chrome ที่เปิด --kiosk-printing จะพิมพ์ออกเครื่องพิมพ์หลักเลยโดยไม่ถาม (docs/PRINTING.md)
  const printedRef = useRef(false)
  useEffect(() => {
    if (!printOnOpen || !receipt || printedRef.current) return
    const timer = setTimeout(() => {
      printedRef.current = true
      window.print()
    })
    return () => clearTimeout(timer)
  }, [printOnOpen, receipt])

  if (!receipt) {
    return (
      <Modal title="ใบเสร็จ" onClose={onClose}>
        <p className="text-sm text-gray-600">ไม่พบใบเสร็จของรายการนี้</p>
      </Modal>
    )
  }

  return (
    <Modal title="ใบเสร็จรับเงิน" onClose={onClose}>
      {/* ยืนยันว่ารับเงินแล้ว + ทอนเท่าไหร่ — จังหวะที่แคชเชียร์กำลังหยิบเงินทอนพอดี */}
      {tendered !== null && (
        <output className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg bg-gray-100 px-4 py-3 print:hidden">
          <span className="text-sm text-gray-700">
            รับเงิน <b className="text-black tabular-nums">{formatBaht(tendered)}</b>
          </span>
          <span className="text-lg font-bold text-black tabular-nums">
            ทอน {formatBaht(Math.max(0, tendered - payment.amount))}
          </span>
        </output>
      )}
      {/* แจ้งแคชเชียร์เท่านั้น ไม่ติดไปกับกระดาษ */}
      {payment.slip?.status === SlipStatus.PENDING && (
        <p className="mb-3 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 print:hidden">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="mt-0.5 h-4 w-4 shrink-0">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>
          ยังตรวจสลิปไม่ได้ ({payment.slip.message}) — บันทึกบิลไว้แล้ว ระบบจะตรวจซ้ำเอง
          ถ้าไม่ผ่านจะขึ้นในหน้า Check และ Dashboard
          </span>
        </p>
      )}
      <div className="print-area print-receipt w-full">
        <div className="text-center">
          <p className="text-lg font-bold text-black">{RESTAURANT_NAME}</p>
          <p className="mt-1 text-sm text-gray-600">
            ใบเสร็จรับเงิน / RECEIPT
          </p>
        </div>

        <dl className="mt-4 space-y-1 border-y border-dashed border-gray-300 py-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-600">เลขที่</dt>
            <dd className="font-semibold text-black">{receipt.number}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-600">โต๊ะ</dt>
            <dd className="font-semibold text-black">{receipt.tableName}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-600">วันที่</dt>
            <dd className="text-black">{issuedAt(receipt.issuedAt)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-600">ชำระโดย</dt>
            <dd className="font-semibold text-black">
              {methodLabel[payment.method]}
            </dd>
          </div>
        </dl>

        <ul className="mt-3 space-y-2 text-sm">
          {receipt.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-3">
              <span className="min-w-0 text-gray-800">
                {item.quantity}× {item.name}
                {item.note && (
                  <span className="block text-xs text-gray-500">
                    {item.note}
                  </span>
                )}
              </span>
              <span className="shrink-0 tabular-nums text-black">
                {formatBaht(item.lineTotal)}
              </span>
            </li>
          ))}
        </ul>

        <dl className="mt-3 space-y-1 border-t border-dashed border-gray-300 pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-600">รวม</dt>
            <dd className="tabular-nums text-black">
              {formatBaht(receipt.subtotal)}
            </dd>
          </div>
          {receipt.discount > 0 && (
            <div className="flex justify-between">
              <dt className="text-gray-600">ส่วนลด</dt>
              <dd className="tabular-nums text-danger-ink">
                -{formatBaht(receipt.discount)}
              </dd>
            </div>
          )}
          <div className="flex justify-between text-base font-bold">
            <dt className="text-black">สุทธิ</dt>
            <dd className="tabular-nums text-black">
              {formatBaht(receipt.total)}
            </dd>
          </div>
        </dl>

        {note && (
          <p className="mt-3 border-t border-dashed border-gray-300 pt-3 text-sm text-gray-700">
            หมายเหตุ: {note}
          </p>
        )}

        <p className="mt-4 text-center text-xs text-gray-500">
          ขอบคุณที่ใช้บริการ
        </p>
      </div>

      {/* ค่าของเครื่องนี้ — เปิดเฉพาะเครื่องที่ต่อเครื่องพิมพ์ใบเสร็จ */}
      <label className="mt-5 grid cursor-pointer grid-cols-[auto_1fr] gap-x-2 text-sm text-gray-700 print:hidden">
        <input
          type="checkbox"
          checked={autoPrint}
          onChange={(e) => {
            setAutoPrint(e.target.checked)
            printSettings.setAutoPrintReceipt(e.target.checked)
          }}
          className="row-span-2 mt-0.5 h-4 w-4 accent-brand-500"
        />
        <span>พิมพ์ใบเสร็จทันทีหลังรับเงิน</span>
        <span className="text-xs text-gray-500">ตั้งเฉพาะเครื่องนี้ — เปิดที่เครื่องที่ต่อเครื่องพิมพ์ใบเสร็จ</span>
      </label>

      <div className="mt-4 grid grid-cols-2 gap-3 print:hidden">
        <button type="button" onClick={onClose} className={button('secondary', 'lg')}>
          ปิด
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className={button('primary', 'lg')}
        >
          พิมพ์ใบเสร็จ
        </button>
      </div>
    </Modal>
  )
}
