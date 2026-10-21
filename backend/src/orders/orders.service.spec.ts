import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma, TableSessionStatus, TableStatus } from '@prisma/client';
import { OrdersService } from './orders.service';

const D = (v: number) => new Prisma.Decimal(v);

function menuItem(overrides: Partial<any> = {}) {
  return {
    id: 'm1',
    name: 'กะเพรา',
    price: D(60),
    isAvailable: true,
    ingredients: [],
    options: [
      { id: 'opt-pork', name: 'หมู', price: D(0), isAvailable: true, ingredient: null },
      { id: 'opt-egg', name: 'ไข่ดาว', price: D(10), isAvailable: true, ingredient: { name: 'ไข่', isAvailable: true } },
      { id: 'opt-off', name: 'ปิดขาย', price: D(5), isAvailable: false, ingredient: null },
    ],
    ...overrides,
  };
}

function storedOrder(status: OrderStatus, overrides: Partial<any> = {}) {
  return {
    id: 'o1',
    status,
    tableId: 't1',
    tableSessionId: 's1',
    clearedAt: null,
    items: [
      { id: 'i1', quantity: 2, unitPrice: D(60), selectedOptions: [{ price: D(10) }] },
      { id: 'i2', quantity: 1, unitPrice: D(15.5), selectedOptions: [] },
    ],
    ...overrides,
  };
}

function makePrisma() {
  const prisma: any = {
    restaurantTable: { findUnique: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
    menuItem: { findMany: jest.fn(), findUnique: jest.fn() },
    tableSession: { findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn() },
    order: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn(),
    },
    orderItem: { create: jest.fn(), delete: jest.fn() },
  };
  prisma.$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));
  return prisma;
}

