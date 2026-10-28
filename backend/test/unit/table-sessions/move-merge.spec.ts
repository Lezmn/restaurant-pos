import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, TableSessionStatus } from '@prisma/client';
import { TableSessionsService } from '../../../src/table-sessions/table-sessions.service';

const openSession = (overrides: Partial<any> = {}) => ({
  id: 's1',
  status: TableSessionStatus.OPEN,
  tableId: 't1',
  isTakeaway: false,
  guestCount: 2,
  ...overrides,
});

function makePrisma() {
  const sessions: Record<string, any> = {
    s1: openSession(),
    s2: openSession({ id: 's2', tableId: 't2', guestCount: 3 }),
  };
  const prisma: any = {
    restaurantTable: {
      findUnique: jest.fn().mockResolvedValue({ id: 't3', number: 3, isActive: true, isTakeaway: false }),
      update: jest.fn(),
    },
    tableSession: {
      // select ของ findMovableSession + include ของ findOne ใช้ mock เดียวกัน
      findUnique: jest.fn(({ where }: any) =>
        Promise.resolve(
          sessions[where.id] && {
            ...sessions[where.id],
            table: { id: sessions[where.id].tableId, number: 1 },
            orders: [],
            serviceRequests: [],
          },
        ),
      ),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
    order: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    serviceRequest: { updateMany: jest.fn() },
  };
  prisma.$transaction = jest.fn((fn: any) => fn(prisma));
  return { prisma, sessions };
}

describe('TableSessionsService ย้าย/รวมโต๊ะ', () => {
  let prisma: any;
  let sessions: Record<string, any>;
  let events: { emitToStaff: jest.Mock; emitToStaffAndSession: jest.Mock };
  let service: TableSessionsService;

  beforeEach(() => {
    ({ prisma, sessions } = makePrisma());
    events = { emitToStaff: jest.fn(), emitToStaffAndSession: jest.fn() };
    service = new TableSessionsService(prisma, events as any);
  });

  describe('move', () => {
    it('ย้ายบิล ออเดอร์ทุกใบ และคำขอที่ค้างไปโต๊ะใหม่ — โต๊ะเดิมว่าง โต๊ะใหม่มีลูกค้า', async () => {
      await service.move('s1', 't3');

      expect(prisma.tableSession.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { tableId: 't3' } });
      expect(prisma.order.updateMany).toHaveBeenCalledWith({ where: { tableSessionId: 's1' }, data: { tableId: 't3' } });
      expect(prisma.serviceRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { tableId: 't3' } }),
      );
      expect(prisma.restaurantTable.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { status: 'AVAILABLE' } });
      expect(prisma.restaurantTable.update).toHaveBeenCalledWith({ where: { id: 't3' }, data: { status: 'OCCUPIED' } });
      expect(events.emitToStaffAndSession).toHaveBeenCalledWith('s1', 'table-session.updated', expect.anything());
    });

    it('โต๊ะปลายทางมีลูกค้าอยู่ → 409 แนะนำให้รวมโต๊ะ', async () => {
      prisma.tableSession.findFirst.mockResolvedValue({ id: 'other' });
      await expect(service.move('s1', 't3')).rejects.toThrow(/รวมโต๊ะ/);
      expect(prisma.tableSession.update).not.toHaveBeenCalled();
    });

    it('อีกเครื่องเปิดโต๊ะปลายทางแทรกพอดี (unique index) → 409', async () => {
      prisma.tableSession.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
      );
      await expect(service.move('s1', 't3')).rejects.toBeInstanceOf(ConflictException);
    });

    it('โต๊ะปลายทางปิดใช้งาน → 400', async () => {
      prisma.restaurantTable.findUnique.mockResolvedValue({ id: 't3', number: 3, isActive: false, isTakeaway: false });
      await expect(service.move('s1', 't3')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('ย้ายไปโต๊ะเดิม → 400', async () => {
      await expect(service.move('s1', 't1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('บิลกลับบ้านย้ายไม่ได้', async () => {
      sessions.s1.isTakeaway = true;
      await expect(service.move('s1', 't3')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('บิลปิดไปแล้ว → 409', async () => {
      sessions.s1.status = TableSessionStatus.CLOSED;
      await expect(service.move('s1', 't3')).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('merge', () => {
    it('ย้ายเฉพาะออเดอร์ที่ยังไม่จ่ายไปบิลปลายทาง รวมจำนวนลูกค้า แล้วปิดบิลนี้ คืนโต๊ะว่าง', async () => {
      const result: any = await service.merge('s1', 's2');

      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: { tableSessionId: 's1', paymentId: null },
        data: { tableSessionId: 's2', tableId: 't2' },
      });
      expect(prisma.tableSession.update).toHaveBeenCalledWith({ where: { id: 's2' }, data: { guestCount: 5 } });
      expect(prisma.tableSession.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { status: TableSessionStatus.CLOSED, closedAt: expect.any(Date) },
      });
      expect(prisma.restaurantTable.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { status: 'AVAILABLE' } });
      expect(prisma.serviceRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tableSessionId: 's1' }) }),
      );
      expect(result.movedOrders).toBe(2);
      expect(events.emitToStaffAndSession).toHaveBeenCalledWith('s1', 'table-session.closed', expect.anything());
    });

    it('รวมเข้าตัวเอง → 400', async () => {
      await expect(service.merge('s1', 's1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('บิลปลายทางปิดไปแล้ว → 409 ไม่ย้ายอะไร', async () => {
      sessions.s2.status = TableSessionStatus.CLOSED;
      await expect(service.merge('s1', 's2')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    });

    it('รวมเข้าบิลกลับบ้านไม่ได้', async () => {
      sessions.s2.isTakeaway = true;
      await expect(service.merge('s1', 's2')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('เปิดโต๊ะจากหน้าโต๊ะบนโต๊ะเสมือนของกลับบ้านไม่ได้', async () => {
    prisma.restaurantTable.findUnique.mockResolvedValue({ id: 'tk', isActive: true, isTakeaway: true });
    await expect(service.create({ tableId: 'tk' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
