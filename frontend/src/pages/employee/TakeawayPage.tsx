import { ErrorNote } from '@/components/ui/ErrorNote'
import { LoadError } from '@/components/ui/LoadError'
import { Modal } from '@/components/ui/Modal'
import { QuantityStepper } from '@/components/ui/QuantityStepper'
import { button, field } from '@/components/ui/styles'
import { toast } from '@/components/ui/toast'
import { useCategories, useMenuItems } from '@/features/menu/hooks'
import { useCreateTakeawayOrder, useOrders } from '@/features/orders/hooks'
import { formatBaht, formatTime } from '@/lib/format'
import { LIVE_POLL_MS } from '@/lib/live'
import { useSlashFocus } from '@/lib/use-slash-focus'
import { OrderStatus, PaymentMethod } from '@/types/enums'
import type { Id, MenuItem, MenuOptionGroup, Order } from '@/types/models'
import { sizedImageUrl } from '@/lib/image-url'
import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { isOrderable, orderableGroups } from './orderable'

/** หนึ่งบรรทัดในตะกร้า — เมนูเดียวกันคนละตัวเลือก/หมายเหตุ แยกบรรทัดกัน */
interface CartLine {
  key: number
  /** รายการราคาเปิดเป็น '' — ดู customName */
  menuItemId: Id
  /** รายการราคาเปิด (พิมพ์ชื่อ/ราคาเอง) — ไม่ผูกเมนู */
  customName?: string
  quantity: number
  note: string
  optionIds: Id[]
  optionNames: string[]
  /** ราคาต่อจาน (เมนู + ตัวเลือก) ณ ตอนกดเพิ่ม — backend คิดใหม่เองตอนบันทึก */
  unitPrice: number
}

const ALL = 'all'

/** ไอคอนจานสำหรับเมนูที่ไม่มีรูป / รูปโหลดไม่ขึ้น — วาดเอง ไม่ใช้อีโมจิ */
function PlateIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden className="h-10 w-10">
      <circle cx="24" cy="26" r="14" />
      <circle cx="24" cy="26" r="8" />
      <path d="M6 8v8a3 3 0 0 0 3 3v19M9 8v8M42 8c-3 2-4 6-4 11h4v19" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-5 w-5">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden className="h-4 w-4">
      <path d="m5 12 5 5 9-10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * หน้า POS สั่งกลับบ้าน — กดเมนูลงตะกร้า แล้วส่งเข้าครัว
 * - "เงินสด" / "PromptPay": ส่งเข้าครัว แล้วไปหน้ารับเงินของบิลนั้นทันที เลือกวิธีจ่ายไว้ให้แล้ว
 *   (เลิกมี "จ่ายตอนรับของ" — กลับบ้านจ่ายก่อนเสมอ)
 * แต่ละครั้งได้บิลใหม่พร้อมเลขคิวของวัน ("กลับบ้าน #3") ไว้เรียกลูกค้า
 */