describe('OrdersService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let events: { emitToStaffAndSession: jest.Mock };
  let tableSessions: { resolveOpenSessionByToken: jest.Mock };
  let service: OrdersService;

  beforeEach(() => {
    prisma = makePrisma();
    events = { emitToStaffAndSession: jest.fn() };
    tableSessions = { resolveOpenSessionByToken: jest.fn() };
    service = new OrdersService(prisma, events as any, tableSessions as any);
    prisma.order.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'new', status: OrderStatus.PENDING, ...data }),
    );
  });

  describe('state machine ของ updateStatus', () => {
    const allowed: [OrderStatus, OrderStatus][] = [
      [OrderStatus.PENDING, OrderStatus.PREPARING],
      [OrderStatus.PENDING, OrderStatus.CANCELLED],
      [OrderStatus.PREPARING, OrderStatus.SERVED],
      [OrderStatus.PREPARING, OrderStatus.CANCELLED],
      [OrderStatus.SERVED, OrderStatus.CANCELLED],
    ];
    const rejected: [OrderStatus, OrderStatus][] = [
      [OrderStatus.PENDING, OrderStatus.SERVED],
      [OrderStatus.PENDING, OrderStatus.PAID],
      [OrderStatus.PREPARING, OrderStatus.PENDING],
      [OrderStatus.SERVED, OrderStatus.PREPARING],
      [OrderStatus.SERVED, OrderStatus.PAID], // จ่ายเงินต้องผ่าน /payments เท่านั้น
      [OrderStatus.PAID, OrderStatus.CANCELLED],
      [OrderStatus.CANCELLED, OrderStatus.PENDING],
      [OrderStatus.PENDING, OrderStatus.PENDING],
    ];

    it.each(allowed)('%s → %s อนุญาต', async (from, to) => {
      prisma.order.findUnique.mockResolvedValue(storedOrder(from));
      prisma.order.updateMany.mockResolvedValue({ count: 1 });
      prisma.order.findUniqueOrThrow.mockResolvedValue(storedOrder(to));
      prisma.tableSession.findFirst.mockResolvedValue({ id: 's1' });
      await expect(service.updateStatus('o1', to)).resolves.toMatchObject({ status: to });
    });

    it.each(rejected)('%s → %s ถูกปฏิเสธ (400)', async (from, to) => {
      prisma.order.findUnique.mockResolvedValue(storedOrder(from));
      await expect(service.updateStatus('o1', to)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    });

    it('ออเดอร์ถูกเก็บเงินไปพอดีระหว่างเปลี่ยนสถานะ → 409', async () => {
      prisma.order.findUnique.mockResolvedValue(storedOrder(OrderStatus.SERVED));
      prisma.order.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.updateStatus('o1', OrderStatus.CANCELLED)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('ไม่พบออเดอร์ → 404', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      await expect(service.updateStatus('x', OrderStatus.PREPARING)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('create (พนักงาน)', () => {
    beforeEach(() => {
      prisma.restaurantTable.findUnique.mockResolvedValue({ id: 't1' });
      prisma.restaurantTable.updateMany.mockResolvedValue({ count: 1 });
    });

    it('ราคาต่อหน่วยมาจาก DB และตัวเลือกบันทึกราคา ณ ตอนสั่ง', async () => {
      prisma.menuItem.findMany.mockResolvedValue([menuItem()]);
      prisma.tableSession.findFirst.mockResolvedValue({ id: 's1' });
      await service.create({
        tableId: '00000000-0000-4000-8000-000000000001',
        items: [{ menuItemId: 'm1', quantity: 2, optionIds: ['opt-pork', 'opt-egg'] }],
      });
      const data = prisma.order.create.mock.calls[0][0].data;
      expect(data.tableSessionId).toBe('s1');
      const item = data.items.create[0];
      expect(Number(item.unitPrice)).toBe(60);
      expect(item.selectedOptions.create.map((o: any) => [o.name, Number(o.price)])).toEqual([
        ['หมู', 0],
        ['ไข่ดาว', 10],
      ]);
    });

    it('เมนูปิดขาย → 400', async () => {
      prisma.menuItem.findMany.mockResolvedValue([menuItem({ isAvailable: false })]);
      await expect(
        service.create({ tableId: 't1', items: [{ menuItemId: 'm1', quantity: 1 }] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('วัตถุดิบหลักของเมนูหมด → 400', async () => {
      prisma.menuItem.findMany.mockResolvedValue([
        menuItem({ ingredients: [{ ingredient: { name: 'ไข่', isAvailable: false } }] }),
      ]);
      await expect(
        service.create({ tableId: 't1', items: [{ menuItemId: 'm1', quantity: 1 }] }),
      ).rejects.toThrow(/หมดชั่วคราว/);
    });

    it('ตัวเลือกที่ผูกวัตถุดิบหมด → 400', async () => {
      const m = menuItem();
      m.options[1].ingredient = { name: 'ไข่', isAvailable: false };
      prisma.menuItem.findMany.mockResolvedValue([m]);
      await expect(
        service.create({
          tableId: 't1',
          items: [{ menuItemId: 'm1', quantity: 1, optionIds: ['opt-egg'] }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('ตัวเลือกปิดขาย หรือเป็นของเมนูอื่น → 400', async () => {
      prisma.menuItem.findMany.mockResolvedValue([menuItem()]);
      for (const optionId of ['opt-off', 'opt-of-another-menu']) {
        await expect(
          service.create({
            tableId: 't1',
            items: [{ menuItemId: 'm1', quantity: 1, optionIds: [optionId] }],
          }),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
    });

    it('เมนูไม่มีอยู่จริง → 400', async () => {
      prisma.menuItem.findMany.mockResolvedValue([]);
      await expect(
        service.create({ tableId: 't1', items: [{ menuItemId: 'm1', quantity: 1 }] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('โต๊ะไม่มีอยู่ → 404', async () => {
      prisma.restaurantTable.findUnique.mockResolvedValue(null);
      await expect(
        service.create({ tableId: 't1', items: [{ menuItemId: 'm1', quantity: 1 }] }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('โต๊ะไม่มี session เปิดและไม่ว่าง → 400', async () => {
      prisma.menuItem.findMany.mockResolvedValue([menuItem()]);
      prisma.restaurantTable.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.create({ tableId: 't1', items: [{ menuItemId: 'm1', quantity: 1 }] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    /**
     * พฤติกรรมที่คาดหวัง: ทุกออเดอร์ที่รับเข้าระบบต้องเก็บเงินได้
     * POST /payments ต้องการ tableSessionId เสมอ — ถ้า create() ยอมสร้างออเดอร์ที่ไม่มี session
     * ออเดอร์นั้นจะค้างอยู่ตลอดไป (เก็บเงินไม่ได้ / โต๊ะ OCCUPIED ค้าง)
     */
    it('โต๊ะว่างที่ยังไม่เปิด session: ต้องไม่สร้างออเดอร์ที่ไม่มี tableSessionId (เก็บเงินไม่ได้)', async () => {
      prisma.menuItem.findMany.mockResolvedValue([menuItem()]);
      prisma.restaurantTable.updateMany.mockResolvedValue({ count: 1 });
      let created: any;
      try {
        created = await service.create({
          tableId: 't1',
          items: [{ menuItemId: 'm1', quantity: 1 }],
        });
      } catch {
        return; // ปฏิเสธ = ถูกต้อง
      }
      expect(created.tableSessionId).toBeTruthy();
    });
  });

  describe('createFromTableSession (ลูกค้า)', () => {
    it('token ปิด/หมดอายุ → error จาก resolveOpenSessionByToken และไม่สร้างออเดอร์', async () => {
      tableSessions.resolveOpenSessionByToken.mockRejectedValue(new BadRequestException('ปิดแล้ว'));
      await expect(
        service.createFromTableSession('tok', [{ menuItemId: 'm1', quantity: 1 }]),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.order.create).not.toHaveBeenCalled();
    });

    it('สร้างออเดอร์ผูก session/โต๊ะของ token และส่ง event', async () => {
      tableSessions.resolveOpenSessionByToken.mockResolvedValue({ id: 's9', tableId: 't9' });
      prisma.menuItem.findMany.mockResolvedValue([menuItem()]);
      await service.createFromTableSession('tok', [{ menuItemId: 'm1', quantity: 1 }]);
      expect(prisma.order.create.mock.calls[0][0].data).toMatchObject({ tableId: 't9', tableSessionId: 's9' });
      expect(prisma.restaurantTable.update).toHaveBeenCalledWith({
        where: { id: 't9' },
        data: { status: TableStatus.OCCUPIED },
      });
      expect(events.emitToStaffAndSession).toHaveBeenCalledWith('s9', 'order.created', expect.any(Object));
    });
  });

  describe('getTotal', () => {
    it('ยอด = (ราคา + ตัวเลือก) × จำนวน', async () => {
      prisma.order.findUnique.mockResolvedValue(storedOrder(OrderStatus.SERVED));
      await expect(service.getTotal('o1')).resolves.toEqual({ orderId: 'o1', total: 155.5, itemCount: 2 });
    });
  });

  describe('แก้ไขรายการ', () => {
    it('เพิ่ม/ลบรายการในออเดอร์ที่จ่ายแล้วหรือยกเลิกแล้ว → 400', async () => {
      for (const status of [OrderStatus.PAID, OrderStatus.CANCELLED]) {
        prisma.order.findUnique.mockResolvedValue(storedOrder(status));
        await expect(service.addItem('o1', { menuItemId: 'm1', quantity: 1 })).rejects.toBeInstanceOf(
          BadRequestException,
        );
        await expect(service.removeItem('o1', 'i1')).rejects.toBeInstanceOf(BadRequestException);
      }
    });

    /** ออเดอร์ที่ครัวเสิร์ฟไปแล้ว ถ้าเพิ่มของเข้าไป ครัวจะไม่เห็น (สถานะยัง SERVED) แต่ลูกค้าโดนเก็บเงิน */
    it('เพิ่มรายการในออเดอร์ที่เสิร์ฟแล้ว ต้องถูกปฏิเสธ (ครัวจะไม่ได้ทำของชิ้นใหม่)', async () => {
      prisma.order.findUnique.mockResolvedValue(storedOrder(OrderStatus.SERVED));
      prisma.menuItem.findUnique.mockResolvedValue(menuItem());
      await expect(service.addItem('o1', { menuItemId: 'm1', quantity: 1 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    /** ลบรายการสุดท้ายจนออเดอร์ว่าง — กลายเป็นออเดอร์ 0 บาทค้างในบิล/บอร์ดครัว */
    it('ลบรายการสุดท้ายของออเดอร์ ต้องไม่เหลือออเดอร์เปล่า', async () => {
      const one = storedOrder(OrderStatus.PENDING, {
        items: [{ id: 'i1', quantity: 1, unitPrice: D(60), selectedOptions: [] }],
      });
      prisma.order.findUnique
        .mockResolvedValueOnce(one)
        .mockResolvedValueOnce({ ...one, items: [] });
      let result: any;
      try {
        result = await service.removeItem('o1', 'i1');
      } catch (e) {
        expect(e).toBeInstanceOf(BadRequestException);
        return;
      }
      expect(result.items.length > 0 || result.status === OrderStatus.CANCELLED).toBe(true);
    });

    it('ลบรายการที่ไม่ได้อยู่ในออเดอร์นี้ → 404', async () => {
      prisma.order.findUnique.mockResolvedValue(storedOrder(OrderStatus.PENDING));
      await expect(service.removeItem('o1', 'other')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('markCleared', () => {
    it('เคลียร์ได้เฉพาะ SERVED', async () => {
      prisma.order.findUnique.mockResolvedValue(storedOrder(OrderStatus.PREPARING));
      await expect(service.markCleared('o1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('ยกเลิกออเดอร์สุดท้ายที่ค้างจ่าย', () => {
    it('ไม่ปล่อยโต๊ะว่างถ้า session ยังเปิดอยู่', async () => {
      prisma.order.findUnique.mockResolvedValue(storedOrder(OrderStatus.PENDING));
      prisma.order.updateMany.mockResolvedValue({ count: 1 });
      prisma.order.count.mockResolvedValue(0);
      prisma.tableSession.findFirst.mockResolvedValue({ id: 's1', status: TableSessionStatus.OPEN });
      prisma.order.findUniqueOrThrow.mockResolvedValue(storedOrder(OrderStatus.CANCELLED));
      await service.updateStatus('o1', OrderStatus.CANCELLED);
      expect(prisma.restaurantTable.update).not.toHaveBeenCalled();
    });
  });
});
