import { Modal } from '@/components/ui/Modal'
import { button, field, fieldLabel } from '@/components/ui/styles'
import { toast } from '@/components/ui/toast'
import { MAX_DEVICE_NAME, setDeviceName, useDeviceName } from '@/lib/device'
import { useState } from 'react'

/**
 * ปุ่ม "เครื่อง: ..." ที่หัวจอพนักงาน — ตั้งชื่อเครื่องนี้ (เช่น แท็บเล็ตแคชเชียร์)
 * ประวัติการทำรายการในหน้าเจ้าของร้านจะโชว์ชื่อนี้ แทน id สุ่มที่อ่านไม่ออก
 */
export function DeviceNameButton() {
  const deviceName = useDeviceName()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setDraft(deviceName ?? '')
          setOpen(true)
        }}
        className={`ml-3 text-sm font-normal underline decoration-dotted underline-offset-4 ${
          deviceName ? 'text-gray-600 hover:text-black' : 'text-danger-ink'
        }`}
      >
        {deviceName ? `เครื่อง: ${deviceName}` : 'ตั้งชื่อเครื่องนี้'}
      </button>

      {open && (
        <Modal title="ชื่อเครื่องนี้" onClose={() => setOpen(false)}>
          <form
            className="text-left"
            onSubmit={(e) => {
              e.preventDefault()
              setDeviceName(draft)
              setOpen(false)
              toast(draft.trim() ? 'บันทึกชื่อเครื่องแล้ว' : 'ลบชื่อเครื่องแล้ว')
            }}
          >
            <p className="text-sm text-gray-600">
              ร้านใช้บัญชีร่วมกัน ชื่อนี้จะบันทึกไว้ในประวัติตอนลดราคา ยกเลิกบิล หรือลบรายการ
              เจ้าของร้านจะได้รู้ว่าทำจากเครื่องไหน
            </p>
            <label className="mt-4 block">
              <span className={fieldLabel}>ชื่อเครื่อง</span>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={MAX_DEVICE_NAME}
                placeholder="เช่น แท็บเล็ตแคชเชียร์ / iPad ครัว"
                className={field}
              />
            </label>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setOpen(false)} className={button('secondary', 'lg')}>
                ยกเลิก
              </button>
              <button type="submit" className={button('primary', 'lg')}>
                บันทึก
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}
