import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { BillSplitStatus, OrderStatus, PaymentStatus, Prisma } from '@prisma/client';

/**
 * แยกบิล 2 แบบ
 *
 * 1) เลือกรายการ (carveOutItems) — ย้ายรายการที่คนหนึ่งจ่ายไปไว้ในออเดอร์ใหม่ แล้วเก็บเงินออเดอร์นั้นตามปกติ
 *    ไม่ต้องเปลี่ยนโมเดล "ออเดอร์ผูก payment ใบเดียว" ที่ทั้งระบบพึ่งอยู่ (ยกเลิกบิล, ปิดโต๊ะ, รายงานเมนูขายดี)
 *
 * 2) หารเท่ากัน (BillSplit) — ล็อกชุดออเดอร์ + ยอดไว้ รับเงินทีละคน คนสุดท้ายจ่ายเศษแล้วออเดอร์ถึงเป็น PAID
 */

/** key แรกของ pg_advisory_xact_lock(int, int) — ล็อกต่อ session กันสองเครื่องเริ่มหาร/รับส่วนเดียวกันพร้อมกัน */
const SPLIT_LOCK = 7_420_002;

export type ItemSelection = { orderItemId: string; quantity: number };

/** รวมรายการซ้ำ (กดเลือกจานเดียวกันสองครั้ง) ให้เหลือแถวเดียว */
function mergeSelections(selections: ItemSelection[]) {
  const merged = new Map<string, number>();
  for (const s of selections) merged.set(s.orderItemId, (merged.get(s.orderItemId) ?? 0) + s.quantity);
  return merged;
}

const SELECTED_ITEM_INCLUDE = {
  selectedOptions: true,
  order: { include: { items: { select: { id: true, quantity: true } } } },
} as const;

type SelectedItem = Prisma.OrderItemGetPayload<{ include: typeof SELECTED_ITEM_INCLUDE }>;

async function loadSelectedItems(db: Prisma.TransactionClient, selections: ItemSelection[]) {
  const merged = mergeSelections(selections);
  const items = await db.orderItem.findMany({
    where: { id: { in: [...merged.keys()] } },
    include: SELECTED_ITEM_INCLUDE,
  });
  if (items.length !== merged.size) {
    const found = new Set(items.map((i) => i.id));
    const missing = [...merged.keys()].filter((id) => !found.has(id));
    throw new NotFoundException(`ไม่พบรายการ id: ${missing.join(', ')} (อาจถูกจ่ายหรือแก้ไปจากอีกเครื่อง)`);
  }

  const sessionIds = new Set(items.map((i) => i.order.tableSessionId));
  if (sessionIds.size !== 1 || !items[0].order.tableSessionId) {
    throw new BadRequestException('เลือกรายการได้จากโต๊ะเดียวกันเท่านั้น');
  }
  for (const item of items) {
    const qty = merged.get(item.id)!;
    if (item.order.paymentId || item.order.status === OrderStatus.PAID) {
      throw new ConflictException('มีรายการที่ถูกเก็บเงินไปแล้ว กรุณารีเฟรชแล้วเลือกใหม่');
    }
    if (item.order.status !== OrderStatus.SERVED) {
      throw new BadRequestException('เลือกได้เฉพาะรายการที่เสิร์ฟแล้ว');
    }
    if (qty > item.quantity) {
      throw new BadRequestException(`เลือกเกินจำนวนที่สั่ง (สั่งไว้ ${item.quantity})`);
    }
  }
  return { items, merged, tableSessionId: items[0].order.tableSessionId };
}

const itemLineTotal = (item: SelectedItem, quantity: number) =>
  item.selectedOptions
    .reduce((sum, o) => sum.plus(o.price), new Prisma.Decimal(item.unitPrice))
    .mul(quantity);

/** ยอดของรายการที่เลือก โดยยังไม่ย้ายอะไร — ใช้ตรวจสลิป PromptPay ก่อนเข้า transaction */
export async function previewSelection(db: Prisma.TransactionClient, selections: ItemSelection[]) {
  const { items, merged, tableSessionId } = await loadSelectedItems(db, selections);
  const subtotal = items.reduce(
    (sum, item) => sum.plus(itemLineTotal(item, merged.get(item.id)!)),
    new Prisma.Decimal(0),
  );
  return { subtotal, tableSessionId: tableSessionId! };
}

/**
 * ย้ายรายการที่เลือกออกไปเป็นออเดอร์ใหม่ (ต่อออเดอร์ต้นทาง) แล้วคืน id ออเดอร์ที่จะเก็บเงิน
 * - เลือกครบทุกจานทุกจำนวนของออเดอร์ไหน = ใช้ออเดอร์นั้นทั้งใบ ไม่ต้องแตก
 * - เลือกบางจำนวน (น้ำ 3 ขวด จ่าย 1) = ลดจำนวนของเดิม + สร้างรายการใหม่ตามจำนวนที่จ่าย
 * ทุกการย้ายมีเงื่อนไขว่าค่ายังเหมือนตอนอ่าน — อีกเครื่องเก็บเงินรายการเดียวกันไปพอดี = 409 ทั้งใบ
 */
