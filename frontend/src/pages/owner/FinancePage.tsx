import { ErrorNote } from '@/components/ui/ErrorNote'
import { Modal } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import { StatCard } from '@/components/ui/StatCard'
import { button, field, fieldCompact } from '@/components/ui/styles'
import {
  useAddExpense,
  useDeleteExpense,
  useUpdateExpense,
} from '@/features/expenses/hooks'
import { currentMonth } from '@/features/reports/api'
import { useFinance } from '@/features/reports/hooks'
import { formatBaht } from '@/lib/format'
import { usePagination } from '@/lib/use-pagination'
import { ExpenseCategory, PaymentMethod } from '@/types/enums'
import type { Transaction } from '@/types/reports'
import { useMemo, useState } from 'react'
import { RequiredMark } from '@/components/ui/RequiredMark'

/** ป้ายหมวดในตาราง — รายรับใช้วิธีจ่าย รายจ่ายใช้หมวดรายจ่าย */
const categoryLabel: Record<PaymentMethod | ExpenseCategory, string> = {
  [PaymentMethod.CASH]: 'เงินสด',
  [PaymentMethod.PROMPTPAY]: 'PromptPay',
  [ExpenseCategory.INGREDIENTS]: 'วัตถุดิบ',
  [ExpenseCategory.UTILITIES]: 'ค่าน้ำค่าไฟ',
  [ExpenseCategory.SALARY]: 'เงินเดือน',
  [ExpenseCategory.EQUIPMENT]: 'อุปกรณ์',
  [ExpenseCategory.RENT]: 'ค่าเช่าร้าน',
  [ExpenseCategory.OTHER]: 'อื่น ๆ',
}

/** แถวรายการบนจอแคบ: รายละเอียด | ยอด / วันที่ | ปุ่ม / หมวด | ปุ่ม */
const FIN_ROW =
  "max-sm:grid max-sm:grid-cols-[1fr_auto] max-sm:gap-x-3 max-sm:gap-y-1 max-sm:py-3 max-sm:[grid-template-areas:'detail_amount'_'date_actions'_'cat_actions']"

const categoryTone: Record<PaymentMethod | ExpenseCategory, string> = {
  [PaymentMethod.CASH]: 'bg-success/10 text-success-ink',
  [PaymentMethod.PROMPTPAY]: 'bg-success/10 text-success-ink',
  [ExpenseCategory.INGREDIENTS]: 'bg-danger/10 text-danger-ink',
  [ExpenseCategory.UTILITIES]: 'bg-brand-50 text-brand-500',
  [ExpenseCategory.SALARY]: 'bg-brand-50 text-brand-500',
  [ExpenseCategory.EQUIPMENT]: 'bg-brand-50 text-brand-500',
  [ExpenseCategory.RENT]: 'bg-brand-50 text-brand-500',
  [ExpenseCategory.OTHER]: 'bg-gray-100 text-gray-600',
}

type Filter = 'ALL' | PaymentMethod | ExpenseCategory

const filters: { key: Filter; label: string }[] = [
  { key: 'ALL', label: 'ทั้งหมด' },
  ...Object.values(PaymentMethod).map((m) => ({ key: m, label: categoryLabel[m] })),
  ...Object.values(ExpenseCategory).map((c) => ({ key: c, label: categoryLabel[c] })),
]

const thaiDate = (iso: string) =>
  new Date(iso).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

