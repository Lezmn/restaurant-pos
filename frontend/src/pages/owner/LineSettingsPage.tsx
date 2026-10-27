import { ErrorNote } from '@/components/ui/ErrorNote'
import { button, field, fieldLabel } from '@/components/ui/styles'
import { toast } from '@/components/ui/toast'
import type { LineSettings } from '@/features/line-settings/api'
import {
  useLineSettings,
  useSaveLineSettings,
  useTestLineSettings,
} from '@/features/line-settings/hooks'
import { useState, type ReactNode } from 'react'
import { RequiredMark } from '@/components/ui/RequiredMark'

const USER_ID = /^[UCR][0-9a-f]{32}$/

/**
 * แจ้งเตือน LINE — เจ้าของร้านเชื่อม LINE Official Account ของตัวเองได้ โดยไม่ต้องเข้าเซิร์ฟเวอร์
 * ตอนนี้ส่ง "สรุปยอดตอนกดปิดยอดวันนี้" — token เก็บเข้ารหัสฝั่งเซิร์ฟเวอร์ หน้านี้ไม่เคยได้ token เต็มกลับมา
 */
export function LineSettingsPage() {
  const { data, isPending, error } = useLineSettings()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-black">แจ้งเตือน LINE</h1>
        <p className="mt-1 text-sm text-gray-600">
          ส่งสรุปยอดขายและเงินในลิ้นชักเข้า LINE ของคุณ ทุกครั้งที่กด "ปิดยอดวันนี้"
        </p>
      </div>

      <ErrorNote error={error} />
      {isPending && <div aria-hidden className="h-64 animate-pulse rounded-xl bg-gray-100" />}
      {/* key: โหลดค่าใหม่ (บันทึกแล้ว) ให้ฟอร์มเริ่มจากค่าล่าสุด */}
      {data && <SettingsForm key={`${data.to}-${data.tokenHint}-${data.enabled}`} saved={data} />}

      <SetupGuide />
    </div>
  )
}

function StatusLine({ saved }: Readonly<{ saved: LineSettings }>) {
  if (saved.tokenUnreadable) {
    return (
      <p className="rounded-lg bg-danger/10 px-4 py-3 text-sm font-semibold text-danger-ink">
        token ที่บันทึกไว้ใช้ไม่ได้แล้ว (กุญแจของเซิร์ฟเวอร์เปลี่ยน) — วาง Channel access token ใหม่แล้วกดบันทึก
      </p>
    )
  }
  if (saved.ready) {
    return (
      <p className="rounded-lg bg-success/10 px-4 py-3 text-sm font-semibold text-black">
        <span aria-hidden className="mr-2 inline-block h-2 w-2 rounded-full bg-success" />
        เชื่อมต่อแล้ว — จะส่งสรุปยอดทุกครั้งที่ปิดยอดวัน
        {saved.source === 'env' && ' (ใช้ค่าจากไฟล์ตั้งค่าของเซิร์ฟเวอร์ บันทึกในหน้านี้เพื่อแก้ไขได้)'}
      </p>
    )
  }
  return (
    <p className="rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-700">
      {saved.hasToken && !saved.enabled ? 'ปิดการส่งไว้อยู่' : 'ยังไม่ได้เชื่อม LINE — ทำตามขั้นตอนด้านล่าง แล้วกรอกที่นี่'}
    </p>
  )
}

