/**
 * แปลงข้อมูลดิบจาก API ให้เป็น type ที่หน้าจอใช้
 * รวมความต่างทั้งหมดไว้ที่ไฟล์เดียว ถ้า backend เปลี่ยน field ก็แก้ที่นี่ที่เดียว
 */
import { MenuOptionGroupKind } from '@/types/enums'
import type {
  ApiMenuItem,
  ApiMenuOption,
  ApiOrder,
  ApiPayment,
  ApiReceipt,
  ApiServiceRequest,
  ApiTable,
  ApiTableSession,
  ApiUser,
} from '@/types/api'
import type {
  MenuItem,
  MenuOption,
  MenuOptionGroup,
  Order,
  Payment,
  Receipt,
  RestaurantTable,
  ServiceRequest,
  TableSession,
  User,
} from '@/types/models'

/** โต๊ะฝั่ง API เป็นตัวเลข แต่หน้าจอแสดงเป็นข้อความเสมอ */
const tableName = (table?: { number: number }) =>
  table ? String(table.number) : '-'

/** backend ไม่มีเลขที่ออเดอร์ — ใช้ 6 ตัวแรกของ uuid ให้พนักงานอ้างอิงกันได้ */
const orderRef = (id: string) => id.slice(0, 6).toUpperCase()

export const mapUser = (u: ApiUser): User => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  mustChangePassword: u.mustChangePassword ?? false,
})

export const mapTable = (t: ApiTable): RestaurantTable => ({
  id: t.id,
  name: String(t.number),
  seats: t.seats,
  status: t.status,
})

/**
 * MenuOption ฝั่ง backend เป็น array แบน มีฟิลด์ group บอกว่าอยู่กลุ่มไหน
 * ฝั่งหน้าจอต้องการเป็นกลุ่ม ๆ จึงจับกลุ่มที่นี่
 * เรียงตามลำดับนี้เสมอ ไม่ขึ้นกับลำดับที่ API ส่งมา
 */
const OPTION_GROUPS: {
  kind: MenuOptionGroupKind
  name: string
  selectType: MenuOptionGroup['selectType']
  required: boolean
}[] = [
  {
    kind: MenuOptionGroupKind.PROTEIN,
    name: 'เนื้อสัตว์',
    selectType: 'single',
    required: true,
  },
  {
    kind: MenuOptionGroupKind.EXTRA,
    name: 'เพิ่มเติม',
    selectType: 'multiple',
    required: false,
  },
]

const mapMenuOption = (o: ApiMenuOption): MenuOption => ({
  ingredientId: o.ingredientId ?? o.ingredient?.id ?? null,
  ingredientName: o.ingredient?.name ?? null,
  ingredientOutOfStock: o.ingredient ? !o.ingredient.isAvailable : false,
  ingredientStockQty: o.ingredient?.stockQty ?? null,
  usageQty: o.usageQty ?? 1,
  id: o.id,
  name: o.name,
  price: o.price,
  group: o.group ?? MenuOptionGroupKind.EXTRA,
  isAvailable: o.isAvailable,
})

/** ตัวเลือกที่ backend ไม่ได้ส่ง group มา ถือเป็น EXTRA ตาม default ของ schema */
const optionGroupsOf = (m: ApiMenuItem): MenuOptionGroup[] =>
  OPTION_GROUPS.flatMap((group) => {
    const options = (m.options ?? []).filter(
      (o) => (o.group ?? MenuOptionGroupKind.EXTRA) === group.kind,
    )
    if (options.length === 0) return []
    return [
      {
        id: `${m.id}-${group.kind.toLowerCase()}`,
        name: group.name,
        selectType: group.selectType,
        required: group.required,
        options: options.map(mapMenuOption),
      },
    ]
  })

