import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMenuItems } from '@/features/menu/hooks'
import { useCreateOrder } from '@/features/orders/hooks'
import type { MenuItem, TableSession } from '@/types/models'
import { TakeOrderDialog } from '@/pages/employee/TakeOrderDialog'
import { closed, kaprao, soldOut, tea } from './menu-fixtures'

vi.mock('@/features/menu/hooks', () => ({ useMenuItems: vi.fn() }))
vi.mock('@/features/orders/hooks', () => ({ useCreateOrder: vi.fn() }))

// jsdom ยังไม่มี showModal ของ <dialog>
beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false
  }
})

const session = { id: 's1', tableId: 't5', tableName: '5' } as TableSession

let mutate: ReturnType<typeof vi.fn>
let onClose: ReturnType<typeof vi.fn<() => void>>

function setup(items: MenuItem[] | null = [kaprao, tea, soldOut, closed], extra: Record<string, unknown> = {}) {
  mutate = vi.fn()
  onClose = vi.fn<() => void>()
  vi.mocked(useMenuItems).mockReturnValue({ data: items ?? undefined, isPending: items === null } as never)
  vi.mocked(useCreateOrder).mockReturnValue({ mutate, isPending: false, error: null, ...extra } as never)
  const user = userEvent.setup()
  render(<TakeOrderDialog session={session} onClose={onClose} />)
  return { user, dialog: screen.getByRole('dialog', { name: 'รับออเดอร์ — โต๊ะ 5' }) }
}

/** ปุ่ม "+ เพิ่ม" ของเมนูในรายการด้านบน */
const addButton = (dialog: HTMLElement, name: string) =>
  within(within(dialog).getAllByText(name)[0].closest('li') as HTMLElement).getByRole('button', { name: '+ เพิ่ม' })

/** บรรทัดในรายการที่รับ (ลิสต์ที่สอง) */
const lines = (dialog: HTMLElement) => {
  const lists = within(dialog).getAllByRole('list')
  return lists.length > 1 ? within(lists[1]).getAllByRole('listitem') : []
}

