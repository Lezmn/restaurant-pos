import { Badge } from '@/components/ui/Badge'
import { button } from '@/components/ui/styles'
import type { AuditAction } from '@/features/audit/api'
import { auditActionMeta, auditActionOrder, describeAudit } from '@/features/audit/describe'
import { useAuditLogs } from '@/features/audit/hooks'
import { useMemo, useState } from 'react'

const todayYmd = () => {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** ทั้งวันตามเวลาเครื่อง (เวลาร้าน) */
const dayRange = (ymd: string) => {
  const from = new Date(`${ymd}T00:00:00`)
  const to = new Date(from)
  to.setDate(to.getDate() + 1)
  return { from, to }
}

const timeText = (iso: string) =>
  new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

const selectClass =
  'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 outline-none focus:border-brand-300'

/**
 * ประวัติการทำรายการสำคัญ — ลดราคา ยกเลิกบิล ลบรายการ เงินออกจากลิ้นชัก ฯลฯ
 * บอกว่าทำจากบัญชีไหน เวลาไหน (ร้านไม่ต้องการแยกตามเครื่อง — โชว์แค่ชื่อบัญชี)
 */
export function AuditLogPage() {
  const [date, setDate] = useState(todayYmd)
  const [action, setAction] = useState<AuditAction | ''>('')

  const filter = useMemo(
    () => ({ ...dayRange(date), action: action || undefined }),
    [date, action],
  )
  const logs = useAuditLogs(filter)
  const rows = logs.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-black">ประวัติการทำรายการ</h1>
        <p className="mt-1 text-sm text-gray-600">
          ลดราคา ยกเลิกบิล ลบรายการ และเงินออกจากลิ้นชัก บอกว่าทำจากบัญชีไหน เวลาไหน
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label>
          <span className="sr-only">วันที่</span>
          <input
            type="date"
            value={date}
            max={todayYmd()}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className={selectClass}
          />
        </label>
        <label>
          <span className="sr-only">รายการ</span>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value as AuditAction | '')}
            className={selectClass}
          >
            <option value="">ทุกรายการ</option>
            {auditActionOrder.map((a) => (
              <option key={a} value={a}>
                {auditActionMeta[a].label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {logs.isError && (
        <p className="text-sm text-danger">
          {logs.error instanceof Error ? logs.error.message : 'โหลดข้อมูลไม่สำเร็จ'}
        </p>
      )}

      <section className="rounded-xl border border-gray-200">
        {logs.isPending ? (
          <p className="p-6 text-center text-sm text-gray-600">กำลังโหลด...</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-600">
            ไม่มีรายการในวันนี้{action ? ' ตามตัวกรองที่เลือก' : ''}
          </p>
        ) : (
          <ul className="divide-y divide-gray-200">
            {rows.map((log) => {
              const meta = auditActionMeta[log.action] ?? { label: log.action, tone: 'gray' as const }
              const { summary, reason } = describeAudit(log)
              return (
                <li key={log.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:gap-4">
                  <time
                    dateTime={log.createdAt}
                    className="shrink-0 text-sm font-semibold text-gray-700 tabular-nums sm:w-20"
                  >
                    {timeText(log.createdAt)}
                  </time>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      <span className="text-sm text-black">{summary}</span>
                    </div>
                    {reason && <p className="mt-1 text-sm text-gray-700">เหตุผล: {reason}</p>}
                    <p className="mt-1 text-xs text-gray-600">
                      {log.userName}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {logs.hasNextPage && (
        <div className="text-center">
          <button
            type="button"
            onClick={() => logs.fetchNextPage()}
            disabled={logs.isFetchingNextPage}
            className={button('secondary', 'sm')}
          >
            {logs.isFetchingNextPage ? 'กำลังโหลด...' : 'โหลดเพิ่ม'}
          </button>
        </div>
      )}
    </div>
  )
}