export const mapMenuItem = (m: ApiMenuItem): MenuItem => {
  const ingredients = (m.ingredients ?? []).map(({ ingredient }) => ({
    id: ingredient.id,
    name: ingredient.name,
    isAvailable: ingredient.isAvailable,
  }))
  return {
    id: m.id,
    categoryId: m.categoryId,
    name: m.name,
    price: m.price,
    imageUrl: m.imageUrl,
    isAvailable: m.isAvailable,
    optionGroups: optionGroupsOf(m),
    ingredients,
    ingredientsOutOfStock: ingredients.filter((i) => !i.isAvailable).map((i) => i.name),
  }
}

export const mapOrder = (o: ApiOrder): Order => ({
  id: o.id,
  orderRef: orderRef(o.id),
  tableSessionId: o.tableSessionId ?? '',
  tableName: tableName(o.table),
  status: o.status,
  createdAt: o.createdAt,
  clearedAt: o.clearedAt ?? null,
  items: o.items.map((item) => ({
    id: item.id,
    menuItemId: item.menuItemId ?? '',
    // ทรง /public ส่ง name/options มาแบน ๆ ส่วนทรง /orders ซ้อนอยู่ใน menuItem/selectedOptions
    menuItemName: item.menuItem?.name ?? item.name ?? 'ไม่ทราบชื่อเมนู',
    imageUrl: item.menuItem?.imageUrl ?? null,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    note: item.note,
    optionNames: (item.selectedOptions ?? item.options ?? []).map((o) => o.name),
    optionsTotal: (item.selectedOptions ?? item.options ?? []).reduce(
      (sum, o) => sum + o.price,
      0,
    ),
  })),
})

export const mapSession = (s: ApiTableSession): TableSession => ({
  id: s.id,
  tableId: s.tableId,
  tableName: tableName(s.table),
  token: s.token,
  status: s.status,
  openedAt: s.openedAt,
  closedAt: s.closedAt,
  guestCount: s.guestCount ?? null,
  total: s.total ?? 0,
})

export const mapServiceRequest = (r: ApiServiceRequest): ServiceRequest => ({
  id: r.id,
  tableSessionId: r.tableSessionId ?? '',
  tableName: tableName(r.table),
  type: r.type,
  status: r.status,
  paymentMethod: r.paymentMethod,
  // backend ยังไม่มีฟิลด์หมายเหตุใน ServiceRequest
  note: null,
  createdAt: r.createdAt,
})

export const mapReceipt = (
  r: ApiReceipt,
  tableNameText: string,
): Receipt => ({
  id: r.id,
  number: r.number,
  subtotal: r.subtotal,
  discount: r.discount,
  total: r.total,
  issuedAt: r.issuedAt,
  tableName: tableNameText,
  note: r.note ?? null,
  items: (r.items ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    optionTotal: item.optionTotal,
    lineTotal: item.lineTotal,
    note: item.note,
  })),
})

/** fallbackTableName ใช้ตอน backend ไม่ได้ส่ง tableSession มาด้วย (เช่นตอน POST /payments) */
export const mapPayment = (p: ApiPayment, fallbackTableName?: string): Payment => {
  const table = p.tableSession?.table
    ? tableName(p.tableSession.table)
    : (fallbackTableName ?? '-')
  return {
    id: p.id,
    tableSessionId: p.tableSessionId,
    tableName: table,
    method: p.method,
    status: p.status,
    amount: p.amount,
    paidAt: p.paidAt,
    voidedAt: p.voidedAt ?? null,
    voidReason: p.voidReason ?? null,
    note: p.note ?? null,
    receipt: p.receipt ? mapReceipt(p.receipt, table) : null,
    slip: p.slipStatus
      ? {
          status: p.slipStatus,
          transRef: p.slipTransRef ?? null,
          message: p.slipMessage ?? null,
          attempts: p.slipAttempts ?? 0,
          overrideReason: p.slipOverrideReason ?? null,
          overrideByName: p.slipOverrideByName ?? null,
        }
      : null,
  }
}
