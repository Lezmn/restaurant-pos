import { Modal } from '@/components/ui/Modal'
import { formatBaht } from '@/lib/format'
import { RESTAURANT_NAME } from '@/lib/config'
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
  onClose,
}: {
  payment: Payment
  onClose: () => void
}) {
  const receipt = payment.receipt
  // หมายเหตุอยู่ใน DB แล้ว — เปิดใบเสร็จย้อนหลังจาก PaidBills ก็เห็นเหมือนตอนพิมพ์ครั้งแรก
  const note = receipt?.note ?? payment.note

  if (!receipt) {
    return (
      <Modal title="ใบเสร็จ" onClose={onClose}>
        <p className="text-sm text-gray-500">ไม่พบใบเสร็จของรายการนี้</p>
      </Modal>
    )
  }

  return (
    <Modal title="ใบเสร็จรับเงิน" onClose={onClose}>
      {/* แจ้งแคชเชียร์เท่านั้น ไม่ติดไปกับกระดาษ */}
      {payment.slip?.status === SlipStatus.PENDING && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 print:hidden">
          ⏳ ยังตรวจสลิปไม่ได้ ({payment.slip.message}) — บันทึกบิลไว้แล้ว ระบบจะตรวจซ้ำเอง
          ถ้าไม่ผ่านจะขึ้นในหน้า Check และ Dashboard
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
              <dd className="tabular-nums text-danger">
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

      <div className="mt-5 grid grid-cols-2 gap-3 print:hidden">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border-2 border-gray-300 py-2.5 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
        >
          ปิด
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-brand-300 py-2.5 text-sm font-bold text-white transition hover:bg-brand-400"
        >
          พิมพ์ใบเสร็จ
        </button>
      </div>
    </Modal>
  )
}
