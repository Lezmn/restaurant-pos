import { act, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSlashFocus } from '@/lib/use-slash-focus'
import { ApiError } from '@/lib/api-client'
import { LoadError } from '@/components/ui/LoadError'
import { QuantityStepper } from '@/components/ui/QuantityStepper'
import { toast, useToasts } from '@/components/ui/toast'

describe('QuantityStepper', () => {
  // ทดสอบ: ปุ่มเพิ่ม/ลดจำนวนเปลี่ยนค่าทีละ 1
  // วิธี: render QuantityStepper ค่า 3 → กดเพิ่มและลดอย่างละครั้ง → เช็กว่า onChange ถูกเรียกด้วย 4 และ 2
  it('กด + / − เรียก onChange ทีละ 1', async () => {
    const onChange = vi.fn()
    render(<QuantityStepper value={3} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'เพิ่มจำนวน' }))
    await userEvent.click(screen.getByRole('button', { name: 'ลดจำนวน' }))
    expect(onChange.mock.calls).toEqual([[4], [2]])
  })

  // ทดสอบ: ปุ่มลดกดไม่ได้ที่ค่าต่ำสุด และปุ่มเพิ่มกดไม่ได้ที่เพดาน 99
  // วิธี: render ค่า 1 เช็กปุ่มลด → rerender ค่า 99 เช็กปุ่มเพิ่ม
  it('ที่ค่าต่ำสุด ปุ่มลดกดไม่ได้; ที่เพดาน 99 ปุ่มเพิ่มกดไม่ได้', () => {
    const { rerender } = render(<QuantityStepper value={1} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'ลดจำนวน' })).toBeDisabled()
    rerender(<QuantityStepper value={99} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'เพิ่มจำนวน' })).toBeDisabled()
  })

  // ทดสอบ: ในตะกร้า (min=0) ลดจาก 1 ได้ เพื่อใช้ลบรายการ
  // วิธี: render ค่า 1 พร้อม min=0 → กดลด → เช็กว่า onChange ได้ 0
  it('min=0 (ในตะกร้า) ลดจาก 1 ได้เพื่อลบรายการ', async () => {
    const onChange = vi.fn()
    render(<QuantityStepper value={1} min={0} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'ลดจำนวน' }))
    expect(onChange).toHaveBeenCalledWith(0)
  })
})

describe('toast store', () => {
  beforeEach(() => useToasts.setState({ toasts: [] }))

  // ทดสอบ: toast เก็บไว้แค่ 3 อันล่าสุด และปิดทีละอันได้
  // วิธี: เรียก toast 4 ครั้ง → เช็กว่าเหลือ b, c, d → dismiss อันแรก → เช็กว่าเหลือ c, d
  it('เก็บแค่ 3 อันล่าสุด และ dismiss ได้', () => {
    for (const m of ['a', 'b', 'c', 'd']) toast(m)
    const { toasts } = useToasts.getState()
    expect(toasts.map((t) => t.message)).toEqual(['b', 'c', 'd'])
    act(() => useToasts.getState().dismiss(toasts[0].id))
    expect(useToasts.getState().toasts.map((t) => t.message)).toEqual(['c', 'd'])
  })

  // ทดสอบ: toast แต่ละอันได้ id ไม่ซ้ำกัน แม้ข้อความเหมือนกัน
  // วิธี: เรียก toast('x') 2 ครั้ง → เช็กว่า id สองอันต่างกัน
  it('id ไม่ซ้ำกัน', () => {
    toast('x')
    toast('x')
    const [a, b] = useToasts.getState().toasts
    expect(a.id).not.toBe(b.id)
  })
})

function SearchBox() {
  const ref = useRef<HTMLInputElement>(null)
  useSlashFocus(ref)
  return (
    <div>
      <input aria-label="ค้นหา" ref={ref} />
      <input aria-label="อื่น" />
    </div>
  )
}