export function TakeawayPage() {
  const navigate = useNavigate()
  const menuQuery = useMenuItems()
  const { data: categories } = useCategories()
  const createTakeaway = useCreateTakeawayOrder()
  // isPending ยังไม่ทันเป็น true ตอนกดครั้งที่สอง — ล็อกแบบ sync กันบิลซ้ำ
  const sending = useRef(false)

  const [category, setCategory] = useState<string>(ALL)
  const [search, setSearch] = useState('')
  const [lines, setLines] = useState<CartLine[]>([])
  const [nextKey, setNextKey] = useState(1)
  const [customerName, setCustomerName] = useState('')
  const [picking, setPicking] = useState<MenuItem | null>(null)
  /** รูปเมนูที่โหลดไม่ขึ้น (ลิงก์เสีย) — แสดงไอคอนจานแทนไอคอนรูปแตกของเบราว์เซอร์ */
  const [brokenImages, setBrokenImages] = useState<ReadonlySet<Id>>(() => new Set())
  /** ประกาศให้โปรแกรมอ่านหน้าจอรู้ว่าเพิ่มอะไรลงตะกร้า (การ์ดไม่เปลี่ยนหน้า) */
  const [announcement, setAnnouncement] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  useSlashFocus(searchRef)

  const items = menuQuery.data
  const itemById = useMemo(() => new Map((items ?? []).map((i) => [i.id, i])), [items])

  const usedCategoryIds = useMemo(() => new Set((items ?? []).map((i) => i.categoryId)), [items])
  const tabs = (categories ?? [])
    .filter((c) => usedCategoryIds.has(c.id))
    .sort((a, b) => a.sortOrder - b.sortOrder)

  const keyword = search.trim().toLowerCase()
  // ของหมดไปอยู่ท้ายสุด — ช่วงคนเยอะ แคชเชียร์ไล่ตาหาเฉพาะของที่ขายได้
  const visibleItems = (items ?? [])
    .filter(
      (i) =>
        (category === ALL || i.categoryId === category) &&
        (!keyword || i.name.toLowerCase().includes(keyword)),
    )
    .sort((a, b) => Number(isOrderable(b)) - Number(isOrderable(a)))

  const addLine = (line: Omit<CartLine, 'key'>) => {
    const name = line.customName ?? itemById.get(line.menuItemId)?.name ?? ''
    setAnnouncement(`เพิ่ม ${name} ${line.quantity} ลงตะกร้าแล้ว`)
    setLines((prev) => {
      // เมนูเดิม ตัวเลือกเดิม ไม่มีหมายเหตุ = เพิ่มจำนวนในบรรทัดเดิม ไม่ต้องแตกบรรทัดใหม่
      const sameKey = (l: CartLine) =>
        !l.customName &&
        !line.customName &&
        l.menuItemId === line.menuItemId &&
        !l.note &&
        !line.note &&
        l.optionIds.length === line.optionIds.length &&
        l.optionIds.every((id) => line.optionIds.includes(id))
      const existing = prev.find(sameKey)
      if (existing) {
        return prev.map((l) =>
          l === existing ? { ...l, quantity: Math.min(99, l.quantity + line.quantity) } : l,
        )
      }
      return [...prev, { ...line, key: nextKey }]
    })
    setNextKey((k) => k + 1)
  }

  const tapItem = (item: MenuItem) => {
    if (!isOrderable(item)) return
    // มีตัวเลือก (เนื้อสัตว์/ท็อปปิ้ง) ต้องเลือกก่อน — ไม่มีก็ลงตะกร้าเลย กดซ้ำ = เพิ่มจำนวน
    if (orderableGroups(item).length > 0) {
      setPicking(item)
      return
    }
    addLine({
      menuItemId: item.id,
      quantity: 1,
      note: '',
      optionIds: [],
      optionNames: [],
      unitPrice: item.price,
    })
  }

  const updateLine = (key: number, patch: Partial<CartLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const removeLine = (key: number) => setLines((prev) => prev.filter((l) => l.key !== key))
  /** ล้างทั้งตะกร้า — กดพลาดได้ง่ายช่วงรีบ จึงเลิกทำได้จาก toast */
  const clearCart = () => {
    const previous = lines
    setLines([])
    toast(`ล้างตะกร้าแล้ว (${previous.length} รายการ)`, {
      label: 'เลิกทำ',
      run: () => setLines(previous),
    })
  }

  const count = lines.reduce((n, l) => n + l.quantity, 0)
  const total = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0)
  // ระหว่างจัดตะกร้า ของอาจหมด (menu.updated) — backend จะปฏิเสธทั้งบิล เตือนไว้ก่อนกดส่ง
  const unavailable = lines.filter((l) => {
    if (l.customName) return false
    const item = itemById.get(l.menuItemId)
    if (!item || !isOrderable(item)) return true
    const ok = new Set(orderableGroups(item).flatMap((g) => g.options.map((o) => o.id)))
    return l.optionIds.some((id) => !ok.has(id))
  })

  /** ส่งเข้าครัว แล้วไปรับเงินทันทีด้วยวิธีจ่ายที่กด */
  const submit = (payNow: PaymentMethod) => {
    if (sending.current || lines.length === 0) return
    sending.current = true
    createTakeaway.mutate(
      {
        customerName,
        lines: lines
          .filter((l) => !l.customName)
          .map((l) => ({
            menuItemId: l.menuItemId,
            quantity: l.quantity,
            note: l.note,
            optionIds: l.optionIds,
          })),
        customLines: lines
          .filter((l) => l.customName)
          .map((l) => ({
            name: l.customName ?? '',
            price: l.unitPrice,
            quantity: l.quantity,
            note: l.note,
          })),
      },
      {
        onSuccess: (order) => {
          setLines([])
          setCustomerName('')
          navigate(`/employee/check?pay=${order.tableSessionId}&method=${payNow}`)
        },
        onSettled: () => {
          sending.current = false
        },
      },
    )
  }

  return (
    <div className="mx-auto max-w-7xl">
      {/* แท็บเล็ตแนวตั้งขึ้นไปแบ่งสองฝั่ง ตะกร้าอยู่ข้างเมนูเสมอ — ไม่ต้องเลื่อนลงไปดู */}
      <div className="md:grid md:grid-cols-[minmax(0,1fr)_19rem] md:items-start md:gap-5 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-6">
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
        <section aria-labelledby="takeaway-heading">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 id="takeaway-heading" className="text-2xl font-bold text-black">
                สั่งกลับบ้าน
              </h1>
              <p className="mt-1 text-base text-gray-600">กดเมนูเพื่อใส่ตะกร้า · ได้เลขคิวตอนส่งเข้าครัว</p>
            </div>
            <label className="relative w-full sm:w-64">
              <span className="sr-only">ค้นหาเมนู (กด / เพื่อค้นหา)</span>
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-gray-500">
                <SearchIcon />
              </span>
              <input
                ref={searchRef}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหาเมนู"
                className={`${field} mt-0 pl-10`}
              />
            </label>
          </div>

          <div
            role="group"
            aria-label="หมวดเมนู"
            className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
          >
            {[{ id: ALL, name: 'ทั้งหมด' }, ...tabs].map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={category === c.id}
                onClick={() => setCategory(c.id)}
                className={`min-h-11 shrink-0 rounded-full border-2 px-4 text-sm font-bold transition ${
                  category === c.id
                    ? 'border-brand-500 bg-brand-500 text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-brand-400'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          <div className="mt-4">
            {menuQuery.isError && (
              <LoadError
                what="เมนู"
                stale={Boolean(items)}
                error={menuQuery.error}
                onRetry={() => menuQuery.refetch()}
              />
            )}
            {menuQuery.isPending && <MenuSkeleton />}

            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visibleItems.map((item) => {
                const orderable = isOrderable(item)
                const inCart = lines
                  .filter((l) => l.menuItemId === item.id)
                  .reduce((n, l) => n + l.quantity, 0)
                const showImage = Boolean(item.imageUrl) && !brokenImages.has(item.id)
                // สร้างคลาสขอบทีละสถานะ — เดิมต่อ border-brand-400 ท้ายสตริงชนกับ border-gray-200 แล้วไม่ขึ้น
                const tone = itemTone(orderable, inCart)
                return (
                  <li key={item.id} className="flex">
                    <button
                      type="button"
                      disabled={!orderable}
                      onClick={() => tapItem(item)}
                      aria-label={itemAriaLabel(item.name, item.price, orderable, inCart)}
                      className={`relative flex w-full flex-col overflow-hidden rounded-xl border-2 text-left transition ${tone}`}
                    >
                      {/* รูปอยู่ในกรอบ 4:3 ตายตัว — รูปแนวตั้งใหญ่ ๆ เคยดันการ์ดสูงไม่เท่ากันทั้งแถว */}
                      <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-brand-50">
                        {showImage ? (
                          <img
                            // ขอรูปขนาดพอดีการ์ด — ลิงก์ Unsplash ต้นฉบับ ~3.5 MB/รูป ทำให้เปิดหน้านี้แล้วค้าง
                            src={item.imageUrl ? sizedImageUrl(item.imageUrl, 240) : undefined}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            onError={() => setBrokenImages((prev) => new Set(prev).add(item.id))}
                            className={`absolute inset-0 h-full w-full object-cover ${orderable ? '' : 'opacity-50 grayscale'}`}
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center text-brand-200">
                            <PlateIcon />
                          </div>
                        )}
                        {!orderable && (
                          <span className="absolute top-2 left-2 rounded-md bg-black px-2 py-0.5 text-sm font-bold text-white">
                            หมด
                          </span>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col gap-1 px-3 py-2">
                        {/* จองที่ 2 บรรทัด ราคาจะอยู่ระดับเดียวกันทั้งแถว */}
                        <p className="line-clamp-2 min-h-[2lh] text-sm leading-snug font-semibold text-text">{item.name}</p>
                        <p
                          className={`mt-auto text-base font-bold tabular-nums ${orderable ? 'text-price' : 'text-gray-600'}`}
                        >
                          {formatBaht(item.price)}
                        </p>
                      </div>
                      {inCart > 0 && (
                        <span className="absolute top-2 right-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-brand-500 px-2 text-sm font-bold text-white tabular-nums">
                          {inCart}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>

            {!menuQuery.isPending && items && visibleItems.length === 0 && (
              <p className="rounded-xl border-2 border-gray-200 px-6 py-10 text-center text-sm text-gray-600">
                ไม่พบเมนู{keyword ? ` “${search.trim()}”` : 'ในหมวดนี้'}
              </p>
            )}
          </div>
        </section>

        <aside id="takeaway-cart" className="mt-8 space-y-6 md:mt-0 lg:sticky lg:top-4">
          <section
            aria-labelledby="cart-heading"
            className="rounded-xl border-2 border-brand-75 bg-white p-4"
          >
            <div className="flex items-center justify-between">
              <h2 id="cart-heading" className="text-lg font-bold text-black">
                ตะกร้า
              </h2>
              {lines.length > 0 && (
                <button
                  type="button"
                  onClick={clearCart}
                  className="-mr-2 min-h-11 rounded-lg px-3 text-sm font-semibold text-danger-ink transition hover:bg-danger/5"
                >
                  ล้างตะกร้า
                </button>
              )}
            </div>

            {lines.length === 0 && (
              <p className="py-8 text-center text-sm text-gray-500">ยังไม่มีรายการ — กดเมนูเพื่อเพิ่ม</p>
            )}

            {lines.length > 0 && (
              <ul className="mt-3 max-h-[45vh] space-y-2 overflow-y-auto pr-1">
                {lines.map((line) => {
                  const item = itemById.get(line.menuItemId)
                  const name = line.customName ?? item?.name ?? 'เมนูถูกลบ'
                  const bad = unavailable.includes(line)
                  return (
                    <li
                      key={line.key}
                      className={`rounded-lg border px-3 py-2 ${
                        bad ? 'border-danger/50 bg-danger/5' : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-text">
                            {name}
                            {line.customName && (
                              <span className="ml-1.5 rounded bg-gray-100 px-1.5 text-xs font-semibold text-gray-700">
                                ราคาเปิด
                              </span>
                            )}
                          </p>
                          {line.optionNames.length > 0 && (
                            <p className="text-xs text-gray-600">{line.optionNames.join(', ')}</p>
                          )}
                          {bad && <p className="text-xs font-semibold text-danger-ink">หมดแล้ว — ลบออกก่อนส่ง</p>}
                        </div>
                        <p className="shrink-0 text-sm font-bold text-price tabular-nums">
                          {formatBaht(line.unitPrice * line.quantity)}
                        </p>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <QuantityStepper
                          min={1}
                          value={line.quantity}
                          onChange={(next) => updateLine(line.key, { quantity: Math.max(1, next) })}
                        />
                        <button
                          type="button"
                          onClick={() => removeLine(line.key)}
                          aria-label={`ลบ ${name}`}
                          className="-mr-2 min-h-11 min-w-11 rounded-lg px-3 text-sm font-semibold text-danger-ink transition hover:bg-danger/5"
                        >
                          ลบ
                        </button>
                      </div>
                      <input
                        value={line.note}
                        onChange={(e) => updateLine(line.key, { note: e.target.value })}
                        maxLength={200}
                        placeholder="หมายเหตุ เช่น ไม่เผ็ด แยกน้ำ"
                        aria-label={`หมายเหตุของ ${name}`}
                        className={`${field} mt-2 py-2 text-sm`}
                      />
                    </li>
                  )
                })}
              </ul>
            )}

            <label className="mt-4 block">
              <span className="text-sm font-semibold text-gray-700">ชื่อ/เบอร์ลูกค้า (ไม่บังคับ)</span>
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                maxLength={60}
                placeholder="เช่น คุณเอ 081-xxx"
                className={field}
              />
            </label>

            <div className="mt-4 flex items-center justify-between rounded-lg bg-brand-50 px-4 py-3">
              <span className="text-sm font-semibold text-gray-700">{count} รายการ</span>
              <span className="text-xl font-bold text-amount tabular-nums">{formatBaht(total)}</span>
            </div>

            <ErrorNote error={createTakeaway.error} />

            <div className="mt-3 grid gap-2">
              {/* ส่งเข้าครัวแล้วไปรับเงินทันที — เลือกวิธีจ่ายตรงนี้เลย ไม่ต้องกดซ้ำในหน้ารับเงิน */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={count === 0 || unavailable.length > 0 || createTakeaway.isPending}
                  onClick={() => submit(PaymentMethod.CASH)}
                  className={button('primary', 'lg')}
                >
                  {createTakeaway.isPending ? 'กำลังส่ง...' : 'เงินสด'}
                </button>
                <button
                  type="button"
                  disabled={count === 0 || unavailable.length > 0 || createTakeaway.isPending}
                  onClick={() => submit(PaymentMethod.PROMPTPAY)}
                  // สีน้ำเงิน PromptPay แยกจากปุ่มเงินสด — ไม่ต้องอ่านป้ายตอนรีบ
                  className={button('primary', 'lg').replace('bg-brand-500', 'bg-promptpay')}
                >
                  {createTakeaway.isPending ? 'กำลังส่ง...' : 'PromptPay'}
                </button>
              </div>
            </div>
          </section>

          <TakeawayQueue />
        </aside>
      </div>

      {/* จอเล็ก ตะกร้าอยู่ใต้เมนู — ปุ่มลอยพาลงไปดู */}
      {count > 0 && (
        <a
          href="#takeaway-cart"
          className="fixed inset-x-4 bottom-24 z-10 flex items-center justify-between rounded-xl bg-brand-500 px-5 py-3 font-bold text-white shadow-lg md:hidden"
        >
          <span>ตะกร้า {count} รายการ</span>
          <span className="tabular-nums">{formatBaht(total)}</span>
        </a>
      )}

      {picking && (
        <OptionPicker
          item={picking}
          onClose={() => setPicking(null)}
          onAdd={(line) => {
            addLine(line)
            setPicking(null)
          }}
        />
      )}
    </div>
  )
}

