import { useSyncExternalStore } from 'react'

/**
 * ชื่อเครื่อง + id ประจำเครื่อง — ส่งไปกับทุกคำขอของพนักงาน (header X-Device-Name / X-Device-Id)
 * ร้านใช้บัญชีกลางตามตำแหน่ง ประวัติการทำรายการจึงบอกได้แค่ "บัญชีไหน + เครื่องไหน"
 *
 * เก็บใน localStorage ของเครื่อง (ไม่ผูกกับบัญชี) — ออกจากระบบแล้วชื่อเครื่องยังอยู่
 * อ่าน/เขียนพลาด (โหมดส่วนตัว / ปิด storage) = ใช้งานได้ปกติ แค่ไม่มีชื่อเครื่อง
 */
const NAME_KEY = 'pos.deviceName'
const ID_KEY = 'pos.deviceId'
export const MAX_DEVICE_NAME = 40

const listeners = new Set<() => void>()
let memoryId: string | null = null

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // เก็บไม่ได้ก็ไม่เป็นไร — ประวัติจะไม่มีชื่อเครื่อง
  }
}

function randomId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** id สุ่มสร้างครั้งแรกที่ใช้ — แยกเครื่องที่ยังไม่ได้ตั้งชื่อออกจากกันได้ */
export function getDeviceId(): string {
  const stored = read(ID_KEY)
  if (stored) return stored
  const id = memoryId ?? randomId()
  memoryId = id
  write(ID_KEY, id)
  return id
}

export function getDeviceName(): string | null {
  return read(NAME_KEY)?.trim() || null
}

export function setDeviceName(name: string) {
  const trimmed = name.trim().slice(0, MAX_DEVICE_NAME)
  write(NAME_KEY, trimmed || null)
  listeners.forEach((fn) => fn())
}

/** header ที่แนบไปกับคำขอ — ภาษาไทยใส่ใน HTTP header ตรง ๆ ไม่ได้ ต้อง encode */
export function deviceHeaders(): Record<string, string> {
  const name = getDeviceName()
  return {
    'X-Device-Id': getDeviceId(),
    ...(name ? { 'X-Device-Name': encodeURIComponent(name) } : {}),
  }
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useDeviceName() {
  return useSyncExternalStore(subscribe, getDeviceName, () => null)
}