export function FinancePage() {
  const [month, setMonth] = useState(currentMonth)
  const { data, isPending, isError, error } = useFinance(month)
  const deleteExpense = useDeleteExpense()
  const [filter, setFilter] = useState<Filter>('ALL')
  const [formOpen, setFormOpen] = useState(false)
  /** รายจ่ายที่กำลังแก้ไข / กำลังจะลบ (รายรับมาจากบิล แก้ที่นี่ไม่ได้) */
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [deleting, setDeleting] = useState<Transaction | null>(null)

  const transactions = useMemo(() => {
    const list = data?.transactions ?? []
    return filter === 'ALL' ? list : list.filter((t) => t.category === filter)
  }, [data, filter])

  // ทั้งเดือนมีหลายสิบรายการ — ตัดเป็นหน้า ๆ (เปลี่ยนตัวกรองแล้ว usePagination clamp หน้าให้เอง)
  const paged = usePagination(transactions)

  if (isPending) {
    return <p className="text-sm text-gray-500">กำลังโหลด...</p>
  }
  if (isError || !data) {
    return (
      <p className="text-sm text-danger-ink">
        {error instanceof Error ? error.message : 'โหลดข้อมูลไม่สำเร็จ'}
      </p>
    )
  }

  const { summary } = data

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-black">ภาพรวมทางการเงิน</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm">
            <span className="sr-only">เดือน</span>
            {/* backend สรุปเป็นรายเดือน (?month=YYYY-MM) */}
            <input
              type="month"
              value={month}
              max={currentMonth()}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
              className={fieldCompact}
            />
          </label>
          <button
            type="button"
            onClick={() => setFormOpen((v) => !v)}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-danger px-4 text-sm font-bold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {formOpen ? 'ปิดฟอร์ม' : '+ รายจ่าย'}
          </button>
        </div>
      </div>

      <ErrorNote error={deleteExpense.error} />

      {formOpen && <ExpenseForm onDone={() => setFormOpen(false)} />}

      {/* กำไร / รายจ่าย */}
      {/* มือถือ 2 ใบต่อแถว — เดิมการ์ด 6 ใบเรียงเต็มแถวทีละใบ ต้องเลื่อนผ่านก่อนถึงรายการ */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <StatCard
          label="กำไรสุทธิ"
          value={formatBaht(summary.netProfit)}
          // ขาดทุนต้องเป็นสีแดง — เดิมเขียวตลอด เห็น -฿39,760 เป็นสีเขียวชวนเข้าใจผิด
          tone={summary.netProfit < 0 ? 'red' : 'green'}
          size="lg"
        />
        <StatCard
          label="รายจ่าย"
          value={formatBaht(summary.expenseTotal)}
          tone="red"
          size="lg"
        />
      </div>

      {/* สถิติย่อย */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="รายรับรวม"
          value={formatBaht(summary.revenueTotal)}
          tone="brand"
        />
        <StatCard
          label="จ่ายเงินสด"
          value={formatBaht(summary.cashTotal)}
          tone="orange"
        />
        <StatCard
          label="จ่าย PromptPay"
          value={formatBaht(summary.promptPayTotal)}
          tone="promptpay"
        />
        <StatCard
          label="จำนวนบิล"
          value={summary.paymentCount.toLocaleString('th-TH')}
          tone="olive"
        />
      </div>

      {/* ตัวกรองหมวดหมู่ */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 p-3">
        <span className="mr-1 text-sm text-gray-600">หมวดหมู่ :</span>
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`min-h-11 rounded-full border-2 px-4 py-1.5 text-sm font-semibold transition ${
              filter === f.key
                ? 'border-brand-500 bg-brand-500 text-white'
                : 'border-brand-400 bg-white text-brand-500 hover:bg-brand-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* รายการล่าสุด */}
      <section className="rounded-xl border border-gray-200 p-4">
        <h2 className="mb-3 text-lg font-bold text-black">รายการล่าสุด</h2>

        {/* จอแคบ: ตารางกลายเป็นรายการ (รายละเอียดซ้าย ยอดชิดขวา) — เดิมเลื่อนข้างแล้วคอลัมน์ยอดเงินหลุดจอ
            ใช้ DOM เดิม แค่เปลี่ยน display ด้วย max-sm: — screen reader ยังอ่านเป็นตาราง */}
        <div className="sm:overflow-x-auto">
          <table className="w-full border-collapse text-left max-sm:block sm:min-w-[560px]">
            <thead className="max-sm:sr-only">
              <tr className="bg-gray-100 text-sm text-gray-700">
                <th className="px-4 py-3 font-semibold">วันที่</th>
                <th className="px-4 py-3 font-semibold">รายละเอียด</th>
                <th className="px-4 py-3 font-semibold">หมวดหมู่</th>
                <th className="px-4 py-3 text-right font-semibold">จำนวนเงิน</th>
                <th className="px-4 py-3 text-center font-semibold">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 max-sm:block">
              {transactions.length === 0 && (
                <tr className="max-sm:block">
                  <td colSpan={5} className="py-10 text-center text-sm text-gray-500 max-sm:block">
                    ไม่มีรายการในหมวดนี้
                  </td>
                </tr>
              )}

              {paged.pageItems.map((tx) => (
                <tr key={tx.id} className={FIN_ROW}>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 max-sm:[grid-area:date] max-sm:p-0">
                    {thaiDate(tx.date)}
                  </td>
                  <td className="px-4 py-3 text-sm text-black max-sm:[grid-area:detail] max-sm:p-0 max-sm:font-semibold">
                    {tx.detail}
                    {tx.paidFromDrawer && (
                      <span className="block text-xs text-gray-500">
                        หยิบจากลิ้นชัก
                        {tx.createdByName && ` · โดย ${tx.createdByName}`}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 max-sm:[grid-area:cat] max-sm:p-0">
                    <span
                      className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${categoryTone[tx.category]}`}
                    >
                      {categoryLabel[tx.category]}
                    </span>
                  </td>
                  <td
                    className={`whitespace-nowrap px-4 py-3 text-right text-sm font-bold max-sm:[grid-area:amount] max-sm:p-0 max-sm:text-base ${
                      tx.amount < 0 ? 'text-danger-ink' : 'text-success-ink'
                    }`}
                  >
                    {tx.amount < 0 ? '-' : '+'}
                    {formatBaht(Math.abs(tx.amount))}
                  </td>
                  <td className="px-4 py-3 text-center max-sm:[grid-area:actions] max-sm:self-end max-sm:p-0 max-sm:text-right">
                    {/* รายรับมาจากบิลที่เก็บเงินไปแล้ว แก้ที่นี่ไม่ได้ — ต้องไปยกเลิกบิลที่หน้า Check */}
                    {tx.type === 'EXPENSE' ? (
                      <div className="flex items-center justify-center gap-1 max-sm:-mr-3 max-sm:justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setFormOpen(false)
                            setEditing(tx)
                          }}
                          className="min-h-11 rounded-lg px-3 text-sm font-semibold text-brand-500 underline-offset-4 transition hover:bg-brand-50 hover:underline"
                        >
                          แก้ไข
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(tx)}
                          className="min-h-11 rounded-lg px-3 text-sm font-semibold text-danger-ink underline-offset-4 transition hover:bg-danger/5 hover:underline"
                        >
                          ลบ
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-500">รายรับจากบิล</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination
          page={paged.page}
          totalPages={paged.totalPages}
          from={paged.from}
          to={paged.to}
          total={paged.total}
          onChange={paged.setPage}
        />
      </section>

      {editing && (
        <Modal title="แก้ไขรายจ่าย" onClose={() => setEditing(null)}>
          <ExpenseForm expense={editing} onDone={() => setEditing(null)} />
        </Modal>
      )}

      {deleting && (
        <ConfirmDeleteDialog
          expense={deleting}
          isDeleting={deleteExpense.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() =>
            deleteExpense.mutate(deleting.id, {
              onSuccess: () => setDeleting(null),
            })
          }
        />
      )}
    </div>
  )
}