/** เลือกตัวเลือก (เนื้อสัตว์บังคับเลือก 1 / เพิ่มเติมเลือกได้หลายอัน) + จำนวน + หมายเหตุ */
function OptionPicker({
  item,
  onClose,
  onAdd,
}: Readonly<{
  item: MenuItem
  onClose: () => void
  onAdd: (line: Omit<CartLine, 'key'>) => void
}>) {
  const groups = orderableGroups(item)
  const [single, setSingle] = useState<Record<string, Id>>({})
  const [multi, setMulti] = useState<Id[]>([])
  const [quantity, setQuantity] = useState(1)
  const [note, setNote] = useState('')

  const pickedIds = [...Object.values(single), ...multi]
  const picked = groups.flatMap((g) => g.options).filter((o) => pickedIds.includes(o.id))
  const unitPrice = item.price + picked.reduce((sum, o) => sum + o.price, 0)
  const missing = groups.filter(
    (g: MenuOptionGroup) => g.required && g.selectType === 'single' && !single[g.id],
  )

  return (
    <Modal title={item.name} onClose={onClose}>
      {groups.map((group) => (
        <fieldset key={group.id} className="mt-1 mb-4">
          <legend className="text-sm font-semibold text-gray-700">
            {group.name}
            {group.required && <span className="ml-1 text-danger-ink">* เลือก 1</span>}
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {group.options.map((option) => {
              const checked =
                group.selectType === 'single' ? single[group.id] === option.id : multi.includes(option.id)
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={checked}
                  onClick={() => {
                    if (group.selectType === 'single') {
                      setSingle((s) => ({ ...s, [group.id]: option.id }))
                    } else {
                      setMulti((m) => (checked ? m.filter((id) => id !== option.id) : [...m, option.id]))
                    }
                  }}
                  className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 px-4 text-sm transition ${
                    checked
                      ? 'border-brand-500 bg-brand-500 font-bold text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-brand-400'
                  }`}
                >
                  {/* เครื่องหมายถูก — บอกว่าเลือกแล้วด้วยรูปทรง ไม่ใช่สีอย่างเดียว */}
                  {checked && <CheckIcon />}
                  {option.name}
                  {option.price > 0 && ` +${formatBaht(option.price)}`}
                </button>
              )
            })}
          </div>
        </fieldset>
      ))}

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={200}
        placeholder="หมายเหตุ เช่น ไม่เผ็ด"
        aria-label={`หมายเหตุของ ${item.name}`}
        className={field}
      />

      <div className="mt-4 flex items-center justify-between gap-3">
        <QuantityStepper value={quantity} min={1} onChange={(n) => setQuantity(Math.max(1, n))} />
        <button
          type="button"
          disabled={missing.length > 0}
          onClick={() =>
            onAdd({
              menuItemId: item.id,
              quantity,
              note: note.trim(),
              optionIds: pickedIds,
              optionNames: picked.map((o) => o.name),
              unitPrice,
            })
          }
          className={`${button('primary', 'lg')} flex-1`}
        >
          {missing.length > 0
            ? `เลือก${missing.map((g) => g.name).join(', ')}ก่อน`
            : `ใส่ตะกร้า ${formatBaht(unitPrice * quantity)}`}
        </button>
      </div>
    </Modal>
  )
}

const queueStatus = (orders: Order[]) => {
  if (orders.every((o) => o.status === OrderStatus.SERVED || o.status === OrderStatus.PAID)) {
    return { text: 'เสร็จแล้ว รอรับ', tone: 'bg-status-done/15 text-status-done-ink' }
  }
  if (orders.some((o) => o.status === OrderStatus.PREPARING)) {
    return { text: 'กำลังทำ', tone: 'bg-status-cooking/15 text-status-cooking-ink' }
  }
  return { text: 'รอคิวครัว', tone: 'bg-status-queue/15 text-status-queue-ink' }
}

/**
 * คิวกลับบ้านที่ลูกค้ายังไม่ได้รับของ — ครัวกด "ทำเสร็จเรียบร้อย" (ยกให้ลูกค้า) แล้วหายไปเอง
 * โชว์ว่าใบไหนเสร็จแล้ว จะได้เรียกเลขคิว และใบไหนยังไม่จ่าย
 */
function TakeawayQueue() {
  const { data: orders } = useOrders({ refetchInterval: LIVE_POLL_MS })

  const queue = useMemo(() => {
    const bySession = new Map<Id, Order[]>()
    for (const o of orders ?? []) {
      if (!o.isTakeaway || o.clearedAt || o.status === OrderStatus.CANCELLED) continue
      bySession.set(o.tableSessionId, [...(bySession.get(o.tableSessionId) ?? []), o])
    }
    return [...bySession.entries()]
      .map(([sessionId, list]) => ({
        sessionId,
        orders: list,
        label: list[0].placeLabel,
        createdAt: list[0].createdAt,
        paid: list.every((o) => o.paid),
      }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }, [orders])

  if (queue.length === 0) return null

  return (
    <section aria-labelledby="queue-heading" className="rounded-xl border-2 border-gray-200 bg-white p-4">
      <h2 id="queue-heading" className="text-lg font-bold text-black">
        คิวกลับบ้าน <span className="text-sm font-semibold text-gray-600">({queue.length})</span>
      </h2>
      {/* เห็น 3 คิว (แถวละ ~70px) ที่เหลือเลื่อนดูในกล่อง — หน้าไม่ยาวตามคิว */}
      <ul className="mt-2 max-h-[13.5rem] divide-y divide-gray-100 overflow-y-auto overscroll-contain pr-1">
        {queue.map((q) => {
          const status = queueStatus(q.orders)
          return (
            <li key={q.sessionId} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate font-bold text-black">{q.label}</p>
                <p className="text-xs text-gray-600">
                  สั่ง {formatTime(q.createdAt)} ·{' '}
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${status.tone}`}>{status.text}</span>
                </p>
              </div>
              {q.paid ? (
                <span className="shrink-0 text-sm font-semibold text-success-ink">จ่ายแล้ว</span>
              ) : (
                <Link
                  to={`/employee/check?pay=${q.sessionId}`}
                  className={`${button('outline', 'sm')} shrink-0`}
                >
                  รับเงิน
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function MenuSkeleton() {
  return (
    <div aria-hidden className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="overflow-hidden rounded-xl border-2 border-gray-100">
          <div className="aspect-[4/3] animate-pulse bg-gray-100" />
          <div className="h-16" />
        </div>
      ))}
    </div>
  )
}

function itemTone(orderable: boolean, inCart: number) {
  if (!orderable) return 'cursor-not-allowed border-gray-200 bg-gray-50'
  return inCart > 0
    ? 'border-brand-500 bg-white'
    : 'border-gray-200 bg-white hover:border-brand-400 active:scale-[0.98]'
}

function itemAriaLabel(name: string, price: Parameters<typeof formatBaht>[0], orderable: boolean, inCart: number) {
  const soldOut = orderable ? '' : ' (หมด)'
  const cart = inCart > 0 ? ` · ในตะกร้า ${inCart}` : ''
  return `${name} ${formatBaht(price)}${soldOut}${cart}`
}
