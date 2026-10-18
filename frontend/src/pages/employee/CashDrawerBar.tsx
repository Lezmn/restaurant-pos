import { ErrorNote } from '@/components/ui/ErrorNote'
import { Modal } from '@/components/ui/Modal'
import {
  useCashClosePreview,
  useCreateCashClose,
} from '@/features/cash-closes/hooks'
import { useAddDrawerExpense } from '@/features/expenses/hooks'
import { formatBaht, formatTime } from '@/lib/format'
import type { ApiCashClose, ApiCashClosePreview } from '@/types/api'
import { ExpenseCategory } from '@/types/enums'
import { useState } from 'react'

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
  if (value === 0) return <span className="font-bold text-success">ตรงพอดี</span>
  return value > 0 ? (
    <span className="font-bold text-brand-400">เงินเกิน {formatBaht(value)}</span>
  ) : (
    <span className="font-bold text-danger">เงินขาด {formatBaht(-value)}</span>
  )
}

/**
 * แถบ "ลิ้นชักวันนี้" บนสุดของหน้า Check — แคชเชียร์อยู่หน้านี้ทั้งวัน
 * - หยิบเงินออก: บันทึกทันทีตอนหยิบ (น้ำแข็ง ผักขาด ฯลฯ) ไม่งั้นตอนปิดยอดเงินจะขาดโดยไม่รู้สาเหตุ
 * - ปิดยอดวันนี้: นับเงินในลิ้นชักเทียบกับยอดที่ระบบคาดไว้ วันละครั้ง
 */