/** ยืนยันก่อนลบ — ลบแล้วกู้คืนไม่ได้ ต้องเห็นว่ากำลังลบรายการไหน */
function ConfirmDeleteDialog({
  expense,
  isDeleting,
  onCancel,
  onConfirm,
}: Readonly<{
  expense: Transaction
  isDeleting: boolean
  onCancel: () => void
  onConfirm: () => void
}>) {
  return (
    <Modal title="ลบรายจ่าย" onClose={onCancel}>
      <div className="rounded-lg bg-danger/5 px-4 py-3 text-sm text-gray-700">
        <p className="font-bold text-black">{expense.detail}</p>
        <p className="mt-1 text-gray-500">
          {thaiDate(expense.date)} · {categoryLabel[expense.category]}
        </p>
        <p className="mt-1 text-lg font-bold text-danger-ink">
          {formatBaht(Math.abs(expense.amount))}
        </p>
      </div>

      <p className="mt-3 text-sm text-gray-600">
        ลบแล้วกู้คืนไม่ได้ และยอดรายจ่ายของเดือนนี้จะเปลี่ยนตาม
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onCancel}
          className={button('secondary')}
        >
          ยกเลิก
        </button>
        <button
          type="button"
          disabled={isDeleting}
          onClick={onConfirm}
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-danger px-4 text-sm font-bold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isDeleting ? 'กำลังลบ...' : 'ลบรายการนี้'}
        </button>
      </div>
    </Modal>
  )
}

