import { Badge } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ErrorNote } from '@/components/ui/ErrorNote'
import { Modal } from '@/components/ui/Modal'
import { button, field, fieldLabel } from '@/components/ui/styles'
import { toast } from '@/components/ui/toast'
import {
  useAllTables,
  useCreateTable,
  useDeleteTable,
  useUpdateTable,
} from '@/features/tables/hooks'
import { TableStatus } from '@/types/enums'
import type { RestaurantTable } from '@/types/models'
import { useState } from 'react'

/** เลขโต๊ะ/ที่นั่งต้องเป็นจำนวนเต็มบวก — '' = ยังไม่กรอก */
function positiveIntError(value: string, what: string) {
  if (value.trim() === '') return `กรอก${what}`
  const n = Number(value)
  return Number.isInteger(n) && n >= 1 ? '' : `${what}ต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป`
}

/** เลขโต๊ะ + จำนวนที่นั่ง — ใช้ทั้งแถวเพิ่มโต๊ะและตอนแก้ไขโต๊ะเดิม */
function TableFields({
  idPrefix,
  number,
  seats,
  onNumber,
  onSeats,
}: Readonly<{
  idPrefix: string
  number: string
  seats: string
  onNumber: (v: string) => void
  onSeats: (v: string) => void
}>) {
  return (
    <>
      <label htmlFor={`${idPrefix}-number`} className="block text-sm">
        <span className={fieldLabel}>เลขโต๊ะ</span>
        <input
          id={`${idPrefix}-number`}
          type="number"
          inputMode="numeric"
          min="1"
          value={number}
          onChange={(e) => onNumber(e.target.value)}
          className={field}
        />
      </label>
      <label htmlFor={`${idPrefix}-seats`} className="block text-sm">
        <span className={fieldLabel}>ที่นั่ง</span>
        <input
          id={`${idPrefix}-seats`}
          type="number"
          inputMode="numeric"
          min="1"
          value={seats}
          onChange={(e) => onSeats(e.target.value)}
          className={field}
        />
      </label>
    </>
  )
}

