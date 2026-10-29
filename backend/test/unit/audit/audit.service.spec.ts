import { Prisma, Role } from '@prisma/client';
import * as loaders from '../../../src/audit/audit-loaders';
import { AuditService, sanitizeDetails } from '../../../src/audit/audit.service';

const user = { id: 'u1', email: 'a@x', name: 'Admin', role: Role.ADMIN };
const device = { deviceName: 'POS-1', deviceId: 'dev-1', ip: '10.0.0.2', userAgent: 'UA' };

function setup() {
  const prisma: any = {
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([]),
    },
  };
  const service = new AuditService(prisma);
  (service as any).logger = { error: jest.fn() };
  return { prisma, service };
}

describe('sanitizeDetails', () => {
  it('ตัดรหัสผ่าน/token/payload สลิป เก็บแค่ว่ารหัสผ่านถูกเปลี่ยน', () => {
    expect(
      sanitizeDetails({
        name: 'x',
        password: 'p',
        newPassword: 'n',
        token: 't',
        accessToken: 't2',
        slipPayload: '{}',
      }),
    ).toEqual({ name: 'x', passwordChanged: true });
  });

  it('รหัสผ่านว่าง = ไม่ได้เปลี่ยน', () => {
    expect(sanitizeDetails({ name: 'x', password: '' })).toEqual({ name: 'x' });
  });

  it.each([null, undefined, 'str', 1, ['a'], {}, { token: 'x' }])('%j → null', (value) => {
    expect(sanitizeDetails(value)).toBeNull();
  });
});

describe('AuditService.record', () => {
  it('บันทึกผู้ทำ + เครื่อง + แปลง Decimal ใน details', async () => {
    const { prisma, service } = setup();
    await service.record({
      action: 'PAYMENT_DISCOUNT',
      targetId: 'p1',
      details: { total: new Prisma.Decimal('90.5') },
      user,
      device,
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        action: 'PAYMENT_DISCOUNT',
        targetId: 'p1',
        details: { total: 90.5 },
        userId: 'u1',
        userName: 'Admin',
        userRole: Role.ADMIN,
        ...device,
      },
    });
  });

  it('ไม่มี details/targetId → เก็บเป็น JsonNull / null', async () => {
    const { prisma, service } = setup();
    await service.record({ action: 'USER_DELETE', user, device });
    const data = prisma.auditLog.create.mock.calls[0][0].data;
    expect(data.targetId).toBeNull();
    expect(data.details).toBe(Prisma.JsonNull);
  });

  it('DB พัง → แค่ log ไม่ throw (รายการหลักสำเร็จไปแล้ว)', async () => {
    const { prisma, service } = setup();
    prisma.auditLog.create.mockRejectedValue(new Error('db down'));
    await expect(service.record({ action: 'PAYMENT_VOID', user, device })).resolves.toBeUndefined();
    expect((service as any).logger.error).toHaveBeenCalled();
  });
});

describe('AuditService.findAll', () => {
  it('ค่าเริ่มต้น 100 แถว ไม่กรอง', async () => {
    const { prisma, service } = setup();
    await service.findAll({} as any);
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 101,
    });
  });

  it('limit เกิน 200 ถูกตัด และบอก hasMore จากแถวที่ดึงเกินมา 1', async () => {
    const { prisma, service } = setup();
    prisma.auditLog.findMany.mockResolvedValue(Array.from({ length: 201 }, (_, i) => ({ id: i })));
    const res = await service.findAll({ limit: 999 } as any);
    expect(prisma.auditLog.findMany.mock.calls[0][0].take).toBe(201);
    expect(res.items).toHaveLength(200);
    expect(res.hasMore).toBe(true);
  });

  it('กรองช่วงเวลา/action/เครื่อง — before (หน้าถัดไป) ใช้แทน to', async () => {
    const { prisma, service } = setup();
    await service.findAll({
      from: '2026-05-01T00:00:00.000Z',
      to: '2026-05-02T00:00:00.000Z',
      before: '2026-05-01T12:00:00.000Z',
      action: 'PAYMENT_VOID',
      deviceId: 'dev-1',
      limit: 5,
    } as any);
    expect(prisma.auditLog.findMany.mock.calls[0][0].where).toEqual({
      createdAt: { gte: new Date('2026-05-01T00:00:00.000Z'), lt: new Date('2026-05-01T12:00:00.000Z') },
      action: 'PAYMENT_VOID',
      deviceId: 'dev-1',
    });
  });

  it('ไม่ถึง limit → hasMore = false', async () => {
    const { prisma, service } = setup();
    prisma.auditLog.findMany.mockResolvedValue([{ id: 1 }]);
    await expect(service.findAll({ limit: 5 } as any)).resolves.toEqual({ items: [{ id: 1 }], hasMore: false });
  });
});