/** ฟอร์มเดียวใช้ทั้งเพิ่มและแก้ไข ต่างแค่ค่าเริ่มต้นกับ endpoint ที่ยิง */
function ExpenseForm({
  expense,
  onDone,
}: Readonly<{
  /** ไม่ส่งมา = โหมดเพิ่มรายจ่ายใหม่ */
  expense?: Transaction
  onDone: () => void
}>) {
  const addExpense = useAddExpense()
  const updateExpense = useUpdateExpense()
  const saving = expense ? updateExpense : addExpense

  const [detail, setDetail] = useState(expense?.detail ?? '')
  const [category, setCategory] = useState<ExpenseCategory>(
    (expense?.category as ExpenseCategory) ?? ExpenseCategory.INGREDIENTS,
  )
  const [amount, setAmount] = useState(
    expense ? String(Math.abs(expense.amount)) : '',
  )
  const [invalid, setInvalid] = useState('')

  let submitLabel = expense ? 'บันทึกการแก้ไข' : 'บันทึกรายจ่าย'
  if (saving.isPending) submitLabel = 'กำลังบันทึก...'

  const amountNum = Number(amount)
  const validate = () => {
    if (!detail.trim()) return 'กรุณากรอกรายละเอียด'
    if (amount.trim() === '' || !Number.isFinite(amountNum)) return 'กรุณากรอกจำนวนเงิน'
    if (amountNum <= 0) return 'จำนวนเงินต้องมากกว่า 0'
    return ''
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        // เช็คก่อนยิง ไม่งั้นได้ error 400 ดิบ ๆ จาก backend ซึ่งอ่านไม่รู้เรื่อง
        const problem = validate()
        setInvalid(problem)
        if (problem) return

        const input = { detail: detail.trim(), category, amount: amountNum }
        if (expense) {
          updateExpense.mutate(
            { id: expense.id, input },
            { onSuccess: onDone },
          )
        } else {
          addExpense.mutate(input, { onSuccess: onDone })
        }
      }}
      className="grid gap-3 rounded-xl border-2 border-danger/40 bg-danger/5 p-4 sm:grid-cols-4"
    >
      <label className="text-sm sm:col-span-2">
        <span className="font-semibold text-gray-700">รายละเอียด<RequiredMark /></span>
        <input
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="เช่น ซื้อวัตถุดิบจากตลาด"
          className={field}
        />
      </label>

      <label className="text-sm">
        <span className="font-semibold text-gray-700">หมวดหมู่</span>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
          className={field}
        >
          {Object.values(ExpenseCategory).map((c) => (
            <option key={c} value={c}>
              {categoryLabel[c]}
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm">
        <span className="font-semibold text-gray-700">จำนวนเงิน (บาท)<RequiredMark /></span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={field}
        />
      </label>

      {(invalid || saving.error) && (
        <p role="alert" className="text-sm font-semibold text-danger-ink sm:col-span-4">
          {invalid ||
            (saving.error instanceof Error
              ? saving.error.message
              : 'บันทึกไม่สำเร็จ')}
        </p>
      )}

      <div className="flex gap-3 sm:col-span-4">
        <button
          type="submit"
          disabled={saving.isPending}
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-danger px-4 text-sm font-bold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitLabel}
        </button>
        {expense && (
          <button
            type="button"
            onClick={onDone}
            className={button('secondary')}
          >
            ยกเลิก
          </button>
        )}
      </div>
    </form>
  )
}