function TableRow({
  table,
  onDelete,
}: Readonly<{ table: RestaurantTable; onDelete: (table: RestaurantTable) => void }>) {
  const update = useUpdateTable()
  const [editing, setEditing] = useState(false)
  const [number, setNumber] = useState(String(table.number))
  const [seats, setSeats] = useState(String(table.seats))
  const occupied = table.status === TableStatus.OCCUPIED

  const error = positiveIntError(number, 'เลขโต๊ะ') || positiveIntError(seats, 'จำนวนที่นั่ง')

  const save = () => {
    if (error) return
    update.mutate(
      { id: table.id, input: { number: Number(number), seats: Number(seats) } },
      {
        onSuccess: (saved) => {
          setEditing(false)
          toast(`บันทึกโต๊ะ ${saved.name} แล้ว`)
        },
      },
    )
  }

  const toggleActive = () =>
    update.mutate(
      { id: table.id, input: { isActive: !table.isActive } },
      {
        onSuccess: () =>
          toast(
            table.isActive
              ? `ปิดใช้งานโต๊ะ ${table.name} แล้ว — ไม่โผล่ในหน้าพนักงาน`
              : `เปิดใช้งานโต๊ะ ${table.name} แล้ว`,
          ),
      },
    )

  if (editing) {
    return (
      <li className="rounded-lg border-2 border-brand-300 bg-brand-50 p-3">
        <div className="grid grid-cols-2 gap-3">
          <TableFields
            idPrefix={`edit-${table.id}`}
            number={number}
            seats={seats}
            onNumber={setNumber}
            onSeats={setSeats}
          />
        </div>
        {error && <p className="mt-2 text-sm font-semibold text-danger-ink">{error}</p>}
        <ErrorNote error={update.error} />
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              update.reset()
              setNumber(String(table.number))
              setSeats(String(table.seats))
              setEditing(false)
            }}
            className={button('secondary', 'sm')}
          >
            ยกเลิก
          </button>
          <button
            type="button"
            disabled={Boolean(error) || update.isPending}
            onClick={save}
            className={button('primary', 'sm')}
          >
            {update.isPending ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </li>
    )
  }

  return (
    <li
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border-2 p-3 ${
        table.isActive ? 'border-gray-200 bg-white' : 'border-gray-200 bg-gray-50'
      }`}
    >
      <div className="mr-auto min-w-0">
        <p className={`font-bold ${table.isActive ? 'text-black' : 'text-gray-500'}`}>
          โต๊ะ {table.name}
        </p>
        <p className="text-sm text-gray-600">{table.seats} ที่นั่ง</p>
      </div>
      {!table.isActive && <Badge tone="gray">ปิดใช้งาน</Badge>}
      {occupied && <Badge tone="amber">มีลูกค้า</Badge>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setEditing(true)} className={button('outline', 'sm')}>
          แก้ไข
        </button>
        <button
          type="button"
          // ลูกค้านั่งอยู่ปิดไม่ได้ (backend ก็กัน) — ต้องเก็บเงิน/ปิดโต๊ะก่อน
          disabled={update.isPending || (table.isActive && occupied)}
          title={table.isActive && occupied ? 'ลูกค้ายังนั่งอยู่ ปิดโต๊ะก่อน' : undefined}
          onClick={toggleActive}
          className={button('outline', 'sm')}
        >
          {table.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
        </button>
        <button
          type="button"
          disabled={occupied}
          onClick={() => onDelete(table)}
          aria-label={`ลบโต๊ะ ${table.name}`}
          className={button('danger-outline', 'sm')}
        >
          ลบ
        </button>
      </div>
      {update.error != null && (
        <div className="w-full">
          <ErrorNote error={update.error} />
        </div>
      )}
    </li>
  )
}

/**
 * จัดการโต๊ะ (ADMIN) — เพิ่มโต๊ะ, แก้เลข/ที่นั่ง, ปิดใช้งาน (ยกโต๊ะออก), ลบโต๊ะที่ยังไม่เคยใช้
 * โต๊ะที่มีประวัติการขายลบไม่ได้ (ต้องเก็บหลักฐาน) — backend ตอบ 409 แล้วเราแนะนำให้ปิดใช้งานแทน
 */
export function ManageTablesDialog({ onClose }: Readonly<{ onClose: () => void }>) {
  const { data: tables, isPending } = useAllTables()
  const create = useCreateTable()
  const remove = useDeleteTable()
  const [deleting, setDeleting] = useState<RestaurantTable | null>(null)

  // เลขถัดไป = มากสุด + 1 (ไม่ต้องไล่หาเองว่าเลขไหนยังว่าง)
  const nextNumber = (tables ?? []).reduce((max, t) => Math.max(max, t.number), 0) + 1
  const [number, setNumber] = useState('')
  const [seats, setSeats] = useState('4')
  const numberValue = number === '' ? String(nextNumber) : number
  const error = positiveIntError(numberValue, 'เลขโต๊ะ') || positiveIntError(seats, 'จำนวนที่นั่ง')

  const add = () => {
    if (error) return
    create.mutate(
      { number: Number(numberValue), seats: Number(seats) },
      {
        onSuccess: (created) => {
          setNumber('')
          toast(`เพิ่มโต๊ะ ${created.name} แล้ว — เปิดโต๊ะสร้าง QR ได้เลย`)
        },
      },
    )
  }

  const active = (tables ?? []).filter((t) => t.isActive).length

  return (
    <Modal title="จัดการโต๊ะ" onClose={onClose} size="lg">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
        className="rounded-lg border-2 border-gray-200 p-3"
      >
        <p className="mb-2 text-sm font-bold text-black">เพิ่มโต๊ะ</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <TableFields
            idPrefix="new-table"
            number={numberValue}
            seats={seats}
            onNumber={setNumber}
            onSeats={setSeats}
          />
          <button
            type="submit"
            disabled={Boolean(error) || create.isPending}
            className={`${button('primary', 'md')} col-span-2 sm:col-span-1`}
          >
            {create.isPending ? 'กำลังเพิ่ม...' : 'เพิ่มโต๊ะ'}
          </button>
        </div>
        {error && <p className="mt-2 text-sm font-semibold text-danger-ink">{error}</p>}
        <ErrorNote error={create.error} />
      </form>

      <p className="mt-4 text-sm text-gray-600">
        ใช้งาน {active} โต๊ะ
        {tables && tables.length > active && ` · ปิดใช้งาน ${tables.length - active} โต๊ะ`} — โต๊ะที่เคยขายแล้วลบไม่ได้
        (ต้องเก็บประวัติบิล) ให้กด "ปิดใช้งาน" แทน
      </p>

      {isPending && <p className="mt-3 text-sm text-gray-500">กำลังโหลด...</p>}
      <ul className="mt-3 space-y-2">
        {tables?.map((table) => (
          <TableRow key={table.id} table={table} onDelete={setDeleting} />
        ))}
      </ul>

      {deleting && (
        <ConfirmDialog
          title="ลบโต๊ะ"
          subject={`โต๊ะ ${deleting.name}`}
          consequence="ลบได้เฉพาะโต๊ะที่ยังไม่เคยมีออเดอร์ — ถ้าเคยขายแล้วให้ปิดใช้งานแทน"
          confirmLabel="ลบโต๊ะ"
          pendingLabel="กำลังลบ..."
          isPending={remove.isPending}
          error={remove.error}
          onCancel={() => {
            remove.reset()
            setDeleting(null)
          }}
          onConfirm={() =>
            remove.mutate(deleting.id, {
              onSuccess: () => {
                toast(`ลบโต๊ะ ${deleting.name} แล้ว`)
                setDeleting(null)
              },
            })
          }
        />
      )}
    </Modal>
  )
}
