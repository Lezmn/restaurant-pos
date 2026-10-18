import { ErrorNote } from '@/components/ui/ErrorNote'
import { LoadError } from '@/components/ui/LoadError'
import { Modal } from '@/components/ui/Modal'
import { button, field, fieldLabel } from '@/components/ui/styles'
import {
  useCashClosePreview,
  useCreateCashClose,
} from '@/features/cash-closes/hooks'
import { useAddDrawerExpense } from '@/features/expenses/hooks'
import { formatBaht, formatTime } from '@/lib/format'
import type { ApiCashClose, ApiCashClosePreview } from '@/types/api'
import { ExpenseCategory } from '@/types/enums'
import { useState, type ReactNode } from 'react'

/** หมวดที่หยิบเงินจากลิ้นชักไปจ่ายกันจริง ๆ — ค่าเช่า/เงินเดือนไม่จ่ายจากลิ้นชัก */
const drawerCategories = [
  { value: ExpenseCategory.INGREDIENTS, label: 'วัตถุดิบ' },
  { value: ExpenseCategory.EQUIPMENT, label: 'อุปกรณ์' },
  { value: ExpenseCategory.OTHER, label: 'อื่น ๆ' },
] as const

const thaiDay = (ymd: string) =>
  new Date(`${ymd}T00:00:00`).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
  })

/** ผลต่างตอนปิดยอด: 0 = ตรง, บวก = เกิน, ลบ = ขาด */
function DifferenceText({ value }: { value: number }) {
  if (value === 0) return <span className="font-bold text-black">ตรงพอดี</span>
  return value > 0 ? (
    <span className="font-bold text-brand-500">เงินเกิน {formatBaht(value)}</span>
  ) : (
    <span className="font-bold text-danger-ink">เงินขาด {formatBaht(-value)}</span>
  )
}

/** แถวในสมุดลิ้นชัก — ป้ายซ้าย ตัวเลขชิดขวาแบบ tabular ให้หลักตรงกันเหมือนใบสรุปยอด */
function LedgerRow({
  label,
  value,
  strong = false,
  negative = false,
}: {
  label: ReactNode
  value: string
  strong?: boolean
  negative?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className={strong ? 'font-bold text-black' : 'text-gray-700'}>{label}</dt>
      <dd
        className={`tabular-nums ${strong ? 'text-lg font-bold' : 'font-semibold'} ${
          negative ? 'text-danger-ink' : 'text-black'
        }`}
      >
        {value}
      </dd>
    </div>
  )
}

/**
 * สมุด "ลิ้นชักวันนี้" ข้างตารางโต๊ะในหน้า Check — แคชเชียร์อยู่หน้านี้ทั้งวัน
 * - หยิบเงินออก: บันทึกทันทีตอนหยิบ (น้ำแข็ง ผักขาด ฯลฯ) ไม่งั้นตอนปิดยอดเงินจะขาดโดยไม่รู้สาเหตุ
 * - ปิดยอดวันนี้: นับเงินในลิ้นชักเทียบกับยอดที่ระบบคาดไว้ วันละครั้ง
 */
