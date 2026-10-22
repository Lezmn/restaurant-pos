import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma, ServiceRequestStatus, ServiceRequestType, TableSessionStatus } from '@prisma/client';
import { closeSessionIfSettled } from './session-settlement';
import { TableSessionsService } from './table-sessions.service';

const D = (v: number) => new Prisma.Decimal(v);

function makePrisma() {
  const prisma: any = {
    restaurantTable: { findUnique: jest.fn().mockResolvedValue({ id: 't1' }), update: jest.fn() },
    tableSession: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ tableId: 't1' }),
      create: jest.fn(({ data }: any) => Promise.resolve({ id: 'new', status: 'OPEN', ...data })),
      update: jest.fn(({ data }: any) => Promise.resolve({ id: 's1', ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    order: { count: jest.fn().mockResolvedValue(0) },
    serviceRequest: { updateMany: jest.fn() },
  };
  prisma.$transaction = jest.fn((arg: any) =>
    typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
  );
  return prisma;
}

describe('TableSessionsService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let events: { emitToStaff: jest.Mock; emitToStaffAndSession: jest.Mock };
  let service: TableSessionsService;

  beforeEach(() => {
    prisma = makePrisma();
    events = { emitToStaff: jest.fn(), emitToStaffAndSession: jest.fn() };
    service = new TableSessionsService(prisma, events as any);
  });

  describe('create (เปิดโต๊ะ)', () => {
    it('เปิดได้: token สุ่ม 48 hex, หมดอายุ 3 ชม., โต๊ะเป็น OCCUPIED', async () => {
      const before = Date.now();
      const s: any = await service.create({ tableId: 't1' });
      expect(s.token).toMatch(/^[0-9a-f]{48}$/);
      const ttl = s.expiresAt.getTime() - before;
      expect(ttl).toBeGreaterThanOrEqual(3 * 3600_000 - 1000);
      expect(ttl).toBeLessThanOrEqual(3 * 3600_000 + 1000);
      expect(prisma.restaurantTable.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { status: 'OCCUPIED' } });
    });

    it('expiresAt ในอดีต → 400', async () => {
      await expect(service.create({ tableId: 't1', expiresAt: '2000-01-01T00:00:00Z' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('โต๊ะไม่มีจริง → 404', async () => {
      prisma.restaurantTable.findUnique.mockResolvedValue(null);
      await expect(service.create({ tableId: 't1' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('มี session เปิดอยู่ (ยังไม่หมดอายุ) → 409', async () => {
      prisma.tableSession.findFirst.mockResolvedValue({ id: 's0', expiresAt: new Date(Date.now() + 60_000) });
      await expect(service.create({ tableId: 't1' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('session เก่าหมดอายุแต่ยังค้างจ่าย → 409 (บิลห้ามหาย)', async () => {
      prisma.tableSession.findFirst.mockResolvedValue({ id: 's0', expiresAt: new Date(Date.now() - 60_000) });
      prisma.order.count.mockResolvedValue(2);
      await expect(service.create({ tableId: 't1' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('session เก่าหมดอายุและไม่ค้างจ่าย → ปิดเป็น EXPIRED แล้วเปิดใบใหม่', async () => {
      prisma.tableSession.findFirst.mockResolvedValue({ id: 's0', expiresAt: new Date(Date.now() - 60_000) });
      await service.create({ tableId: 't1' });
      expect(prisma.tableSession.update).toHaveBeenCalledWith({ where: { id: 's0' }, data: { status: 'EXPIRED' } });
    });

    it('ชน unique index (เปิดพร้อมกันสองเครื่อง) → 409', async () => {
      prisma.tableSession.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
      );
      await expect(service.create({ tableId: 't1' })).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('resolveOpenSessionByToken (QR)', () => {
    it('ไม่ส่ง token → 400, ไม่พบ → 404, ปิดแล้ว → 400', async () => {
      await expect(service.resolveOpenSessionByToken('')).rejects.toBeInstanceOf(BadRequestException);
      prisma.tableSession.findUnique.mockResolvedValue(null);
      await expect(service.resolveOpenSessionByToken('x')).rejects.toBeInstanceOf(NotFoundException);
      prisma.tableSession.findUnique.mockResolvedValue({ id: 's1', status: TableSessionStatus.CLOSED });
      await expect(service.resolveOpenSessionByToken('x')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('หมดอายุแต่ยังค้างจ่าย → ต่ออายุให้ ไม่ทิ้งบิล', async () => {
      prisma.tableSession.findUnique.mockResolvedValue({
        id: 's1', status: TableSessionStatus.OPEN, expiresAt: new Date(Date.now() - 1000), tableId: 't1',
      });
      prisma.order.count.mockResolvedValue(1);
      const s: any = await service.resolveOpenSessionByToken('x');
      expect(s.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('หมดอายุและไม่ค้างจ่าย → EXPIRED + คืนโต๊ะว่าง + 400', async () => {
      prisma.tableSession.findUnique.mockResolvedValue({
        id: 's1', status: TableSessionStatus.OPEN, expiresAt: new Date(Date.now() - 1000), tableId: 't1',
      });
      await expect(service.resolveOpenSessionByToken('x')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.restaurantTable.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { status: 'AVAILABLE' } });
      expect(events.emitToStaffAndSession).toHaveBeenCalled();
    });
  });

  describe('findOne: ยอดค้างจ่ายของโต๊ะ', () => {
    it('ไม่นับออเดอร์ยกเลิกและที่จ่ายไปแล้ว; billingStatus ตามคำขอเช็คบิล', async () => {
      prisma.tableSession.findUnique.mockResolvedValue({
        id: 's1',
        tableId: 't1',
        status: 'OPEN',
        table: { number: 1 },
        orders: [
          { status: OrderStatus.SERVED, paymentId: null, items: [{ unitPrice: D(50), quantity: 2, selectedOptions: [{ price: D(5) }] }] },
          { status: OrderStatus.CANCELLED, paymentId: null, items: [{ unitPrice: D(999), quantity: 1, selectedOptions: [] }] },
          { status: OrderStatus.PAID, paymentId: 'p1', items: [{ unitPrice: D(777), quantity: 1, selectedOptions: [] }] },
        ],
        serviceRequests: [
          { id: 'r1', type: ServiceRequestType.CHECKOUT, status: ServiceRequestStatus.PENDING, paymentMethod: 'CASH', createdAt: new Date() },
        ],
      });
      const s: any = await service.findOne('s1');
      expect(Number(s.total)).toBe(110);
      expect(s.billingStatus).toBe('AWAITING_CHECKOUT');
      expect(s.checkoutRequest.paymentMethod).toBe('CASH');
    });
  });

  describe('close', () => {
    it('ยังมีออเดอร์ค้าง → 409', async () => {
      prisma.tableSession.findUnique.mockResolvedValue({
        id: 's1', tableId: 't1', status: 'OPEN', orders: [], serviceRequests: [], table: {},
      });
      prisma.order.count.mockResolvedValue(1);
      await expect(service.close('s1')).rejects.toBeInstanceOf(ConflictException);
    });
  });
});

describe('closeSessionIfSettled', () => {
  it('ยังค้างจ่าย → ไม่ปิด', async () => {
    const tx: any = { order: { count: jest.fn().mockResolvedValue(1) } };
    await expect(closeSessionIfSettled(tx, 's1')).resolves.toBe(false);
  });

  it('requirePaidOrder และไม่เคยจ่ายเลย (ยกเลิกหมด) → ไม่ปิดโต๊ะ', async () => {
    const tx: any = { order: { count: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(0) } };
    await expect(closeSessionIfSettled(tx, 's1', { requirePaidOrder: true })).resolves.toBe(false);
  });

  it('จ่ายครบ → ปิด session คืนโต๊ะ และปิดคำขอที่ค้าง', async () => {
    const tx: any = {
      order: { count: jest.fn().mockResolvedValue(0) },
      tableSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ tableId: 't1' }),
      },
      restaurantTable: { update: jest.fn() },
      serviceRequest: { updateMany: jest.fn() },
    };
    await expect(closeSessionIfSettled(tx, 's1')).resolves.toBe(true);
    expect(tx.serviceRequest.updateMany).toHaveBeenCalled();
  });
});
