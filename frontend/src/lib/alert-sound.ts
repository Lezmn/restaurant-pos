import { create } from 'zustand'

/**
 * เสียงแจ้งเตือนของจอพนักงาน — ออเดอร์ใหม่เข้าครัว / ลูกค้าเรียกพนักงาน
 * สร้างเสียงด้วย Web Audio (ไม่ต้องมีไฟล์เสียง) และเปิด/ปิดได้ "ต่อเครื่อง" (localStorage)
 *
 * เบราว์เซอร์ไม่ยอมเล่นเสียงจนกว่าผู้ใช้จะแตะ/คลิกหน้าเว็บสักครั้ง (โดยเฉพาะแท็บเล็ต)
 * จึงรอ "แตะครั้งแรก" แล้วค่อยปลดล็อก — ระหว่างนั้นหน้าครัวขึ้นป้ายให้แตะ 1 ครั้ง
 */

const ENABLED_KEY = 'restaurant.alertSound'

function readEnabled() {
  try {
    // ค่าเริ่มต้น = เปิด: เครื่องที่ไม่อยากได้ยินค่อยปิดเอง ดีกว่าครัวพลาดออเดอร์เพราะลืมเปิด
    return localStorage.getItem(ENABLED_KEY) !== '0'
  } catch {
    return true
  }
}

interface AlertSoundState {
  enabled: boolean
  /** เบราว์เซอร์ยอมเล่นเสียงแล้ว (ผู้ใช้แตะหน้าเว็บแล้วอย่างน้อย 1 ครั้ง) */
  unlocked: boolean
  setEnabled: (enabled: boolean) => void
}

export const useAlertSound = create<AlertSoundState>((set) => ({
  enabled: readEnabled(),
  unlocked: false,
  setEnabled: (enabled) => {
    try {
      localStorage.setItem(ENABLED_KEY, enabled ? '1' : '0')
    } catch {
      // เก็บไม่ได้ก็แค่ไม่จำ — รอบนี้ยังใช้ค่าใน state
    }
    set({ enabled })
    if (enabled) unlockAudio()
  },
}))

let context: AudioContext | null = null

function audioContext() {
  if (context) return context
  const Ctor = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  context = new Ctor()
  return context
}

/** เรียกจากเหตุการณ์ที่ผู้ใช้แตะ/กดเท่านั้น — เบราว์เซอร์ถึงจะยอมเริ่มเสียง */
export function unlockAudio() {
  const ctx = audioContext()
  if (!ctx) return
  const done = () => useAlertSound.setState({ unlocked: ctx.state === 'running' })
  if (ctx.state === 'running') done()
  else void ctx.resume().then(done, () => {})
}

let unlockInstalled = false

/** ฟังการแตะ/กดคีย์ครั้งแรกของหน้า แล้วปลดล็อกเสียง — ติดตั้งครั้งเดียวพอ */
export function installAudioUnlock() {
  if (unlockInstalled || typeof document === 'undefined') return
  unlockInstalled = true
  const onGesture = () => {
    unlockAudio()
    if (useAlertSound.getState().unlocked) {
      document.removeEventListener('pointerdown', onGesture)
      document.removeEventListener('keydown', onGesture)
    }
  }
  document.addEventListener('pointerdown', onGesture)
  document.addEventListener('keydown', onGesture)
}

/** ความถี่ (Hz) ของแต่ละโน้ต — ออเดอร์ = ติ๊งต่อง 2 รอบ, เรียกพนักงาน = ปี๊บสั้น 3 ครั้ง */
const PATTERNS = {
  order: [880, 1320, 880, 1320],
  call: [660, 660, 660],
} as const

export type AlertKind = keyof typeof PATTERNS

export function playAlert(kind: AlertKind) {
  const { enabled, unlocked } = useAlertSound.getState()
  const ctx = context
  if (!enabled || !unlocked || !ctx) return
  const note = kind === 'order' ? 0.22 : 0.12
  const gap = kind === 'order' ? 0.04 : 0.1
  PATTERNS[kind].forEach((freq, i) => {
    const start = ctx.currentTime + i * (note + gap)
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = kind === 'order' ? 'sine' : 'square'
    osc.frequency.value = freq
    // ไล่เสียงขึ้น-ลงสั้น ๆ กันเสียง "แป๊ะ" ตอนเริ่ม/จบโน้ต
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + note)
    osc.connect(gain).connect(ctx.destination)
    osc.start(start)
    osc.stop(start + note + 0.02)
  })
}
