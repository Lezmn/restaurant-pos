import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  ServiceRequestStatus,
  ServiceRequestType,
  TableSessionStatus,
  TableStatus,
} from '@prisma/client';
import { TableSessionsService } from '../../../src/table-sessions/table-sessions.service';

/** ย้ายโต๊ะ / รวมโต๊ะ / แก้จำนวนลูกค้า / findAll / สรุปการหารเท่ากัน */
const D = (v: number | string) => new Prisma.Decimal(v);
const prismaError = (code: string) => new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: 't' });

const movable = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  status: TableSessionStatus.OPEN,
  tableId: `table-of-${id}`,
  isTakeaway: false,
  guestCount: null,
  ...extra,
});

/** แถวเต็มที่ findOne/findAll อ่าน */
const fullSession = (id: string, extra: Record<string, unknown> = {}) => ({
  ...movable(id),
  table: { id: `table-of-${id}`, number: 1 },
  orders: [],
  serviceRequests: [],
  ...extra,
});

function setup() {
  const prisma: any = {
    restaurantTable: {
      findUnique: jest.fn().mockResolvedValue({ id: 't2', number: 2, isActive: true, isTakeaway: false }),
      update: jest.fn(),
    },
    tableSession: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
    order: { updateMany: jest.fn().mockResolvedValue({ count: 2 }), count: jest.fn().mockResolvedValue(0) },
    serviceRequest: { updateMany: jest.fn() },
  };
  prisma.$transaction = jest.fn((fn: any) => fn(prisma));
  const events: any = { emitToStaff: jest.fn(), emitToStaffAndSession: jest.fn() };
  const service = new TableSessionsService(prisma, events);
  /** findUnique ถูกใช้ทั้งใน findMovableSession (select) และ findOne (include) */
  const sessions = (rows: Record<string, any>) =>
    prisma.tableSession.findUnique.mockImplementation(({ where, include }: any) => {
      const row = rows[where.id];
      if (!row) return Promise.resolve(null);
      return Promise.resolve(include ? fullSession(where.id, row) : movable(where.id, row));
    });
  return { prisma, events, service, sessions };
}

describe('TableSessionsService.move (ย้ายโต๊ะ)', () => {
  it('ย้ายบิลทั้งก้อน: session/ออเดอร์/คำขอค้าง ตามไปโต๊ะใหม่, สลับสถานะโต๊ะ, แจ้งลูกค้าโต๊ะนั้น', async () => {
    const { prisma, events, service, sessions } = setup();
    sessions({ s1: {} });
    await service.move('s1', 't2');

    expect(prisma.tableSession.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { tableId: 't2' } });
    expect(prisma.order.updateMany).toHaveBeenCalledWith({ where: { tableSessionId: 's1' }, data: { tableId: 't2' } });
    expect(prisma.serviceRequest.updateMany).toHaveBeenCalledWith({
      where: { tableSessionId: 's1', status: ServiceRequestStatus.PENDING },
      data: { tableId: 't2' },
    });
    expect(prisma.restaurantTable.update).toHaveBeenCalledWith({
      where: { id: 'table-of-s1' },
      data: { status: TableStatus.AVAILABLE },
    });
    expect(prisma.restaurantTable.update).toHaveBeenCalledWith({
      where: { id: 't2' },
      data: { status: TableStatus.OCCUPIED },
    });
    expect(events.emitToStaffAndSession).toHaveBeenCalledWith('s1', 'table-session.updated', {
      id: 's1',
      fromTableId: 'table-of-s1',
      toTableId: 't2',
    });
  });

  it('ย้ายไปโต๊ะเดิม → 400', async () => {
    const { service, sessions } = setup();
    sessions({ s1: { tableId: 't2' } });
    await expect(service.move('s1', 't2')).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    ['ไม่พบโต๊ะปลายทาง', null, NotFoundException],
    ['ปลายทางเป็นโต๊ะเสมือนกลับบ้าน', { id: 't2', number: 0, isActive: true, isTakeaway: true }, NotFoundException],
    ['ปลายทางปิดใช้งาน', { id: 't2', number: 2, isActive: false, isTakeaway: false }, BadRequestException],
  ])('%s → error', async (_l, target, Err) => {
    const { prisma, service, sessions } = setup();
    sessions({ s1: {} });
    prisma.restaurantTable.findUnique.mockResolvedValue(target);
    await expect(service.move('s1', 't2')).rejects.toBeInstanceOf(Err);
    expect(prisma.tableSession.update).not.toHaveBeenCalled();
  });

  it('ปลายทางมีลูกค้าอยู่ → 409 แนะนำให้รวมโต๊ะ', async () => {
    const { prisma, service, sessions } = setup();
    sessions({ s1: {} });
    prisma.tableSession.findFirst.mockResolvedValue({ id: 'other' });
    await expect(service.move('s1', 't2')).rejects.toThrow(/รวมโต๊ะ/);
  });

  it('อีกเครื่องเปิดโต๊ะปลายทางแทรกพอดี (unique ชน) → 409', async () => {
    const { prisma, service, sessions } = setup();
    sessions({ s1: {} });
    prisma.tableSession.update.mockRejectedValue(prismaError('P2002'));
    await expect(service.move('s1', 't2')).rejects.toThrow(/เพิ่งเปิดรับลูกค้า/);
  });

  it('error อื่นตอนย้าย → โยนต่อ', async () => {
    const { prisma, service, sessions } = setup();
    sessions({ s1: {} });
    const err = new Error('db');
    prisma.tableSession.update.mockRejectedValue(err);
    await expect(service.move('s1', 't2')).rejects.toBe(err);
  });

  it.each([
    ['ไม่พบ session', null, NotFoundException],
    ['บิลกลับบ้าน', { isTakeaway: true }, BadRequestException],
    ['บิลปิดแล้ว', { status: TableSessionStatus.CLOSED }, ConflictException],
  ])('%s → ย้ายไม่ได้', async (_l, row, Err) => {
    const { service, sessions } = setup();
    sessions(row ? { s1: row } : {});
    await expect(service.move('s1', 't2')).rejects.toBeInstanceOf(Err);
  });
});

