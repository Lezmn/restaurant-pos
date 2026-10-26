import { ErrorNote } from '@/components/ui/ErrorNote'
import { Modal } from '@/components/ui/Modal'
import { button } from '@/components/ui/styles'
import { toast } from '@/components/ui/toast'
import { useMergeSession, useMoveSession } from '@/features/table-sessions/hooks'
import { formatBaht } from '@/lib/format'
import type { Id, RestaurantTable, TableSession } from '@/types/models'
import { useState } from 'react'

type Mode = 'move' | 'merge'

/**
 * ย้ายโต๊ะ / รวมโต๊ะ ของบิลที่เปิดอยู่
 * - ย้าย: ทั้งบิลไปโต๊ะที่ว่าง — QR เดิมในมือลูกค้ายังสั่งต่อได้
 * - รวม: ออเดอร์ที่ยังไม่จ่ายของโต๊ะนี้ไปเข้าบิลโต๊ะที่มีลูกค้าอยู่ แล้วโต๊ะนี้ว่าง (QR โต๊ะนี้ใช้ไม่ได้อีก)
 */
export function MoveTableDialog({
  session,
  tables,
  openSessions,
  onClose,
}: Readonly<{
  session: TableSession
  /** โต๊ะที่ใช้งานอยู่ทั้งหมด (ไม่รวมโต๊ะเสมือนของกลับบ้าน) */
  tables: RestaurantTable[]
  /** บิลโต๊ะจริงที่เปิดอยู่ทั้งหมด */
  openSessions: TableSession[]
  onClose: () => void
}>) {
  const move = useMoveSession()
  const merge = useMergeSession()
  const [mode, setMode] = useState<Mode>('move')
  const [picked, setPicked] = useState<Id | null>(null)

  const busyTableIds = new Set(openSessions.map((s) => s.tableId))
  const freeTables = tables.filter((t) => t.id !== session.tableId && !busyTableIds.has(t.id))
  const otherSessions = openSessions
    .filter((s) => s.id !== session.id)
    .sort((a, b) => a.tableName.localeCompare(b.tableName, 'th', { numeric: true }))

  const pending = move.isPending || merge.isPending
  const error = mode === 'move' ? move.error : merge.error

  const switchMode = (next: Mode) => {
    setMode(next)
    setPicked(null)
    move.reset()
    merge.reset()
  }

  const confirm = () => {
    if (!picked) return
    if (mode === 'move') {
      const table = freeTables.find((t) => t.id === picked)
      move.mutate(
        { sessionId: session.id, tableId: picked },
        {
          onSuccess: () => {
            toast(`ย้ายโต๊ะ ${session.tableName} ไปโต๊ะ ${table?.name ?? ''} แล้ว`)
            onClose()
          },
        },
      )
      return
    }
    const target = otherSessions.find((s) => s.id === picked)
    merge.mutate(
      { sessionId: session.id, targetSessionId: picked },
      {
        onSuccess: () => {
          toast(`รวมโต๊ะ ${session.tableName} เข้าโต๊ะ ${target?.tableName ?? ''} แล้ว`)
          onClose()
        },
      },
    )
  }

  const chip = (selected: boolean) =>
    `flex min-h-14 flex-col items-center justify-center rounded-lg border-2 px-2 py-2 text-center transition ${
      selected
        ? 'border-brand-500 bg-brand-500 text-white'
        : 'border-gray-300 bg-white text-black hover:border-brand-400'
    }`

  return (
    <Modal title={`ย้าย/รวม โต๊ะ ${session.tableName}`} onClose={onClose}>
      <div role="tablist" aria-label="เลือกวิธี" className="grid grid-cols-2 gap-2">
        {(
          [
            ['move', 'ย้ายไปโต๊ะว่าง'],
            ['merge', 'รวมกับโต๊ะอื่น'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => switchMode(value)}
            className={`rounded-lg py-2.5 text-sm font-bold transition ${
              mode === value ? 'bg-brand-50 text-brand-500 ring-2 ring-brand-400' : 'bg-gray-100 text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="mt-3 text-sm text-gray-600">
        {mode === 'move'
          ? 'ออเดอร์ทั้งหมดและยอดค้างจ่ายย้ายตามไป · QR เดิมของลูกค้ายังใช้สั่งต่อได้'
          : `ออเดอร์ที่ยังไม่จ่ายของโต๊ะ ${session.tableName} ไปรวมในบิลโต๊ะที่เลือก แล้วโต๊ะ ${session.tableName} จะว่าง · ให้ลูกค้าใช้ QR ของโต๊ะที่เลือกแทน`}
      </p>

      <ErrorNote error={error} />

      <div className="mt-3 grid max-h-72 grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
        {mode === 'move' &&
          freeTables.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={picked === t.id}
              onClick={() => setPicked(t.id)}
              className={chip(picked === t.id)}
            >
              <span className="text-lg font-bold">โต๊ะ {t.name}</span>
            </button>
          ))}
        {mode === 'merge' &&
          otherSessions.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={picked === s.id}
              onClick={() => setPicked(s.id)}
              className={chip(picked === s.id)}
            >
              <span className="text-lg font-bold">โต๊ะ {s.tableName}</span>
              <span className="text-xs tabular-nums opacity-80">{formatBaht(s.total)}</span>
            </button>
          ))}
      </div>

      {mode === 'move' && freeTables.length === 0 && (
        <p className="py-6 text-center text-sm text-gray-500">ไม่มีโต๊ะว่างให้ย้าย</p>
      )}
      {mode === 'merge' && otherSessions.length === 0 && (
        <p className="py-6 text-center text-sm text-gray-500">ไม่มีโต๊ะอื่นที่มีลูกค้าอยู่</p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <button type="button" onClick={onClose} className={button('secondary')}>
          ยกเลิก
        </button>
        <button
          type="button"
          disabled={!picked || pending}
          onClick={confirm}
          className={button('primary')}
        >
          {pending ? 'กำลังบันทึก...' : mode === 'move' ? 'ย้ายโต๊ะ' : 'รวมโต๊ะ'}
        </button>
      </div>
    </Modal>
  )
}
