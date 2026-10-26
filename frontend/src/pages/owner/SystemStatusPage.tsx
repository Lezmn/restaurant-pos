import type { CheckState, SystemStatus } from '@/features/system/api'
import { useSystemStatus } from '@/features/system/hooks'
import { printSettings } from '@/lib/print-settings'
import { ago } from '@/lib/time-ago'
import { useEffect, useState, type ReactNode } from 'react'

const stateMeta: Record<CheckState, { label: string; dot: string; text: string }> = {
  ok: { label: 'ปกติ', dot: 'bg-success', text: 'text-success-ink' },
  // เหลืองอำพันของแบรนด์ — สี status-queue ของร้านเป็นโทนแดง จะดูเหมือน "มีปัญหา"
  warn: { label: 'ควรตรวจสอบ', dot: 'bg-brand-300', text: 'text-brand-500' },
  error: { label: 'มีปัญหา', dot: 'bg-danger', text: 'text-danger-ink' },
  off: { label: 'ยังไม่ได้ตั้งค่า', dot: 'bg-gray-300', text: 'text-gray-600' },
}

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })

const fileSize = (bytes: number) =>
  bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`

const uptimeText = (seconds: number) => {
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3_600)
  if (days > 0) return `${days} วัน ${hours} ชั่วโมง`
  const minutes = Math.floor((seconds % 3_600) / 60)
  return hours > 0 ? `${hours} ชั่วโมง ${minutes} นาที` : `${minutes} นาที`
}

/** สถานะอินเทอร์เน็ตของ "เครื่องนี้" ตามเบราว์เซอร์ — เปลี่ยนทันทีเมื่อเน็ตหลุด/กลับมา */
function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

/** พิมพ์ใบทดสอบสั้น ๆ ผ่าน iframe — ไม่พิมพ์ทั้งหน้าสถานะ */
function printTestSlip() {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0'
  document.body.appendChild(frame)
  const doc = frame.contentDocument
  if (!doc) return frame.remove()
  doc.open()
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><style>
    @page { margin: 0 }
    body { font: 14px/1.5 sans-serif; width: 72mm; margin: 4mm auto; text-align: center }
    hr { border: 0; border-top: 1px dashed #000 }
  </style></head><body>
    <strong>ทดสอบเครื่องพิมพ์</strong><hr>
    <div>${new Date().toLocaleString('th-TH')}</div>
    <div>ถ้าอ่านออกครบ เครื่องพิมพ์พร้อมใช้</div><hr>
  </body></html>`)
  doc.close()
  frame.contentWindow?.focus()
  frame.contentWindow?.print()
  // print() บล็อกจนปิดหน้าต่างพิมพ์ในเบราว์เซอร์ส่วนใหญ่ — หน่วงไว้เผื่อเบราว์เซอร์ที่ไม่บล็อก
  setTimeout(() => frame.remove(), 1000)
}

function StatusRow({
  title,
  state,
  children,
  action,
}: Readonly<{ title: string; state: CheckState; children: ReactNode; action?: ReactNode }>) {
  const meta = stateMeta[state]
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-4">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span aria-hidden className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${meta.dot}`} />
        <div className="min-w-0">
          <h2 className="text-base font-bold text-black">{title}</h2>
          <div className="mt-0.5 text-sm text-gray-600">{children}</div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3 pl-6 sm:pl-0">
        {action}
        <span className={`text-sm font-bold ${meta.text}`}>{meta.label}</span>
      </div>
    </li>
  )
}

const worst = (states: CheckState[]): CheckState =>
  states.includes('error') ? 'error' : states.includes('warn') ? 'warn' : 'ok'

/**
 * สถานะระบบ — เช็คได้ในหน้าเดียวว่าอะไรพร้อม อะไรต้องตาม
 * ส่วนที่ server รู้ (DB / สำรอง / SlipOK / LINE) มาจาก /system/status
 * ส่วนที่เป็นของเครื่องนี้ (เน็ต / เครื่องพิมพ์) ดูจากเบราว์เซอร์เอง
 */
