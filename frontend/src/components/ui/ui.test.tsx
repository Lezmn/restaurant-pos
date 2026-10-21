import { act, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSlashFocus } from '@/lib/use-slash-focus'
import { QuantityStepper } from './QuantityStepper'
import { toast, useToasts } from './toast'

describe('QuantityStepper', () => {
  it('กด + / − เรียก onChange ทีละ 1', async () => {
    const onChange = vi.fn()
    render(<QuantityStepper value={3} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'เพิ่มจำนวน' }))
    await userEvent.click(screen.getByRole('button', { name: 'ลดจำนวน' }))
    expect(onChange.mock.calls).toEqual([[4], [2]])
  })

  it('ที่ค่าต่ำสุด ปุ่มลดกดไม่ได้; ที่เพดาน 99 ปุ่มเพิ่มกดไม่ได้', () => {
    const { rerender } = render(<QuantityStepper value={1} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'ลดจำนวน' })).toBeDisabled()
    rerender(<QuantityStepper value={99} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'เพิ่มจำนวน' })).toBeDisabled()
  })

  it('min=0 (ในตะกร้า) ลดจาก 1 ได้เพื่อลบรายการ', async () => {
    const onChange = vi.fn()
    render(<QuantityStepper value={1} min={0} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'ลดจำนวน' }))
    expect(onChange).toHaveBeenCalledWith(0)
  })
})

describe('toast store', () => {
  beforeEach(() => useToasts.setState({ toasts: [] }))

  it('เก็บแค่ 3 อันล่าสุด และ dismiss ได้', () => {
    for (const m of ['a', 'b', 'c', 'd']) toast(m)
    const { toasts } = useToasts.getState()
    expect(toasts.map((t) => t.message)).toEqual(['b', 'c', 'd'])
    act(() => useToasts.getState().dismiss(toasts[0].id))
    expect(useToasts.getState().toasts.map((t) => t.message)).toEqual(['c', 'd'])
  })

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
  it('กด / → โฟกัสช่องค้นหา และไม่พิมพ์ / ลงไป', async () => {
    render(<SearchBox />)
    await userEvent.keyboard('/')
    const search = screen.getByLabelText('ค้นหา')
    expect(search).toHaveFocus()
    expect(search).toHaveValue('')
  })

  it('กำลังพิมพ์ในช่องอื่น → / พิมพ์ได้ปกติ ไม่แย่งโฟกัส', async () => {
    render(<SearchBox />)
    const other = screen.getByLabelText('อื่น')
    await userEvent.click(other)
    await userEvent.keyboard('1/2')
    expect(other).toHaveFocus()
    expect(other).toHaveValue('1/2')
  })

  it('มี dialog เปิดอยู่ → ไม่ทำงาน', async () => {
    render(<SearchBox />)
    const dlg = document.createElement('dialog')
    dlg.setAttribute('open', '')
    document.body.appendChild(dlg)
    await userEvent.keyboard('/')
    expect(screen.getByLabelText('ค้นหา')).not.toHaveFocus()
    dlg.remove()
  })

  it('ถอด listener ตอน unmount', () => {
    const spy = vi.spyOn(document, 'removeEventListener')
    const { unmount } = renderHook(() => useSlashFocus({ current: null }))
    unmount()
    expect(spy).toHaveBeenCalledWith('keydown', expect.any(Function))
  })
})