export function CashDrawerBar() {
  const { data: preview, isPending, isError, refetch } = useCashClosePreview()
  const [dialog, setDialog] = useState<'expense' | 'close' | null>(null)

  if (isPending) {
    return <div aria-hidden className="h-64 animate-pulse rounded-xl bg-gray-100" />
  }

  if (!preview) {
    return isError ? <LoadError what="ยอดลิ้นชัก" onRetry={() => refetch()} /> : null
  }

  const closed = preview.alreadyClosed
  const items = preview.drawerExpenseItems

  return (
    <section
      aria-labelledby="drawer-heading"
      className="rounded-xl border-2 border-gray-200 bg-white"
    >
      <div className="flex items-baseline justify-between gap-3 px-4 pt-4">
        <h2 id="drawer-heading" className="text-lg font-bold text-black">
          ลิ้นชักวันนี้
        </h2>
        <span className="text-sm text-gray-600">
          {thaiDay(preview.date)} · {preview.paymentCount} บิล
        </span>
      </div>

      {isError && (
        <p role="alert" className="mx-4 mt-2 text-sm font-semibold text-danger-ink">
          อัปเดตยอดไม่ได้ ตัวเลขอาจไม่ใช่ล่าสุด
        </p>
      )}

      <dl className="mx-4 mt-3 divide-y divide-gray-200 border-y border-gray-200 text-base">
        <LedgerRow label="รับเงินสด" value={formatBaht(preview.cashSales)} />
        <LedgerRow
          label="หยิบออก"
          value={
            preview.drawerExpenses > 0
              ? `−${formatBaht(preview.drawerExpenses)}`
              : formatBaht(0)
          }
          negative={preview.drawerExpenses > 0}
        />
        <LedgerRow
          strong
          label={
            <>
              เงินสดสุทธิ
              <span className="block text-sm font-normal text-gray-600">
                ไม่รวมเงินทอนตั้งต้น
              </span>
            </>
          }
          value={formatBaht(preview.cashSales - preview.drawerExpenses)}
        />
      </dl>

      <p className="mx-4 mt-2 flex justify-between gap-3 text-sm text-gray-600">
        <span>PromptPay เข้าบัญชีร้าน</span>
        <span className="font-semibold text-black tabular-nums">
          {formatBaht(preview.promptpaySales)}
        </span>
      </p>

      {items.length > 0 && (
        <details className="group mx-4 mt-3 border-t border-gray-200 pt-1 text-sm">
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between font-semibold text-gray-700">
            รายการหยิบออก ({items.length})
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
              className="h-4 w-4 transition group-open:rotate-180"
            >
              <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <ul className="space-y-1.5 pb-1">
            {items.map((item) => (
              <li key={item.id} className="flex justify-between gap-3">
                <span className="min-w-0">
                  <span className="text-gray-600 tabular-nums">{formatTime(item.spentAt)}</span>{' '}
                  <span className="text-black">{item.title}</span>
                  {item.createdByName && (
                    <span className="block text-gray-600">{item.createdByName}</span>
                  )}
                </span>
                <span className="whitespace-nowrap font-semibold text-danger-ink tabular-nums">
                  −{formatBaht(item.amount)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {closed && <ClosedSummary cashClose={closed} />}

      <div className={`grid gap-2 p-4 ${closed ? '' : 'grid-cols-2'}`}>
        <button type="button" onClick={() => setDialog('expense')} className={button('secondary')}>
          หยิบเงินออก
        </button>
        {!closed && (
          <button
            type="button"
            onClick={() => {
              // จำนวนโต๊ะค้างจ่ายไม่ได้อัปเดตตามออเดอร์แบบ live — ดึงใหม่ก่อนเปิดให้เตือนตรง
              refetch()
              setDialog('close')
            }}
            className={button('primary')}
          >
            ปิดยอดวันนี้
          </button>
        )}
      </div>

      {dialog === 'expense' && <DrawerExpenseDialog onClose={() => setDialog(null)} />}
      {dialog === 'close' && (
        <CashCloseDialog preview={preview} onClose={() => setDialog(null)} />
      )}
    </section>
  )
}

function ClosedSummary({ cashClose }: { cashClose: ApiCashClose }) {
  return (
    <div className="mx-4 mt-3 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700">
      <p className="font-bold text-black">ปิดยอดแล้ว {formatTime(cashClose.closedAt)}</p>
      <p>
        โดย {cashClose.closedByName} · นับได้{' '}
        <span className="tabular-nums">{formatBaht(cashClose.countedCash)}</span> ·{' '}
        <DifferenceText value={cashClose.difference} />
      </p>
    </div>
  )
}

function DrawerExpenseDialog({ onClose }: { onClose: () => void }) {
  const addDrawerExpense = useAddDrawerExpense()
  const [amount, setAmount] = useState('')
  const [detail, setDetail] = useState('')
  const [category, setCategory] = useState<ExpenseCategory>(
    ExpenseCategory.INGREDIENTS,
  )

  const amountNum = Number(amount)
  const valid = detail.trim() !== '' && Number.isFinite(amountNum) && amountNum > 0

  return (
    <Modal title="หยิบเงินออกจากลิ้นชัก" onClose={onClose}>
      <ErrorNote error={addDrawerExpense.error} />
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!valid) return
          addDrawerExpense.mutate(
            { detail, amount: amountNum, category },
            { onSuccess: onClose },
          )
        }}
      >
        <label className="block">
          <span className={fieldLabel}>จำนวนเงิน (บาท)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={field}
          />
        </label>

        <label className="mt-3 block">
          <span className={fieldLabel}>เอาไปจ่ายอะไร</span>
          <input
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            maxLength={200}
            placeholder="เช่น น้ำแข็ง 2 ถุง"
            className={field}
          />
        </label>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {drawerCategories.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCategory(c.value)}
              aria-pressed={category === c.value}
              className={`min-h-11 rounded-lg border-2 text-sm font-bold transition ${
                category === c.value
                  ? 'border-brand-400 bg-brand-50 text-brand-500'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <p className="mt-3 text-sm text-gray-600">
          บันทึกแล้วแก้ไขเองไม่ได้ ถ้าใส่ผิดให้แจ้งเจ้าของร้านแก้ที่หน้ารายรับ-รายจ่าย
        </p>

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
            disabled={addDrawerExpense.isPending || !valid}
            className={button('primary', 'lg')}
          >
            {addDrawerExpense.isPending ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function CashCloseDialog({
  preview,
  onClose,
}: {
  preview: ApiCashClosePreview
  onClose: () => void
}) {
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
          <span className={fieldLabel}>เงินทอนตั้งต้น (ใส่ลิ้นชักไว้ตอนเปิดร้าน)</span>
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
          <span className={fieldLabel}>เงินที่นับได้จริง</span>
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