export async function carveOutItems(tx: Prisma.TransactionClient, selections: ItemSelection[]) {
  const { items, merged } = await loadSelectedItems(tx, selections);
  await releaseUnpaidSplits(tx, [...new Set(items.map((i) => i.order.id))]);

  const byOrder = new Map<string, SelectedItem[]>();
  for (const item of items) byOrder.set(item.orderId, [...(byOrder.get(item.orderId) ?? []), item]);

  const orderIds: string[] = [];
  for (const [orderId, picked] of byOrder) {
    const source = picked[0].order;
    const takesWholeOrder = source.items.every((it) => merged.get(it.id) === it.quantity);
    if (takesWholeOrder) {
      orderIds.push(orderId);
      continue;
    }

    const carved = await tx.order.create({
      data: {
        tableId: source.tableId,
        tableSessionId: source.tableSessionId,
        status: OrderStatus.SERVED,
        // เวลาสั่งเดิม — รายงานรายชั่วโมงไม่เพี้ยน / เสิร์ฟแล้ว ไม่ต้องขึ้นบอร์ดครัว
        createdAt: source.createdAt,
        clearedAt: source.clearedAt ?? new Date(),
        splitFromId: source.id,
      },
    });

    for (const item of picked) {
      const qty = merged.get(item.id)!;
      if (qty === item.quantity) {
        const moved = await tx.orderItem.updateMany({
          where: { id: item.id, orderId, quantity: item.quantity },
          data: { orderId: carved.id },
        });
        if (moved.count !== 1) throw conflict();
      } else {
        const reduced = await tx.orderItem.updateMany({
          where: { id: item.id, orderId, quantity: item.quantity },
          data: { quantity: item.quantity - qty },
        });
        if (reduced.count !== 1) throw conflict();
        await tx.orderItem.create({
          data: {
            orderId: carved.id,
            menuItemId: item.menuItemId,
            unitPrice: item.unitPrice,
            note: item.note,
            quantity: qty,
            // stockUsed ไม่คัดลอก: ของเสิร์ฟไปแล้ว ไม่มีการคืนสต็อกจากรายการนี้อีก
            selectedOptions: {
              create: item.selectedOptions.map((o) => ({
                name: o.name,
                price: o.price,
                menuOptionId: o.menuOptionId,
              })),
            },
          },
        });
      }
    }
    orderIds.push(carved.id);
  }
  return orderIds;
}

const conflict = () =>
  new ConflictException('รายการในบิลเพิ่งถูกแก้หรือเก็บเงินไปจากอีกเครื่อง กรุณารีเฟรชแล้วเลือกใหม่');

/** ล็อกการหาร/รับเงินแบบหารของ session นี้จนจบ transaction */
export function lockSessionSplit(tx: Prisma.TransactionClient, tableSessionId: string) {
  return tx.$executeRaw`SELECT pg_advisory_xact_lock(${SPLIT_LOCK}::int, hashtext(${tableSessionId}))`;
}

/**
 * ออเดอร์ที่จะเก็บเงินแบบปกติ/เลือกรายการ แต่อยู่ในชุดที่กำลังหารเท่ากัน
 * - ยังไม่มีใครจ่าย = แคชเชียร์เปลี่ยนใจ ยกเลิกการหารทิ้ง
 * - มีคนจ่ายไปแล้ว = ห้าม (เงินที่จ่ายไปจะไม่มีบิลรองรับ) ต้องรับต่อแบบหาร หรือยกเลิกส่วนที่จ่ายก่อน
 */
export async function releaseUnpaidSplits(tx: Prisma.TransactionClient, orderIds: string[]) {
  const splits = await tx.billSplit.findMany({
    where: { status: BillSplitStatus.OPEN, orders: { some: { id: { in: orderIds } } } },
    include: { payments: { where: { status: PaymentStatus.COMPLETED }, select: { id: true } } },
  });
  for (const split of splits) {
    if (split.payments.length > 0) {
      throw new ConflictException(
        `โต๊ะนี้กำลังหารจ่าย ${split.parts} คน (จ่ายแล้ว ${split.payments.length} คน) — รับเงินต่อแบบหาร หรือยกเลิกส่วนที่จ่ายไปก่อน`,
      );
    }
    await tx.order.updateMany({ where: { billSplitId: split.id }, data: { billSplitId: null } });
    await tx.billSplit.delete({ where: { id: split.id } });
  }
}

/** ส่วนของแต่ละคน: ปัดลงเป็นสตางค์ คนสุดท้ายจ่ายส่วนที่เหลือ (ไม่มีทางติดลบ) */
export function splitShare(total: Prisma.Decimal, parts: number, paidCount: number, paidSum: Prisma.Decimal) {
  if (paidCount >= parts - 1) return total.minus(paidSum);
  return total.div(parts).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
}