describe('TableSessionsService.merge (รวมโต๊ะ)', () => {
  it('รวมกับตัวเอง → 400', async () => {
    const { service } = setup();
    await expect(service.merge('s1', 's1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ย้ายเฉพาะออเดอร์ที่ยังไม่จ่าย, รวมจำนวนลูกค้า (เพดาน 99), ปิดบิลต้นทาง, ปิดคำขอค้าง', async () => {
    const { prisma, events, service, sessions } = setup();
    sessions({ s1: { guestCount: 60 }, s2: { guestCount: 50 } });
    const res: any = await service.merge('s1', 's2');

    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { tableSessionId: 's1', paymentId: null },
      data: { tableSessionId: 's2', tableId: 'table-of-s2' },
    });
    expect(prisma.tableSession.update).toHaveBeenCalledWith({ where: { id: 's2' }, data: { guestCount: 99 } });
    expect(prisma.tableSession.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { status: TableSessionStatus.CLOSED, closedAt: expect.any(Date) },
    });
    expect(prisma.restaurantTable.update).toHaveBeenCalledWith({
      where: { id: 'table-of-s1' },
      data: { status: TableStatus.AVAILABLE },
    });
    expect(prisma.serviceRequest.updateMany.mock.calls[0][0].where).toEqual({
      tableSessionId: 's1',
      status: ServiceRequestStatus.PENDING,
    });
    expect(res.movedOrders).toBe(2);
    expect(res.id).toBe('s2');
    expect(events.emitToStaffAndSession).toHaveBeenCalledWith('s1', 'table-session.closed', expect.any(Object));
    expect(events.emitToStaffAndSession).toHaveBeenCalledWith('s2', 'table-session.updated', { id: 's2' });
  });

  it('ต้นทางไม่ได้ระบุจำนวนลูกค้า → ไม่แก้ของปลายทาง', async () => {
    const { prisma, service, sessions } = setup();
    sessions({ s1: { guestCount: null }, s2: { guestCount: 3 } });
    await service.merge('s1', 's2');
    expect(prisma.tableSession.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 's2' } }),
    );
  });

  it('ปลายทางไม่มีจำนวนลูกค้า → ใช้ของต้นทาง', async () => {
    const { prisma, service, sessions } = setup();
    sessions({ s1: { guestCount: 4 }, s2: { guestCount: null } });
    await service.merge('s1', 's2');
    expect(prisma.tableSession.update).toHaveBeenCalledWith({ where: { id: 's2' }, data: { guestCount: 4 } });
  });

  it('ปลายทางปิดไปแล้ว → 409 ไม่ย้ายอะไร', async () => {
    const { prisma, service, sessions } = setup();
    sessions({ s1: {}, s2: { status: TableSessionStatus.CLOSED } });
    await expect(service.merge('s1', 's2')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });
});

describe('TableSessionsService.setGuestCount', () => {
  it('โต๊ะเปิดอยู่ → แก้ได้', async () => {
    const { prisma, service, sessions } = setup();
    sessions({ s1: {} });
    await service.setGuestCount('s1', 5);
    expect(prisma.tableSession.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { guestCount: 5 },
      select: { id: true, guestCount: true },
    });
  });

  it('ปิดบิลแล้ว → 400', async () => {
    const { service, sessions } = setup();
    sessions({ s1: { status: TableSessionStatus.CLOSED } });
    await expect(service.setGuestCount('s1', 5)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('TableSessionsService.findAll + สรุปการหาร', () => {
  it('กรองสถานะ และคำขอเช็คบิลล่าสุดขึ้นก่อน', async () => {
    const { prisma, service } = setup();
    const older = new Date('2026-05-01T10:00:00Z');
    const newer = new Date('2026-05-01T11:00:00Z');
    prisma.tableSession.findMany.mockResolvedValue([
      fullSession('s1', {
        serviceRequests: [
          { id: 'old', type: ServiceRequestType.CHECKOUT, status: ServiceRequestStatus.PENDING, paymentMethod: null, createdAt: older },
          { id: 'new', type: ServiceRequestType.CHECKOUT, status: ServiceRequestStatus.PENDING, paymentMethod: 'CASH', createdAt: newer },
          { id: 'call', type: ServiceRequestType.CALL_STAFF, status: ServiceRequestStatus.PENDING, paymentMethod: null, createdAt: newer },
        ],
      }),
      fullSession('s2'),
    ]);
    const [s1, s2]: any[] = await service.findAll(TableSessionStatus.OPEN);
    expect(prisma.tableSession.findMany.mock.calls[0][0].where).toEqual({ status: TableSessionStatus.OPEN });
    expect(s1.checkoutRequest).toEqual({ id: 'new', paymentMethod: 'CASH', createdAt: newer });
    expect(s2.billingStatus).toBe('IN_PROGRESS');
    expect(s1.serviceRequests).toBeUndefined();
  });

  it('findOne ไม่พบ → 404', async () => {
    const { service, sessions } = setup();
    sessions({});
    await expect(service.findOne('x')).rejects.toBeInstanceOf(NotFoundException);
  });
});
