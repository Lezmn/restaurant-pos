import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma, TableSessionStatus } from '@prisma/client';
import { OrdersService } from '../../../src/orders/orders.service';

/** ส่วนของ OrdersService ที่ orders.service.spec.ts ยังไม่ครอบ: findAll, เพิ่ม/ลบรายการกับสต็อก, เคลียร์บอร์ด */
const D = (v: number | string) => new Prisma.Decimal(v);

function stored(status: OrderStatus, overrides: Record<string, unknown> = {}) {
  return {
    id: 'o1',
    status,
    tableId: 't1',
    tableSessionId: 's1',
    paymentId: null,
    clearedAt: null,
    items: [
      { id: 'i1', quantity: 2, unitPrice: D(60), selectedOptions: [], stockUsed: { egg: 2 } },
      { id: 'i2', quantity: 1, unitPrice: D(15), selectedOptions: [], stockUsed: null },
    ],
    ...overrides,
  };
}

const menu = (overrides: Record<string, unknown> = {}) => ({
  id: 'm1',
  name: 'ไข่เจียว',
  price: D(40),
  isAvailable: true,
  proteinRequired: false,
  ingredients: [{ ingredient: { id: 'egg', name: 'ไข่', isAvailable: true, stockQty: 1 }, usageQty: 1 }],
  options: [],
  ...overrides,
});

function setup() {
  const prisma: any = {
    order: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(async ({ data }: any) => ({ ...stored(OrderStatus.SERVED), ...data })),
    },
    orderItem: { create: jest.fn(), delete: jest.fn() },
    menuItem: { findUnique: jest.fn() },
    ingredient: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  prisma.$transaction = jest.fn((fn: any) => fn(prisma));
  const events: any = { emitToStaffAndSession: jest.fn(), emitToEveryone: jest.fn() };
  const service = new OrdersService(prisma, events, {} as any);
  return { prisma, events, service };
}

describe('OrdersService.findAll', () => {
  it('มี filter → ใช้ตามนั้น', async () => {
    const { prisma, service } = setup();
    await service.findAll({ status: OrderStatus.PENDING } as any);
    expect(prisma.order.findMany.mock.calls[0][0].where).toEqual({
      status: OrderStatus.PENDING,
      tableId: undefined,
      tableSessionId: undefined,
    });
  });

  it('ไม่มี filter → เฉพาะโต๊ะที่เปิดอยู่ / ออเดอร์ที่ยังไม่จบ / ของวันนี้', async () => {
    const { prisma, service } = setup();
    await service.findAll({} as any);
    const where = prisma.order.findMany.mock.calls[0][0].where;
    expect(where.OR).toHaveLength(3);
    expect(where.OR[0]).toEqual({ tableSession: { status: TableSessionStatus.OPEN } });
    expect(where.OR[1].status.in).toEqual([OrderStatus.PENDING, OrderStatus.PREPARING, OrderStatus.SERVED]);
    const today = where.OR[2].createdAt.gte as Date;
    expect([today.getHours(), today.getMinutes(), today.getSeconds()]).toEqual([0, 0, 0]);
  });
});

describe('OrdersService.addItem', () => {
  it('เมนูไม่มีอยู่จริง/ปิดขาย → 400', async () => {
    const { prisma, service } = setup();
    prisma.order.findUnique.mockResolvedValue(stored(OrderStatus.PENDING));
    prisma.menuItem.findUnique.mockResolvedValue(null);
    await expect(service.addItem('o1', { menuItemId: 'm1', quantity: 1 })).rejects.toBeInstanceOf(BadRequestException);
    prisma.menuItem.findUnique.mockResolvedValue(menu({ isAvailable: false }));
    await expect(service.addItem('o1', { menuItemId: 'm1', quantity: 1 })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.orderItem.create).not.toHaveBeenCalled();
  });

  it('เพิ่มได้: ตัดสต็อก บันทึกราคาจาก DB แจ้งครัว และถ้าวัตถุดิบหมดพอดีแจ้งทุกจอให้โหลดเมนูใหม่', async () => {
    const { prisma, events, service } = setup();
    prisma.order.findUnique.mockResolvedValue(stored(OrderStatus.PREPARING));
    prisma.menuItem.findUnique.mockResolvedValue(menu());
    await service.addItem('o1', { menuItemId: 'm1', quantity: 1, note: 'ไม่ใส่ผงชูรส' });

    expect(prisma.ingredient.updateMany).toHaveBeenCalledWith({
      where: { id: 'egg', stockQty: { gte: 1 } },
      data: { stockQty: { decrement: 1 } },
    });
    const data = prisma.orderItem.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ orderId: 'o1', menuItemId: 'm1', quantity: 1, note: 'ไม่ใส่ผงชูรส' });
    expect(data.unitPrice).toEqual(D(40));
    expect(events.emitToStaffAndSession).toHaveBeenCalledWith('s1', 'order.updated', expect.any(Object));
    expect(events.emitToEveryone).toHaveBeenCalledWith('menu.updated', expect.any(Object));
  });

  it('สต็อกไม่พอ → 400 ไม่เพิ่มรายการ', async () => {
    const { prisma, service } = setup();
    prisma.order.findUnique.mockResolvedValue(stored(OrderStatus.PENDING));
    prisma.menuItem.findUnique.mockResolvedValue(menu());
    prisma.ingredient.updateMany.mockResolvedValueOnce({ count: 0 });
    prisma.ingredient.findUnique.mockResolvedValue({ name: 'ไข่', stockQty: 0 });
    await expect(service.addItem('o1', { menuItemId: 'm1', quantity: 1 })).rejects.toThrow(/ไข่.*ไม่พอ/);
    expect(prisma.orderItem.create).not.toHaveBeenCalled();
  });
});