describe('useSlashFocus', () => {
  // ทดสอบ: กดปุ่ม / แล้วโฟกัสไปที่ช่องค้นหา และไม่พิมพ์ / ลงในช่อง
  // วิธี: render ช่องค้นหาที่ใช้ useSlashFocus → กด / → เช็กว่าช่องค้นหาได้โฟกัสและยังว่าง
  it('กด / → โฟกัสช่องค้นหา และไม่พิมพ์ / ลงไป', async () => {
    render(<SearchBox />)
    await userEvent.keyboard('/')
    const search = screen.getByLabelText('ค้นหา')
    expect(search).toHaveFocus()
    expect(search).toHaveValue('')
  })

  // ทดสอบ: ตอนพิมพ์อยู่ในช่องอื่น กด / ต้องพิมพ์ได้ปกติ ไม่แย่งโฟกัสไปช่องค้นหา
  // วิธี: คลิกช่องอื่นแล้วพิมพ์ 1/2 → เช็กว่าโฟกัสยังอยู่ช่องเดิมและค่าเป็น 1/2
  it('กำลังพิมพ์ในช่องอื่น → / พิมพ์ได้ปกติ ไม่แย่งโฟกัส', async () => {
    render(<SearchBox />)
    const other = screen.getByLabelText('อื่น')
    await userEvent.click(other)
    await userEvent.keyboard('1/2')
    expect(other).toHaveFocus()
    expect(other).toHaveValue('1/2')
  })

  // ทดสอบ: ตอนมีกล่อง dialog เปิดอยู่ ปุ่ม / ต้องไม่ย้ายโฟกัสไปช่องค้นหา
  // วิธี: เพิ่ม <dialog open> ลงหน้า → กด / → เช็กว่าช่องค้นหาไม่ได้โฟกัส
  it('มี dialog เปิดอยู่ → ไม่ทำงาน', async () => {
    render(<SearchBox />)
    const dlg = document.createElement('dialog')
    dlg.setAttribute('open', '')
    document.body.appendChild(dlg)
    await userEvent.keyboard('/')
    expect(screen.getByLabelText('ค้นหา')).not.toHaveFocus()
    dlg.remove()
  })

  // ทดสอบ: เลิกใช้ hook แล้วต้องถอดตัวดักคีย์บอร์ดออก ไม่ค้างไว้
  // วิธี: spy document.removeEventListener → render hook แล้ว unmount → เช็กว่าถูกเรียกด้วย 'keydown'
  it('ถอด listener ตอน unmount', () => {
    const spy = vi.spyOn(document, 'removeEventListener')
    const { unmount } = renderHook(() => useSlashFocus({ current: null }))
    unmount()
    expect(spy).toHaveBeenCalledWith('keydown', expect.any(Function))
  })
})

describe('LoadError', () => {
  // ทดสอบ: โหลดไม่สำเร็จเพราะโดนจำกัดจำนวนคำขอ (429) ต้องบอกให้รอ ไม่บอกให้ตรวจอินเทอร์เน็ต
  // วิธี: render LoadError ด้วย ApiError 429 → เช็กข้อความ "ระบบพักรับคำขอชั่วคราว" และไม่มี "ตรวจการเชื่อมต่อ"
  it('429 บอกให้รอ ไม่บอกให้ตรวจเน็ต', () => {
    render(<LoadError what="รายการเมนู" error={new ApiError(429, 'x')} onRetry={() => {}} />)
    expect(screen.getByRole('alert')).toHaveTextContent('ระบบพักรับคำขอชั่วคราว')
    expect(screen.getByRole('alert')).not.toHaveTextContent('ตรวจการเชื่อมต่อ')
  })

  // ทดสอบ: error แบบอื่นยังบอกให้ตรวจการเชื่อมต่ออินเทอร์เน็ตเหมือนเดิม
  // วิธี: render LoadError ด้วย ApiError 500 → เช็กข้อความ "ตรวจการเชื่อมต่ออินเทอร์เน็ต"
  it('error อื่นยังบอกให้ตรวจการเชื่อมต่อเหมือนเดิม', () => {
    render(<LoadError what="รายการเมนู" error={new ApiError(500, 'x')} onRetry={() => {}} />)
    expect(screen.getByRole('alert')).toHaveTextContent('ตรวจการเชื่อมต่ออินเทอร์เน็ต')
  })
})