export function CashDrawerBar() {
  const { data: preview, refetch } = useCashClosePreview()
  const [dialog, setDialog] = useState<'expense' | 'close' | null>(null)

  if (!preview) return null

  const closed = preview.alreadyClosed

  return (
    <section className="mb-6 rounded-xl border-2 border-brand-300/60 bg-brand-50/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-black">
            ลิ้นชักวันนี้{' '}
            <span className="text-sm font-normal text-gray-500">
              {thaiDay(preview.date)}
            </span>
          </h2>
          <p className="mt-1 text-sm text-gray-700">
            เงินสดรับ{' '}
            <span className="font-bold text-brand-300">
              {formatBaht(preview.cashSales)}
            </span>
            {' · '}PromptPay{' '}
            <span className="font-bold text-promptpay">
              {formatBaht(preview.promptpaySales)}
            </span>
            {' · '}หยิบออก{' '}
            <span className="font-bold text-danger">
              {formatBaht(preview.drawerExpenses)}
            </span>
          </p>
          {closed && <ClosedSummary cashClose={closed} />}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setDialog('expense')}
            className="min-h-10 rounded-lg border-2 border-danger px-4 text-sm font-bold text-danger transition hover:bg-danger/5"
          >
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
              className="min-h-10 rounded-lg bg-brand-400 px-4 text-sm font-bold text-white transition hover:brightness-95"
            >
              ปิดยอดวันนี้
            </button>
          )}
        </div>
      </div>

      {preview.drawerExpenseItems.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-brand-300/30 pt-3 text-sm text-gray-700">
          {preview.drawerExpenseItems.map((item) => (
            <li key={item.id} className="flex justify-between gap-3">
              <span>
                <span className="text-gray-500">{formatTime(item.spentAt)}</span>{' '}
                {item.title}
                {item.createdByName && (
                  <span className="text-xs text-gray-400"> · {item.createdByName}</span>
                )}
              </span>
              <span className="whitespace-nowrap font-semibold text-danger">
                -{formatBaht(item.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {dialog === 'expense' && (
        <DrawerExpenseDialog onClose={() => setDialog(null)} />
      )}
      {dialog === 'close' && (
        <CashCloseDialog preview={preview} onClose={() => setDialog(null)} />
      )}
    </section>
  )
}

function ClosedSummary({ cashClose }: { cashClose: ApiCashClose }) {
  return (
    <p className="mt-1 text-sm text-gray-700">
      <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
        ปิดยอดแล้ว
      </span>{' '}
      {formatTime(cashClose.closedAt)} โดย {cashClose.closedByName} · นับได้{' '}
      {formatBaht(cashClose.countedCash)} ·{' '}
      <DifferenceText value={cashClose.difference} />
    </p>
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
          <span className="text-sm text-gray-700">จำนวนเงิน (บาท)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 bg-gray-100 px-3 py-2 outline-none focus:border-brand-300 focus:bg-white"
          />
        </label>

        <label className="mt-3 block">
          <span className="text-sm text-gray-700">เอาไปจ่ายอะไร</span>
          <input
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            maxLength={200}
            placeholder="เช่น น้ำแข็ง 2 ถุง"
            className="mt-1 w-full rounded border border-gray-300 bg-gray-100 px-3 py-2 outline-none focus:border-brand-300 focus:bg-white"
          />
        </label>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {drawerCategories.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCategory(c.value)}
              className={`rounded-lg border-2 py-2 text-sm font-bold transition ${
                category === c.value
                  ? 'border-brand-400 bg-brand-50 text-brand-400'
                  : 'border-gray-300 text-gray-500 hover:bg-gray-50'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <p className="mt-3 text-xs text-gray-500">
          บันทึกแล้วแก้ไขเองไม่ได้ ถ้าใส่ผิดให้แจ้งเจ้าของร้านแก้ที่หน้ารายรับ-รายจ่าย
        </p>

        <div className="mt-5 grid grid-cols-2 gap-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-danger py-2.5 font-bold text-white transition hover:brightness-95"
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={addDrawerExpense.isPending || !valid}
            className="rounded bg-plus py-2.5 font-bold text-white transition hover:brightness-95 disabled:opacity-60"
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
        <p className="mb-3 rounded-lg border border-brand-300/60 bg-brand-50 px-3 py-2 text-sm text-gray-700">
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
          <span className="text-sm text-gray-700">เงินทอนตั้งต้น (ใส่ลิ้นชักไว้ตอนเปิดร้าน)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={openingFloat}
            onChange={(e) => setOpeningFloat(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 bg-gray-100 px-3 py-2 outline-none focus:border-brand-300 focus:bg-white"
          />
        </label>

        <dl className="mt-3 space-y-1 rounded-lg bg-gray-50 px-4 py-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-600">เงินทอนตั้งต้น</dt>
            <dd>{formatBaht(floatValid ? floatNum : 0)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-600">+ รับเงินสด</dt>
            <dd className="text-brand-300">{formatBaht(preview.cashSales)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-600">− หยิบออกจากลิ้นชัก</dt>
            <dd className="text-danger">{formatBaht(preview.drawerExpenses)}</dd>
          </div>
          <div className="flex justify-between border-t border-gray-200 pt-1 font-bold">
            <dt>ควรมีในลิ้นชัก</dt>
            <dd>{floatValid ? formatBaht(expected) : '-'}</dd>
          </div>
        </dl>

        <label className="mt-3 block">
          <span className="text-sm font-semibold text-gray-700">เงินที่นับได้จริง</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
            className="mt-1 w-full rounded border-2 border-brand-300 bg-white px-3 py-2 text-lg font-bold outline-none"
          />
        </label>

        {countedValid && floatValid && (
          <p className="mt-2 text-right text-base">
            <DifferenceText value={difference} />
          </p>
        )}

        <p className="mt-2 text-xs text-gray-500">
          PromptPay วันนี้ {formatBaht(preview.promptpaySales)} — ไม่ได้อยู่ในลิ้นชัก
          ให้เทียบกับยอดเข้าในแอปธนาคาร
        </p>

        <label className="mt-3 block">
          <span className="text-sm text-gray-700">หมายเหตุ</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder={difference !== 0 && countedValid ? 'เงินไม่ตรง — รู้สาเหตุไหม' : 'ไม่กรอกก็ได้'}
            className="mt-1 w-full resize-none rounded border border-gray-300 bg-gray-100 px-3 py-2 outline-none focus:border-brand-300 focus:bg-white"
          />
        </label>

        <div className="mt-5 grid grid-cols-2 gap-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-danger py-2.5 font-bold text-white transition hover:brightness-95"
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={createCashClose.isPending || !floatValid || !countedValid}
            className="rounded bg-plus py-2.5 font-bold text-white transition hover:brightness-95 disabled:opacity-60"
          >
            {createCashClose.isPending ? 'กำลังบันทึก...' : 'ยืนยันปิดยอด'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