describe('OrdersService.removeItem', () => {
  it('ครัวยังไม่เริ่ม (PENDING) → ลบแล้วคืนสต็อก และเปิดวัตถุดิบที่หมดกลับ', async () => {
    const { prisma, events, service } = setup();
    prisma.order.findUnique.mockResolvedValue(stored(OrderStatus.PENDING));
    prisma.ingredient.findMany.mockResolvedValue([{ id: 'egg', stockQty: 0, isAvailable: false }]);
    await service.removeItem('o1', 'i1');
    expect(prisma.orderItem.delete).toHaveBeenCalledWith({ where: { id: 'i1' } });
    expect(prisma.ingredient.update).toHaveBeenCalledWith({
      where: { id: 'egg' },
      data: { stockQty: { increment: 2 } },
    });
    expect(events.emitToEveryone).toHaveBeenCalledWith('menu.updated', expect.any(Object));
  });

  it('ครัวเริ่มทำแล้ว (PREPARING) → ลบได้แต่ไม่คืนสต็อก (ของถูกใช้ไปแล้ว)', async () => {
    const { prisma, events, service } = setup();
    prisma.order.findUnique.mockResolvedValue(stored(OrderStatus.PREPARING));
    await service.removeItem('o1', 'i1');
    expect(prisma.orderItem.delete).toHaveBeenCalled();
    expect(prisma.ingredient.findMany).not.toHaveBeenCalled();
    expect(events.emitToEveryone).not.toHaveBeenCalled();
  });
});

describe('OrdersService.markCleared', () => {
  it('เคลียร์แล้ว → คืนของเดิม ไม่เขียนซ้ำ', async () => {
    const { prisma, service } = setup();
    const already = stored(OrderStatus.SERVED, { clearedAt: new Date() });
    prisma.order.findUnique.mockResolvedValue(already);
    await expect(service.markCleared('o1')).resolves.toBe(already);
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('SERVED ยังไม่เคลียร์ → ใส่ clearedAt แล้วแจ้งจอ', async () => {
    const { prisma, events, service } = setup();
    prisma.order.findUnique.mockResolvedValue(stored(OrderStatus.SERVED));
    const res: any = await service.markCleared('o1');
    expect(res.clearedAt).toBeInstanceOf(Date);
    expect(events.emitToStaffAndSession).toHaveBeenCalledWith('s1', 'order.updated', expect.any(Object));
  });
});

describe('OrdersService.getTotal', () => {
  it('ไม่พบ → 404', async () => {
    const { prisma, service } = setup();
    prisma.order.findUnique.mockResolvedValue(null);
    await expect(service.getTotal('x')).rejects.toBeInstanceOf(NotFoundException);
  });

  // เคยบวกด้วย number ของ JS แล้วได้ 0.30000000000000004 — ตอนนี้บวกด้วย Decimal เหมือนตอนเก็บเงิน
  it('ราคาสตางค์รวมกันไม่เพี้ยนแบบ float (0.10 + 0.20 = 0.30)', async () => {
    const { prisma, service } = setup();
    prisma.order.findUnique.mockResolvedValue(
      stored(OrderStatus.SERVED, {
        items: [
          { id: 'a', quantity: 1, unitPrice: D('0.10'), selectedOptions: [] },
          { id: 'b', quantity: 1, unitPrice: D('0.20'), selectedOptions: [] },
        ],
      }),
    );
    const res = await service.getTotal('o1');
    expect(res.total).toBe(0.3);
  });
});