describe('TakeOrderDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  // ทดสอบ: รายการเมนูโชว์เฉพาะที่สั่งได้ (ไม่รวมปิดขาย/วัตถุดิบหมด) และค้นหาได้
  it('โชว์เฉพาะเมนูที่สั่งได้ ค้นหาได้ และบอกเมื่อไม่พบ', async () => {
    const { user, dialog } = setup()
    expect(within(dialog).getByText('กะเพรา')).toBeInTheDocument()
    expect(within(dialog).getByText('ชาเย็น')).toBeInTheDocument()
    expect(within(dialog).queryByText('ต้มยำ')).not.toBeInTheDocument()
    expect(within(dialog).queryByText('ปิดขายอยู่')).not.toBeInTheDocument()

    await user.type(within(dialog).getByPlaceholderText('ค้นหาเมนู'), 'ชา')
    expect(within(dialog).queryByText('กะเพรา')).not.toBeInTheDocument()
    await user.type(within(dialog).getByPlaceholderText('ค้นหาเมนู'), 'xxx')
    expect(dialog).toHaveTextContent('ไม่พบเมนูที่ค้นหา')
  })

  // ทดสอบ: ระหว่างโหลดเมนู บอกว่ากำลังโหลด ไม่ขึ้น "ไม่พบเมนู"
  it('กำลังโหลด → "กำลังโหลด..." ไม่ขึ้นไม่พบเมนู', () => {
    const { dialog } = setup(null)
    expect(dialog).toHaveTextContent('กำลังโหลด...')
    expect(dialog).not.toHaveTextContent('ไม่พบเมนูที่ค้นหา')
  })

  // ทดสอบ: ยังไม่มีรายการ ปุ่มส่งเข้าครัวกดไม่ได้ / เมนูไม่มีตัวเลือกเพิ่มแล้วส่งได้ทันที
  it('ยังไม่มีรายการกดส่งไม่ได้ / เพิ่มชาเย็น 2 แก้ว → ส่งพร้อมโต๊ะและบิล แล้วปิดเมื่อสำเร็จ', async () => {
    const { user, dialog } = setup()
    const send = within(dialog).getByRole('button', { name: 'ส่งเข้าครัว' })
    expect(send).toBeDisabled()

    await user.click(addButton(dialog, 'ชาเย็น'))
    await user.click(within(lines(dialog)[0]).getByRole('button', { name: 'เพิ่มจำนวน' }))
    await user.type(within(dialog).getByPlaceholderText('หมายเหตุของ ชาเย็น เช่น ไม่เผ็ด'), 'หวานน้อย')
    expect(dialog).toHaveTextContent('2 รายการ')
    expect(dialog).toHaveTextContent('฿50')

    await user.click(send)
    expect(mutate).toHaveBeenCalledWith(
      {
        tableId: 't5',
        tableSessionId: 's1',
        lines: [{ menuItemId: 'm-tea', quantity: 2, note: 'หวานน้อย', optionIds: [] }],
      },
      expect.anything(),
    )
    const { onSuccess } = mutate.mock.calls[0][1]
    act(() => onSuccess())
    expect(onClose).toHaveBeenCalled()
  })

  // ทดสอบ: เมนูที่บังคับเลือกเนื้อสัตว์ ส่งไม่ได้จนกว่าจะเลือก, ตัวเลือกที่ปิดขายไม่โชว์, ราคาคิดรวมตัวเลือก
  it('กะเพรา: ต้องเลือกเนื้อสัตว์ก่อน ตัวเลือกปิดขายไม่โชว์ ราคารวมตัวเลือก', async () => {
    const { user, dialog } = setup()
    await user.click(addButton(dialog, 'กะเพรา'))
    const line = lines(dialog)[0]
    expect(line).toHaveTextContent('เลือกเนื้อสัตว์ก่อน')
    expect(within(line).queryByRole('button', { name: /เนื้อ \+30/ })).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'ส่งเข้าครัว' })).toBeDisabled()

    // กลุ่มเลือกอันเดียว: กดหมูแล้วกดกุ้ง → เหลือกุ้งอันเดียว
    await user.click(within(line).getByRole('button', { name: 'หมู' }))
    await user.click(within(line).getByRole('button', { name: 'กุ้ง +20' }))
    expect(within(line).getByRole('button', { name: 'หมู' })).toHaveAttribute('aria-pressed', 'false')
    // กลุ่มเลือกหลายอัน: ติ๊กไข่ดาว → ติ๊กออก → ติ๊กใหม่
    const egg = within(line).getByRole('button', { name: 'ไข่ดาว +10' })
    await user.click(egg)
    await user.click(egg)
    expect(egg).toHaveAttribute('aria-pressed', 'false')
    await user.click(egg)

    expect(line).not.toHaveTextContent('เลือกเนื้อสัตว์ก่อน')
    expect(within(line).getByText('฿90')).toBeInTheDocument() // 60 + 20 + 10
    await user.click(within(dialog).getByRole('button', { name: 'ส่งเข้าครัว' }))
    expect(mutate.mock.calls[0][0].lines).toEqual([
      { menuItemId: 'm-kaprao', quantity: 1, note: '', optionIds: ['o-shrimp', 'o-egg'] },
    ])
  })

  // ทดสอบ: เมนูเดียวกันกดเพิ่มสองครั้งได้สองบรรทัด (คนละตัวเลือกได้) และลบทีละบรรทัดได้
  it('เพิ่มเมนูเดิมซ้ำ = แยกบรรทัด ลบทีละบรรทัดได้', async () => {
    const { user, dialog } = setup()
    await user.click(addButton(dialog, 'ชาเย็น'))
    await user.click(addButton(dialog, 'ชาเย็น'))
    expect(lines(dialog)).toHaveLength(2)
    await user.click(within(lines(dialog)[0]).getByRole('button', { name: 'ลบ ชาเย็น' }))
    expect(lines(dialog)).toHaveLength(1)
    expect(dialog).toHaveTextContent('1 รายการ')
  })

  // ทดสอบ: เลือกเนื้อสัตว์ไว้แล้วตัวเลือกนั้นหมดระหว่างรับออเดอร์ → ต้องเลือกใหม่ และไม่ส่งตัวที่หมด
  it('ตัวเลือกที่เลือกไว้หมดระหว่างรับออเดอร์ → กลับไปต้องเลือกใหม่', async () => {
    const { user, dialog } = setup()
    await user.click(addButton(dialog, 'กะเพรา'))
    await user.click(within(lines(dialog)[0]).getByRole('button', { name: 'หมู' }))
    expect(within(dialog).getByRole('button', { name: 'ส่งเข้าครัว' })).toBeEnabled()

    const porkGone = {
      ...kaprao,
      optionGroups: kaprao.optionGroups.map((g) => ({
        ...g,
        options: g.options.map((o) => (o.id === 'o-pork' ? { ...o, ingredientOutOfStock: true } : o)),
      })),
    }
    vi.mocked(useMenuItems).mockReturnValue({ data: [porkGone, tea], isPending: false } as never)
    await user.type(within(dialog).getByPlaceholderText('ค้นหาเมนู'), ' ') // ให้ render ใหม่
    expect(lines(dialog)[0]).toHaveTextContent('เลือกเนื้อสัตว์ก่อน')
    expect(within(dialog).getByRole('button', { name: 'ส่งเข้าครัว' })).toBeDisabled()
  })

  // ทดสอบ: กดส่งซ้ำเร็ว ๆ ก่อน isPending เปลี่ยน ต้องส่งครั้งเดียว และปลดล็อกเมื่อ settle
  it('กดส่งสองครั้งติดกัน → ส่งครั้งเดียว ปลดล็อกหลัง onSettled', async () => {
    const { user, dialog } = setup()
    await user.click(addButton(dialog, 'ชาเย็น'))
    const send = within(dialog).getByRole('button', { name: 'ส่งเข้าครัว' })
    await user.click(send)
    await user.click(send)
    expect(mutate).toHaveBeenCalledTimes(1)
    act(() => mutate.mock.calls[0][1].onSettled())
    await user.click(send)
    expect(mutate).toHaveBeenCalledTimes(2)
  })

  // ทดสอบ: กำลังส่งปุ่มเปลี่ยนข้อความ และ error จาก backend โชว์ในกล่อง / ยกเลิกปิดกล่อง
  it('กำลังส่ง → "กำลังส่ง..." กดไม่ได้, error โชว์ในกล่อง, ยกเลิก → ปิด', async () => {
    const { user, dialog } = setup(undefined, { isPending: true, error: new Error('โต๊ะนี้ปิดบิลไปแล้ว') })
    expect(within(dialog).getByRole('button', { name: 'กำลังส่ง...' })).toBeDisabled()
    expect(dialog).toHaveTextContent('โต๊ะนี้ปิดบิลไปแล้ว')
    await user.click(within(dialog).getByRole('button', { name: 'ยกเลิก' }))
    expect(onClose).toHaveBeenCalled()
  })
})
