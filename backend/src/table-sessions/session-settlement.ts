import {
  OrderStatus,
  Prisma,
  ServiceRequestStatus,
  TableSessionStatus,
  TableStatus,
} from '@prisma/client';

/**
 * ตัวช่วยปิดบิลของ session — ใช้ร่วมกันระหว่างจ่ายเงิน (payments) กับยกเลิกออเดอร์ (orders)
 * ทุกฟังก์ชันรับ tx เพื่อให้อยู่ในทรานแซกชันเดียวกับงานที่เรียก
 */

/** ออเดอร์ที่ยังต้องเก็บเงิน = ไม่ยกเลิก และยังไม่ผูกกับ payment */
export function countUnpaidOrders(
  tx: Prisma.TransactionClient,
  tableSessionId: string,
) {
  return tx.order.count({
    where: {
      tableSessionId,
      status: { not: OrderStatus.CANCELLED },
      paymentId: null,
    },
  });
}

/**
 * ปิด session + คืนโต๊ะว่าง + ปิดคำขอที่ค้าง (เช็คบิล/เรียกพนักงาน) ถ้าไม่เหลือยอดค้างจ่ายแล้ว
 *
 * requirePaidOrder: ต้องมีออเดอร์ที่จ่ายแล้วอย่างน้อยหนึ่งใบด้วยถึงจะปิด
 * ใช้ตอนยกเลิกออเดอร์ — ถ้ายกเลิกหมดโดยไม่เคยจ่ายเลย ลูกค้ายังนั่งอยู่ (อาจสั่งใหม่) ห้ามปิดโต๊ะเอง
 *
 * คืน true ถ้าปิด session ในรอบนี้
 */
export async function closeSessionIfSettled(
  tx: Prisma.TransactionClient,
  tableSessionId: string,
  options: { requirePaidOrder?: boolean } = {},
) {
  if ((await countUnpaidOrders(tx, tableSessionId)) > 0) return false;

  if (options.requirePaidOrder) {
    const paidCount = await tx.order.count({
      where: { tableSessionId, paymentId: { not: null } },
    });
    if (paidCount === 0) return false;
  }

  // ปิดเฉพาะ session ที่ยังเปิดอยู่ — กันปิดซ้ำ / ไปเขียนทับ session ที่หมดอายุไปแล้ว
  const closed = await tx.tableSession.updateMany({
    where: { id: tableSessionId, status: TableSessionStatus.OPEN },
    data: { status: TableSessionStatus.CLOSED, closedAt: new Date() },
  });
  if (closed.count === 0) return false;

  const session = await tx.tableSession.findUniqueOrThrow({
    where: { id: tableSessionId },
    select: { tableId: true },
  });
  await tx.restaurantTable.update({
    where: { id: session.tableId },
    data: { status: TableStatus.AVAILABLE },
  });
  // จ่ายครบแล้วคำขอของโต๊ะนี้ก็จบตาม ไม่งั้นป๊อปอัปเรียกพนักงาน/เช็คบิลค้างอยู่บนจอ POS
  await tx.serviceRequest.updateMany({
    where: { tableSessionId, status: ServiceRequestStatus.PENDING },
    data: { status: ServiceRequestStatus.RESOLVED, resolvedAt: new Date() },
  });
  return true;
}
