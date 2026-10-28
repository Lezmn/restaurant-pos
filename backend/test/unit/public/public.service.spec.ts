import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma, ServiceRequestStatus } from '@prisma/client';
import { PublicService } from '../../../src/public/public.service';

const D = (v: number) => new Prisma.Decimal(v);

const openSession = {
  id: 'sess-1',
  token: 'tok',
  status: 'OPEN',
  openedAt: new Date('2026-01-01T10:00:00Z'),
  expiresAt: new Date('2026-01-01T14:00:00Z'),
  tableId: 'table-1',
  table: { id: 'table-1', number: 7, seats: 4, qrSecret: 'should-not-leak' },
};

function order(status: OrderStatus = OrderStatus.PENDING) {
  return {
    id: 'o-1',
    status,
    createdAt: new Date(),
    updatedAt: new Date(),
    table: { id: 'table-1', number: 7 },
    items: [
      {
        id: 'i-1',
        quantity: 2,
        unitPrice: D(50),
        note: 'ไม่เผ็ด',
        customName: null,
        menuItem: { name: 'ผัดไทย' },
        selectedOptions: [{ id: 'op-1', name: 'ไข่ดาว', price: D(10) }],
      },
      {
        id: 'i-2',
        quantity: 1,
        unitPrice: D(25),
        note: null,
        customName: 'น้ำแข็งเพิ่ม',
        menuItem: null,
        selectedOptions: [],
      },
      {
        id: 'i-3',
        quantity: 1,
        unitPrice: D(0),
        note: null,
        customName: null,
        menuItem: null,
        selectedOptions: [],
      },
    ],
  };
}

function setup() {
  const prisma: any = {
    category: { findMany: jest.fn().mockResolvedValue([]) },
    serviceRequest: { findFirst: jest.fn().mockResolvedValue(null) },
    order: { findMany: jest.fn(), findFirst: jest.fn() },
  };
  const orders: any = { createFromTableSession: jest.fn().mockResolvedValue({ id: 'o-new' }) };
  const serviceRequests: any = {
    createCallStaffFromSessionToken: jest.fn(),
    createCheckoutFromSessionToken: jest.fn(),
  };
  const tableSessions: any = { resolveOpenSessionByToken: jest.fn().mockResolvedValue(openSession) };
  const service = new PublicService(prisma, orders, serviceRequests, tableSessions);
  return { prisma, orders, serviceRequests, tableSessions, service };
}

describe('PublicService (หน้าลูกค้าสแกน QR)', () => {
  it('getMenu ซ่อนเมนูที่ปิดขาย/วัตถุดิบหลักหมด และตัวเลือกที่ปิด', async () => {
    const { prisma, service } = setup();
    await service.getMenu();
    const menuItems = prisma.category.findMany.mock.calls[0][0].include.menuItems;
    expect(menuItems.where).toEqual({
      isAvailable: true,
      // เมนูที่ลบแบบซ่อน (deletedAt) ต้องไม่โผล่ในหน้าลูกค้า
      deletedAt: null,
      ingredients: { none: { ingredient: { isAvailable: false } } },
    });
    expect(menuItems.include.options.where).toEqual({ isAvailable: true });
  });

  it('getSession คืนเฉพาะฟิลด์ที่ลูกค้าเห็นได้ + คำขอเช็คบิลที่ค้างอยู่', async () => {
    const { prisma, service } = setup();
    const pending = { id: 'req-1', createdAt: new Date() };
    prisma.serviceRequest.findFirst.mockResolvedValue(pending);
    const res = await service.getSession('tok');
    expect(res.table).toEqual({ id: 'table-1', number: 7, seats: 4 });
    expect(res.checkoutRequest).toBe(pending);
    expect(prisma.serviceRequest.findFirst.mock.calls[0][0].where).toMatchObject({
      tableSessionId: 'sess-1',
      status: ServiceRequestStatus.PENDING,
    });
  });

  it('createOrder ส่งต่อ OrdersService ด้วย token + items', async () => {
    const { orders, service } = setup();
    const items = [{ menuItemId: 'm1', quantity: 1 }];
    await service.createOrder({ sessionToken: 'tok', items } as any);
    expect(orders.createFromTableSession).toHaveBeenCalledWith('tok', items);
  });

  it('getOrdersBySession คิดยอดรวม (ราคา+ตัวเลือก)×จำนวน และตั้งชื่อรายการพิเศษ', async () => {
    const { prisma, service } = setup();
    prisma.order.findMany.mockResolvedValue([order()]);
    const [res] = await service.getOrdersBySession('tok');
    expect(res.total).toBe((50 + 10) * 2 + 25);
    expect(res.items.map((i) => i.name)).toEqual(['ผัดไทย', 'น้ำแข็งเพิ่ม', 'รายการพิเศษ']);
    expect(res.items[0].options).toEqual([{ id: 'op-1', name: 'ไข่ดาว', price: 10 }]);
    expect(res.isClosed).toBe(false);
  });

  it.each([OrderStatus.PAID, OrderStatus.CANCELLED])('ออเดอร์ %s ถือว่าปิดแล้ว', async (status) => {
    const { prisma, service } = setup();
    prisma.order.findMany.mockResolvedValue([order(status)]);
    const [res] = await service.getOrdersBySession('tok');
    expect(res.isClosed).toBe(true);
  });

  describe('getOrderStatus', () => {
    it('ไม่ส่ง sessionToken → 400', async () => {
      const { service } = setup();
      await expect(service.getOrderStatus('o-1', '')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('ออเดอร์ไม่ใช่ของ session นี้ → 404 (กันดูออเดอร์โต๊ะอื่น)', async () => {
      const { prisma, service } = setup();
      prisma.order.findFirst.mockResolvedValue(null);
      await expect(service.getOrderStatus('o-1', 'tok')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.order.findFirst.mock.calls[0][0].where).toEqual({
        id: 'o-1',
        tableSession: { token: 'tok' },
      });
    });

    it('พบ → แปลงเป็นรูปแบบสาธารณะ', async () => {
      const { prisma, service } = setup();
      prisma.order.findFirst.mockResolvedValue(order());
      await expect(service.getOrderStatus('o-1', 'tok')).resolves.toMatchObject({ id: 'o-1', total: 145 });
    });
  });

  it.each([
    ['callStaff', 'createCallStaffFromSessionToken'],
    ['checkout', 'createCheckoutFromSessionToken'],
  ] as const)('%s คืนข้อมูลย่อของคำขอ', async (method, delegate) => {
    const { serviceRequests, service } = setup();
    const createdAt = new Date();
    serviceRequests[delegate].mockResolvedValue({
      id: 'req-1',
      status: ServiceRequestStatus.PENDING,
      table: { number: 7 },
      createdAt,
    });
    await expect(service[method]({ sessionToken: 'tok' })).resolves.toEqual({
      ok: true,
      id: 'req-1',
      status: ServiceRequestStatus.PENDING,
      tableNumber: 7,
      createdAt,
    });
  });
});
