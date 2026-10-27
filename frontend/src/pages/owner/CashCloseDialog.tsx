import { ErrorNote } from '@/components/ui/ErrorNote'
import { Modal } from '@/components/ui/Modal'
import { button, field, fieldLabel } from '@/components/ui/styles'
import { useCreateCashClose } from '@/features/cash-closes/hooks'
import { formatBaht } from '@/lib/format'
import type { ApiCashClosePreview } from '@/types/api'
import { useState } from 'react'
import { DifferenceText } from '../employee/CashDrawerBar'
import { RequiredMark } from '@/components/ui/RequiredMark'

/**
 * ปิดยอดวันนี้ — นับเงินในลิ้นชักเทียบกับยอดที่ระบบคาดไว้ วันละครั้ง
 * อยู่หน้า "ปิดยอดเงินสด" ของเจ้าของร้าน (ย้ายมาจากหน้า Check ของแคชเชียร์)
 */
export function CashCloseDialog({
  preview,
  onClose,
}: Readonly<{
  preview: ApiCashClosePreview
  onClose: () => void
}>) {
  const createCashClose = useCreateCashClose()
  const [openingFloat, setOpeningFloat] = useState(
    preview.suggestedOpeningFloat === null ? '' : String(preview.suggestedOpeningFloat),
  )
  const [counted, setCounted] = useState('')
  const [note, setNote] = useState('')

  const floatNum = Number(openingFloat)
  const countedNum = Number(counted)
  const floatValid = openingFloat.trim() !== '' && Number.isFinite(floatNum) && floatNum >= 0
  const countedValid = counted.trim() !== '' && Number.isFinite(countedNum) && countedNum >= 0

  // ต้องคิดแบบเดียวกับ backend (cash-closes.service) — ตัวเลขที่บันทึกจริงมาจาก backend
  const expected = (floatValid ? floatNum : 0) + preview.cashSales - preview.drawerExpenses
  const difference = Math.round((countedNum - expected) * 100) / 100

  return (
    <Modal title="ปิดยอดวันนี้" onClose={onClose}>
      <ErrorNote error={createCashClose.error} />

      {preview.unpaidTableCount > 0 && (
        <p className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-sm text-gray-700">
          ยังมี <span className="font-bold">{preview.unpaidTableCount} โต๊ะ</span>{' '}
          ที่ยังไม่จ่าย — ถ้าปิดยอดตอนนี้ เงินที่เก็บทีหลังจะไม่อยู่ในยอดที่นับวันนี้
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!floatValid || !countedValid) return
          createCashClose.mutate(
            { openingFloat: floatNum, countedCash: countedNum, note },
            { onSuccess: onClose },
          )
        }}
      >
        <label className="block">
          <span className={fieldLabel}>เงินทอนตั้งต้น (ใส่ลิ้นชักไว้ตอนเปิดร้าน)<RequiredMark /></span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={openingFloat}
            onChange={(e) => setOpeningFloat(e.target.value)}
            className={field}
          />
        </label>

        <dl className="mt-3 space-y-1 rounded-lg bg-gray-100 px-4 py-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-600">เงินทอนตั้งต้น</dt>
            <dd className="tabular-nums">{formatBaht(floatValid ? floatNum : 0)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-600">+ รับเงินสด</dt>
            <dd className="tabular-nums">{formatBaht(preview.cashSales)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-600">− หยิบออกจากลิ้นชัก</dt>
            <dd className="text-danger-ink tabular-nums">{formatBaht(preview.drawerExpenses)}</dd>
          </div>
          <div className="flex justify-between border-t border-gray-200 pt-1 font-bold">
            <dt>ควรมีในลิ้นชัก</dt>
            <dd className="tabular-nums">{floatValid ? formatBaht(expected) : '-'}</dd>
          </div>
        </dl>

        <label className="mt-3 block">
          <span className={fieldLabel}>เงินที่นับได้จริง<RequiredMark /></span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
            className={`${field} border-2 border-brand-400 text-lg font-bold tabular-nums`}
          />
        </label>

        {countedValid && floatValid && (
          <p className="mt-2 text-right text-base">
            <DifferenceText value={difference} />
          </p>
        )}

        <p className="mt-2 text-sm text-gray-600">
          PromptPay วันนี้ {formatBaht(preview.promptpaySales)} — ไม่ได้อยู่ในลิ้นชัก
          ให้เทียบกับยอดเข้าในแอปธนาคาร
        </p>

        <label className="mt-3 block">
          <span className={fieldLabel}>หมายเหตุ</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder={difference !== 0 && countedValid ? 'เงินไม่ตรง — รู้สาเหตุไหม' : 'ไม่กรอกก็ได้'}
            className={`${field} resize-none`}
          />
        </label>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onClose}
            className={button('secondary', 'lg')}
          >
            ย้อนกลับ
          </button>
          <button
            type="submit"
            disabled={createCashClose.isPending || !floatValid || !countedValid}
            className={button('primary', 'lg')}
          >
            {createCashClose.isPending ? 'กำลังบันทึก...' : 'ยืนยันปิดยอด'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