function SettingsForm({ saved }: Readonly<{ saved: LineSettings }>) {
  const save = useSaveLineSettings()
  const test = useTestLineSettings()
  const [enabled, setEnabled] = useState(saved.source === 'none' ? true : saved.enabled)
  const [to, setTo] = useState(saved.to)
  // ไม่เคยได้ token เต็มกลับมา — ช่องนี้ว่างเสมอ เว้นว่าง = ใช้ตัวเดิม
  const [token, setToken] = useState('')

  const needsToken = !saved.hasToken || saved.tokenUnreadable
  const toValid = USER_ID.test(to.trim())
  const tokenValid = token.trim() === '' ? !needsToken : token.trim().length >= 20
  const dirty = token.trim() !== '' || to.trim() !== saved.to || enabled !== saved.enabled
  const canSave = toValid && tokenValid && dirty && !save.isPending
  const canTest = toValid && (token.trim().length >= 20 || !needsToken) && !test.isPending

  return (
    <section className="space-y-4 rounded-xl border-2 border-brand-75 bg-white p-5">
      <StatusLine saved={saved} />

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!canSave) return
          test.reset()
          save.mutate(
            { enabled, to, token },
            { onSuccess: () => toast('บันทึกการตั้งค่า LINE แล้ว') },
          )
        }}
      >
        <label className="block">
          <span className={fieldLabel}>Channel access token{needsToken && <RequiredMark />}</span>
          <textarea
            value={token}
            onChange={(e) => setToken(e.target.value)}
            rows={3}
            autoComplete="off"
            spellCheck={false}
            placeholder={
              saved.tokenHint && !saved.tokenUnreadable
                ? `บันทึกไว้แล้ว (${saved.tokenHint}) — เว้นว่างไว้ถ้าไม่เปลี่ยน`
                : 'วาง token ยาว ๆ ที่ได้จาก LINE Developers'
            }
            className={`${field} font-mono text-xs`}
          />
          {token.trim() !== '' && token.trim().length < 20 && (
            <span className="mt-1 block text-sm text-danger-ink">token สั้นผิดปกติ — ก๊อปมาทั้งหมดหรือยัง</span>
          )}
        </label>

        <label className="block">
          <span className={fieldLabel}>User ID ของคุณ<RequiredMark /></span>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="U ตามด้วยตัวอักษร 32 ตัว"
            className={`${field} font-mono text-sm`}
          />
          {to.trim() !== '' && !toValid && (
            <span className="mt-1 block text-sm text-danger-ink">
              ต้องขึ้นต้นด้วย U ตามด้วยตัวอักษร/ตัวเลข 32 ตัว (ก๊อปจาก "Your user ID")
            </span>
          )}
        </label>

        <label className="flex min-h-11 cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-5 w-5 accent-brand-500"
          />
          <span className="text-sm font-semibold text-black">ส่งสรุปยอดเข้า LINE ทุกครั้งที่ปิดยอดวัน</span>
        </label>

        <ErrorNote error={save.error} />
        {test.data && (
          <p
            role="status"
            className={`rounded-lg px-4 py-3 text-sm font-semibold ${
              test.data.ok ? 'bg-success/10 text-black' : 'bg-danger/10 text-danger-ink'
            }`}
          >
            {test.data.ok ? '✅ ' : ''}
            {test.data.message}
          </p>
        )}
        <ErrorNote error={test.error} />

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={!canTest}
            onClick={() => test.mutate({ to, token })}
            className={button('outline', 'lg')}
          >
            {test.isPending ? 'กำลังส่ง...' : 'ส่งข้อความทดสอบ'}
          </button>
          <button type="submit" disabled={!canSave} className={button('primary', 'lg')}>
            {save.isPending ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
        <p className="text-sm text-gray-600">
          กดทดสอบก่อนบันทึกได้ · token ถูกเก็บแบบเข้ารหัส และหน้านี้จะไม่แสดง token เต็มอีก
        </p>
      </form>
    </section>
  )
}

const steps: { title: string; body: ReactNode }[] = [
  {
    title: 'สร้าง LINE Official Account',
    body: (
      <>
        เข้า{' '}
        <a href="https://manager.line.biz" target="_blank" rel="noreferrer" className="font-semibold text-brand-500 underline">
          manager.line.biz
        </a>{' '}
        ด้วยบัญชี LINE ของคุณ แล้วกด "สร้างบัญชี" (ตั้งชื่อเช่น "ร้าน… แจ้งยอด") ใช้แพ็กเกจฟรีได้
      </>
    ),
  },
  {
    title: 'เปิด Messaging API',
    body: 'ใน LINE OA Manager ไปที่ ตั้งค่า → Messaging API → กด "ใช้ Messaging API" แล้วเลือกหรือสร้าง Provider (ใช้ชื่อร้านได้)',
  },
  {
    title: 'คัดลอก Channel access token',
    body: (
      <>
        เข้า{' '}
        <a href="https://developers.line.biz/console" target="_blank" rel="noreferrer" className="font-semibold text-brand-500 underline">
          developers.line.biz/console
        </a>{' '}
        → เลือก channel ของร้าน → แท็บ <b>Messaging API</b> → เลื่อนลงล่างสุด กด <b>Issue</b> ที่
        "Channel access token (long-lived)" แล้วคัดลอกมาวางในช่องด้านบน
      </>
    ),
  },
  {
    title: 'คัดลอก User ID',
    body: (
      <>
        ใน channel เดียวกัน แท็บ <b>Basic settings</b> → ช่อง <b>Your user ID</b> (ขึ้นต้นด้วย U) คัดลอกมาวางด้านบน
      </>
    ),
  },
  {
    title: 'แอด LINE OA เป็นเพื่อน',
    body: 'สแกน QR ของ OA ในแท็บ Messaging API ด้วยมือถือของคุณ — ถ้ายังไม่แอดจะไม่ได้รับข้อความ',
  },
  {
    title: 'กด "ส่งข้อความทดสอบ" แล้วบันทึก',
    body: 'ถ้าได้ข้อความใน LINE แปลว่าเรียบร้อย ถ้าไม่ได้ ระบบจะบอกสาเหตุให้แก้',
  },
]

function SetupGuide() {
  return (
    <section aria-labelledby="line-guide" className="rounded-xl border-2 border-gray-200 bg-white p-5">
      <h2 id="line-guide" className="text-lg font-bold text-black">
        วิธีเชื่อม LINE (ทำครั้งเดียว ประมาณ 10 นาที)
      </h2>
      <ol className="mt-3 space-y-3">
        {steps.map((step, i) => (
          <li key={step.title} className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white">
              {i + 1}
            </span>
            <div className="min-w-0 text-sm text-gray-700">
              <p className="font-bold text-black">{step.title}</p>
              <p className="mt-0.5">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-sm text-gray-600">
        LINE Notify (แบบเก่า) ปิดบริการแล้ว จึงต้องใช้ LINE Official Account แทน · แพ็กเกจฟรีมีโควตาข้อความต่อเดือน
        สรุปยอดวันละครั้งไม่เกินโควตา
      </p>
    </section>
  )
}
