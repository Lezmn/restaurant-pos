import { AuditContext } from './audit.decorator';
import { PrismaService } from '../prisma/prisma.service';

/**
 * ตัวโหลดข้อมูล "ก่อนทำรายการ" ของ @Audit(..., { before })
 * ของที่ถูกลบ/ค่าเก่าก่อนแก้ ต้องอ่านไว้ก่อน ไม่งั้นประวัติจะเหลือแค่ id ที่เปิดดูไม่ได้แล้ว
 */

/** โต๊ะของบิลที่กำลังจะรับเงิน (ทั้งโต๊ะ หรือออเดอร์แรกตอนแยก/รวมบิล) */
export async function loadPayingTable(prisma: PrismaService, ctx: AuditContext) {
  const sessionId = ctx.body.tableSessionId as string | undefined;
  const orderIds = ctx.body.orderIds as string[] | undefined;
  if (orderIds?.length) {
    const order = await prisma.order.findUnique({
      where: { id: orderIds[0] },
      select: { table: { select: { number: true } } },
    });
    return { tableNumber: order?.table.number ?? null };
  }
  if (!sessionId) return { tableNumber: null };
  const session = await prisma.tableSession.findUnique({
    where: { id: sessionId },
    select: { table: { select: { number: true } } },
  });
  return { tableNumber: session?.table.number ?? null };
}

export async function loadPayment(prisma: PrismaService, ctx: AuditContext) {
  return prisma.payment.findUnique({
    where: { id: ctx.params.id },
    select: {
      amount: true,
      method: true,
      receipt: { select: { number: true } },
      tableSession: { select: { table: { select: { number: true } } } },
    },
  });
}

export async function loadOrderItem(prisma: PrismaService, ctx: AuditContext) {
  return prisma.orderItem.findFirst({
    where: { id: ctx.params.itemId, orderId: ctx.params.id },
    select: {
      quantity: true,
      unitPrice: true,
      note: true,
      menuItem: { select: { name: true } },
      selectedOptions: { select: { name: true } },
      order: { select: { status: true, table: { select: { number: true } } } },
    },
  });
}

export async function loadOrder(prisma: PrismaService, ctx: AuditContext) {
  return prisma.order.findUnique({
    where: { id: ctx.params.id },
    select: {
      status: true,
      table: { select: { number: true } },
      items: {
        select: { quantity: true, unitPrice: true, menuItem: { select: { name: true } } },
      },
    },
  });
}

export async function loadExpense(prisma: PrismaService, ctx: AuditContext) {
  return prisma.expense.findUnique({
    where: { id: ctx.params.id },
    select: { title: true, amount: true, category: true, paidFromDrawer: true, spentAt: true },
  });
}

export async function loadCashClose(prisma: PrismaService, ctx: AuditContext) {
  return prisma.dailyCashClose.findUnique({
    where: { id: ctx.params.id },
    select: { date: true, expectedCash: true, countedCash: true, difference: true, closedByName: true },
  });
}

export async function loadMenuItem(prisma: PrismaService, ctx: AuditContext) {
  return prisma.menuItem.findUnique({
    where: { id: ctx.params.id },
    select: { name: true, price: true, isAvailable: true },
  });
}

export async function loadUser(prisma: PrismaService, ctx: AuditContext) {
  return prisma.user.findUnique({
    where: { id: ctx.params.id },
    select: { name: true, email: true, role: true, isActive: true },
  });
}