describe('AuditService.findDevices', () => {
  it('เรียงเครื่องที่ใช้ล่าสุดก่อน', async () => {
    const { prisma, service } = setup();
    prisma.auditLog.groupBy.mockResolvedValue([
      { deviceId: 'a', deviceName: 'เก่า', _max: { createdAt: new Date('2026-01-01') } },
      { deviceId: 'b', deviceName: 'ใหม่', _max: { createdAt: new Date('2026-06-01') } },
    ]);
    const res = await service.findDevices();
    expect(res.map((d) => d.deviceId)).toEqual(['b', 'a']);
    expect(res[0]).toEqual({ deviceId: 'b', deviceName: 'ใหม่', lastSeenAt: new Date('2026-06-01') });
  });
});

describe('audit-loaders (โหลดข้อมูลก่อนทำรายการ)', () => {
  const ctx = (params: Record<string, string> = {}, body: Record<string, unknown> = {}) =>
    ({ params, body, user }) as any;

  it('loadPayingTable: จ่ายทั้งโต๊ะด้วย tableSessionId', async () => {
    const prisma: any = { tableSession: { findUnique: jest.fn().mockResolvedValue({ table: { number: 7 } }) } };
    await expect(loaders.loadPayingTable(prisma, ctx({}, { tableSessionId: 's1' }))).resolves.toEqual({
      tableNumber: 7,
    });
  });

  it('loadPayingTable: ไม่มีอะไรเลย / หาไม่เจอ → null', async () => {
    const prisma: any = { tableSession: { findUnique: jest.fn().mockResolvedValue(null) } };
    await expect(loaders.loadPayingTable(prisma, ctx())).resolves.toEqual({ tableNumber: null });
    await expect(loaders.loadPayingTable(prisma, ctx({}, { tableSessionId: 'x' }))).resolves.toEqual({
      tableNumber: null,
    });
  });

  it.each([
    ['loadPayment', 'payment', 'findUnique', { id: 'x1' }],
    ['loadOrder', 'order', 'findUnique', { id: 'x1' }],
    ['loadExpense', 'expense', 'findUnique', { id: 'x1' }],
    ['loadCashClose', 'dailyCashClose', 'findUnique', { id: 'x1' }],
    ['loadMenuItem', 'menuItem', 'findUnique', { id: 'x1' }],
    ['loadUser', 'user', 'findUnique', { id: 'x1' }],
    ['loadOrderItem', 'orderItem', 'findFirst', { id: 'item-1', orderId: 'x1' }],
  ] as const)('%s อ่านจาก %s ตาม params', async (fn, model, method, where) => {
    const prisma: any = { [model]: { [method]: jest.fn().mockResolvedValue({ ok: 1 }) } };
    await expect((loaders as any)[fn](prisma, ctx({ id: 'x1', itemId: 'item-1' }))).resolves.toEqual({ ok: 1 });
    expect(prisma[model][method].mock.calls[0][0].where).toEqual(where);
    // ห้ามดึงรหัสผ่านหรือข้อมูลลับมาเก็บลงประวัติ
    expect(JSON.stringify(prisma[model][method].mock.calls[0][0].select)).not.toMatch(/password|token/i);
  });
});