export function SystemStatusPage() {
  const { data, isPending, isError, refetch, isFetching, dataUpdatedAt } = useSystemStatus()
  const online = useOnline()
  const autoPrint = printSettings.getAutoPrintReceipt()

  const serverDown = isError
  const overall: CheckState = !online || serverDown
    ? 'error'
    : data
      ? worst([data.database.state, data.backup.state, data.offsite.state, data.slipOk.state])
      : 'ok'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-black">สถานะระบบ</h1>
          <p className="mt-1 text-sm text-gray-600">
            อัปเดตเองทุกนาที
            {dataUpdatedAt > 0 && ` · ตรวจล่าสุด ${new Date(dataUpdatedAt).toLocaleTimeString('th-TH')}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="min-h-11 rounded-lg border-2 border-gray-300 px-4 text-sm font-semibold text-gray-800 transition hover:bg-gray-50 disabled:opacity-60"
        >
          {isFetching ? 'กำลังตรวจ...' : 'ตรวจอีกครั้ง'}
        </button>
      </div>

      {!isPending && (
        <p
          role="status"
          className={`rounded-xl border-2 px-4 py-3 text-base font-bold ${
            overall === 'ok'
              ? 'border-success bg-success/5 text-success-ink'
              : overall === 'warn'
                ? 'border-brand-300 bg-brand-50 text-brand-500'
                : 'border-danger bg-danger/5 text-danger-ink'
          }`}
        >
          {overall === 'ok'
            ? 'ทุกอย่างทำงานปกติ'
            : overall === 'warn'
              ? 'ใช้งานได้ แต่มีบางอย่างควรตรวจสอบ'
              : 'มีปัญหาที่กระทบการขาย — ดูรายการสีแดงด้านล่าง'}
        </p>
      )}

      <ul className="divide-y divide-gray-200 rounded-xl border-2 border-gray-200 px-4">
        <StatusRow title="อินเทอร์เน็ต (เครื่องนี้)" state={online ? 'ok' : 'error'}>
          {online ? 'เชื่อมต่ออยู่' : 'เครื่องนี้ไม่ได้ต่ออินเทอร์เน็ต — เช็คสาย LAN / Wi-Fi / เราเตอร์'}
        </StatusRow>

        <StatusRow
          title="เซิร์ฟเวอร์และฐานข้อมูล"
          state={serverDown ? 'error' : (data?.database.state ?? 'ok')}
        >
          {isPending && 'กำลังตรวจ...'}
          {serverDown && 'ติดต่อเซิร์ฟเวอร์ไม่ได้ — ถ้าเน็ตเครื่องนี้ปกติ ให้แจ้งผู้ดูแลระบบ'}
          {data &&
            (data.database.state === 'error'
              ? 'เซิร์ฟเวอร์ทำงาน แต่ต่อฐานข้อมูลไม่ได้ — สั่งอาหาร/รับเงินไม่ได้ แจ้งผู้ดูแลระบบด่วน'
              : `ตอบสนอง ${data.database.latencyMs} ms · เปิดต่อเนื่องมา ${uptimeText(data.uptimeSeconds)}`)}
        </StatusRow>

        {data && <BackupRows data={data} />}

        {data && (
          <StatusRow title="ตรวจสลิป PromptPay (SlipOK)" state={data.slipOk.state}>
            {data.slipOk.mock
              ? 'โหมดจำลอง — สลิปไม่ได้ถูกตรวจจริง ห้ามใช้กับร้านจริง'
              : data.slipOk.configured
                ? 'ตั้งค่าแล้ว — ถ้าตรวจไม่ผ่าน บิลจะขึ้น "รอตรวจ" และระบบตรวจซ้ำเอง'
                : 'ยังไม่ได้ตั้งค่า — สลิปทุกใบจะเป็น "รอตรวจ" จนกว่าจะตั้ง SLIPOK_API_KEY'}
          </StatusRow>
        )}

        {data && (
          <StatusRow title="แจ้งเตือน LINE" state={data.line.state}>
            {data.line.configured
              ? 'ตั้งค่าแล้ว — ส่งสรุปยอดตอนปิดลิ้นชัก'
              : 'ยังไม่ได้ตั้งค่า (ไม่บังคับ) — ระบบใช้งานได้ปกติ แค่ไม่ส่งสรุปเข้า LINE'}
          </StatusRow>
        )}

        <StatusRow
          title="เครื่องพิมพ์ใบเสร็จ (เครื่องนี้)"
          state={autoPrint ? 'ok' : 'off'}
          action={
            <button
              type="button"
              onClick={printTestSlip}
              className="min-h-10 rounded-lg border-2 border-gray-300 px-3 text-sm font-semibold text-gray-800 transition hover:bg-gray-50"
            >
              ทดลองพิมพ์
            </button>
          }
        >
          {autoPrint
            ? 'เปิดพิมพ์ทันทีหลังรับเงินไว้ที่เครื่องนี้'
            : 'เครื่องนี้ไม่ได้ตั้งพิมพ์อัตโนมัติ — เปิดได้ที่หน้าใบเสร็จ (เฉพาะคอมเคาน์เตอร์)'}
          <span className="block text-gray-500">
            เบราว์เซอร์มองไม่เห็นว่าเครื่องพิมพ์เปิดอยู่ไหม กด &quot;ทดลองพิมพ์&quot; เพื่อเช็ค
          </span>
        </StatusRow>
      </ul>
    </div>
  )
}

function BackupRows({ data }: Readonly<{ data: SystemStatus }>) {
  const { backup, offsite } = data
  return (
    <>
      <StatusRow title="สำรองฐานข้อมูล (ทุกคืน)" state={backup.state}>
        {backup.state === 'off' && 'เครื่องนี้ไม่ได้เปิดระบบสำรอง (ปกติสำหรับเครื่องทดสอบ)'}
        {backup.state === 'error' && 'ยังไม่มีไฟล์สำรองเลย — แจ้งผู้ดูแลระบบให้เช็ค service "backup"'}
        {backup.lastAt && (
          <>
            ล่าสุด {ago(backup.lastAt)} ({dateTime(backup.lastAt)})
            {backup.lastSizeBytes !== null && ` · ${fileSize(backup.lastSizeBytes)}`} · เก็บไว้{' '}
            {backup.fileCount} ไฟล์
            {backup.state === 'warn' && (
              <span className="block font-semibold text-brand-500">
                ไม่ได้สำรองเกิน 1 วัน หรือไฟล์เล็กผิดปกติ — แจ้งผู้ดูแลระบบ
              </span>
            )}
          </>
        )}
      </StatusRow>

      <StatusRow title="สำเนานอกเครื่อง (cloud)" state={offsite.state}>
        {offsite.lastAt
          ? `ส่งล่าสุด ${ago(offsite.lastAt)} (${dateTime(offsite.lastAt)})`
          : 'ยังไม่ได้เปิด — ถ้าเครื่องเสีย ไฟล์สำรองในเครื่องจะหายไปด้วย (ดูวิธีตั้งใน docs/OPERATIONS.md)'}
        {offsite.state === 'warn' && (
          <span className="block font-semibold text-brand-500">
            ไม่ได้ส่งออกเกิน 1 วัน — เช็คการเชื่อมต่อ cloud (rclone)
          </span>
        )}
      </StatusRow>
    </>
  )
}
