import { BadRequestException, ConflictException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { OrdersService } from '../../../src/orders/orders.service';

const D = (v: number) => new Prisma.Decimal(v);

const menuItem = {
  id: 'm1',
  name: 'กะเพรา',
  price: D(60),
  isAvailable: true,
  ingredients: [],
  options: [{ id: 'opt-pork', name: 'หมู', price: D(0), isAvailable: true, group: 'PROTEIN', ingredient: null }],
};

function makePrisma() {
  const prisma: any = {
    $executeRaw: jest.fn(),
    restaurantTable: {
      findUnique: jest.fn(),
      findFirst: jest.fn().mockResolvedValue({ id: 'tk', number: 0, isTakeaway: true }),
      create: jest.fn(({ data }: any) => Promise.resolve({ id: 'tk-new', ...data })),
      update: jest.fn(),
    },
    menuItem: { findMany: jest.fn().mockResolvedValue([menuItem]) },
    tableSession: {
      count: jest.fn().mockResolvedValue(4),
      create: jest.fn(({ data }: any) => Promise.resolve({ id: 'ts1', ...data })),
      findFirst: jest.fn(),
    },
    order: {
      create: jest.fn(({ data }: any) => Promise.resolve({ id: 'o1', status: OrderStatus.PENDING, ...data })),
    },
    ingredient: { findMany: jest.fn().mockResolvedValue([]) },
  };
  prisma.$transaction = jest.fn((fn: any) => fn(prisma));
  return prisma;
}

describe('OrdersService กลับบ้าน', () => {
  let prisma: any;
  let events: { emitToStaff: jest.Mock; emitToStaffAndSession: jest.Mock; emitToEveryone: jest.Mock };
  let service: OrdersService;

  beforeEach(() => {
    prisma = makePrisma();
    events = { emitToStaff: jest.fn(), emitToStaffAndSession: jest.fn(), emitToEveryone: jest.fn() };
    service = new OrdersService(prisma, events as any, {} as any);
  });

  const items = [{ menuItemId: 'm1', quantity: 2, optionIds: ['opt-pork'] }];

  it('เปิดบิลกลับบ้านใบใหม่ เลขคิว = จำนวนบิลกลับบ้านวันนี้ + 1 แล้วสร้างออเดอร์ในบิลนั้น', async () => {
    const order: any = await service.createTakeaway({ customerName: 'คุณเอ', items });

    expect(prisma.$executeRaw).toHaveBeenCalled();
    expect(prisma.tableSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tableId: 'tk',
        isTakeaway: true,
        takeawayNo: 5,
        customerName: 'คุณเอ',
        expiresAt: null,
      }),
    });
    expect(order.tableSessionId).toBe('ts1');
    expect(order.tableId).toBe('tk');
    expect(events.emitToStaff).toHaveBeenCalledWith('table-session.created', expect.anything());
    expect(events.emitToStaffAndSession).toHaveBeenCalledWith('ts1', 'order.created', expect.anything());
  });

  it('ยังไม่มีโต๊ะเสมือน → สร้างให้ (เลข 0 ไม่ชนโต๊ะจริง)', async () => {
    prisma.restaurantTable.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    await service.createTakeaway({ items });
    expect(prisma.restaurantTable.create).toHaveBeenCalledWith({
      data: { number: 0, seats: 0, isTakeaway: true },
    });
  });

  it('เลข 0 มีคนใช้แล้ว → ถอยไปเลขที่ต่ำกว่า', async () => {
    prisma.restaurantTable.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ number: 0 });
    await service.createTakeaway({ items });
    expect(prisma.restaurantTable.create).toHaveBeenCalledWith({
      data: { number: -1, seats: 0, isTakeaway: true },
    });
  });

  describe('สั่งเพิ่มให้บิลกลับบ้าน (POST /orders)', () => {
    beforeEach(() => {
      prisma.restaurantTable.findUnique.mockResolvedValue({ id: 'tk', isTakeaway: true });
    });

    it('ไม่ระบุบิล → 400 (โต๊ะเสมือนมีหลายบิลเปิดพร้อมกัน)', async () => {
      await expect(service.create({ tableId: 'tk', items })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('ระบุบิล → ค้นหาบิลนั้นตรง ๆ', async () => {
      prisma.tableSession.findFirst.mockResolvedValue({ id: 'ts9' });
      const order: any = await service.create({ tableId: 'tk', tableSessionId: 'ts9', items });
      expect(prisma.tableSession.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'ts9' }) }),
      );
      expect(order.tableSessionId).toBe('ts9');
    });

    it('บิลปิดไปแล้ว → 409', async () => {
      prisma.tableSession.findFirst.mockResolvedValue(null);
      await expect(service.create({ tableId: 'tk', tableSessionId: 'ts9', items })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });
});

describe('OrdersService ออเดอร์ที่จ่ายก่อนทำ (กลับบ้าน)', () => {
  const paidOrder = (status: OrderStatus) => ({
    id: 'o1',
    status,
    tableId: 'tk',
    tableSessionId: 'ts1',
    paymentId: 'pay-1',
    items: [],
  });

  function setup(status: OrderStatus) {
    const prisma: any = {
      order: {
        findUnique: jest.fn().mockResolvedValue(paidOrder(status)),
        findUniqueOrThrow: jest.fn().mockResolvedValue(paidOrder(OrderStatus.SERVED)),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    prisma.$transaction = jest.fn((fn: any) => fn(prisma));
    const events = { emitToStaffAndSession: jest.fn(), emitToEveryone: jest.fn() };
    return { prisma, service: new OrdersService(prisma, events as any, {} as any) };
  }

  it('ครัวทำ/เสิร์ฟต่อได้ทั้งที่จ่ายแล้ว', async () => {
    const { prisma, service } = setup(OrderStatus.PREPARING);
    await service.updateStatus('o1', OrderStatus.SERVED);
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'o1', status: OrderStatus.PREPARING, paymentId: 'pay-1' },
      data: { status: OrderStatus.SERVED, servedAt: expect.any(Date) },
    });
  });

  it('ยกเลิกออเดอร์ที่จ่ายแล้วไม่ได้ — ต้องยกเลิกบิลก่อน', async () => {
    const { prisma, service } = setup(OrderStatus.PENDING);
    await expect(service.updateStatus('o1', OrderStatus.CANCELLED)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it('เพิ่มรายการในออเดอร์ที่จ่ายแล้วไม่ได้', async () => {
    const { service } = setup(OrderStatus.PENDING);
    await expect(service.addItem('o1', { menuItemId: 'm1', quantity: 1 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
