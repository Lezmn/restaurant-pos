import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PaymentMethod, ServiceRequestStatus, ServiceRequestType } from '@prisma/client';
import { ServiceRequestsService } from '../../../src/service-requests/service-requests.service';

const session = { id: 'sess-1', tableId: 'table-1', token: 'tok' };

function request(overrides: Record<string, unknown> = {}) {
  return {
    id: 'req-1',
    type: ServiceRequestType.CALL_STAFF,
    status: ServiceRequestStatus.PENDING,
    paymentMethod: null,
    tableId: 'table-1',
    tableSessionId: 'sess-1',
    table: { id: 'table-1', number: 5 },
    ...overrides,
  };
}

function setup() {
  const prisma: any = {
    restaurantTable: { findUnique: jest.fn() },
    tableSession: { findUnique: jest.fn() },
    serviceRequest: {
      create: jest.fn(async ({ data }: any) => request({ id: 'req-new', ...data })),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      update: jest.fn(async ({ where, data }: any) => request({ id: where.id, ...data })),
    },
  };
  const tableSessions: any = { resolveOpenSessionByToken: jest.fn().mockResolvedValue(session) };
  const events: any = { emitToStaffAndSession: jest.fn() };
  const service = new ServiceRequestsService(prisma, tableSessions, events);
  return { prisma, tableSessions, events, service };
}

describe('ServiceRequestsService', () => {
  describe('create (พนักงานสร้างคำขอเอง)', () => {
    it('ไม่พบโต๊ะ → 404 และไม่สร้างคำขอ', async () => {
      const { prisma, service } = setup();
      prisma.restaurantTable.findUnique.mockResolvedValue(null);
      await expect(
        service.create({ tableId: 'nope', type: ServiceRequestType.CALL_STAFF } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.serviceRequest.create).not.toHaveBeenCalled();
    });

    it('session ไม่มีอยู่จริง → 404', async () => {
      const { prisma, service } = setup();
      prisma.restaurantTable.findUnique.mockResolvedValue({ id: 'table-1' });
      prisma.tableSession.findUnique.mockResolvedValue(null);
      await expect(
        service.create({ tableId: 'table-1', tableSessionId: 'x', type: ServiceRequestType.CALL_STAFF } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('session เป็นของโต๊ะอื่น → 400', async () => {
      const { prisma, service } = setup();
      prisma.restaurantTable.findUnique.mockResolvedValue({ id: 'table-1' });
      prisma.tableSession.findUnique.mockResolvedValue({ tableId: 'table-2' });
      await expect(
        service.create({ tableId: 'table-1', tableSessionId: 'sess-9', type: ServiceRequestType.CALL_STAFF } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('ถูกต้อง → สร้างแล้วแจ้ง POS + โต๊ะผ่าน socket', async () => {
      const { prisma, events, service } = setup();
      prisma.restaurantTable.findUnique.mockResolvedValue({ id: 'table-1' });
      prisma.tableSession.findUnique.mockResolvedValue({ tableId: 'table-1' });
      const created = await service.create({
        tableId: 'table-1',
        tableSessionId: 'sess-1',
        type: ServiceRequestType.CALL_STAFF,
      } as any);
      expect(created.id).toBe('req-new');
      expect(events.emitToStaffAndSession).toHaveBeenCalledWith(
        'sess-1',
        'service-request.created',
        expect.objectContaining({ id: 'req-new', tableId: 'table-1' }),
      );
    });
  });

  describe.each([
    ['createCallStaffFromSessionToken', ServiceRequestType.CALL_STAFF],
    ['createCheckoutFromSessionToken', ServiceRequestType.CHECKOUT],
  ] as const)('%s (ลูกค้ากดจาก QR)', (method, type) => {
    it('มีคำขอประเภทเดียวกันค้างอยู่ → คืนอันเดิม ไม่สร้างซ้ำ ไม่แจ้งซ้ำ', async () => {
      const { prisma, events, service } = setup();
      const pending = request({ type });
      prisma.serviceRequest.findFirst.mockResolvedValue(pending);
      await expect(service[method]('tok')).resolves.toBe(pending);
      expect(prisma.serviceRequest.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tableSessionId: 'sess-1', type, status: ServiceRequestStatus.PENDING },
        }),
      );
      expect(prisma.serviceRequest.create).not.toHaveBeenCalled();
      expect(events.emitToStaffAndSession).not.toHaveBeenCalled();
    });

    it('ยังไม่มี → สร้างใหม่ผูกโต๊ะ/session จาก token แล้วแจ้ง', async () => {
      const { prisma, events, service } = setup();
      await service[method]('tok');
      expect(prisma.serviceRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { tableId: 'table-1', tableSessionId: 'sess-1', type } }),
      );
      expect(events.emitToStaffAndSession).toHaveBeenCalledWith('sess-1', 'service-request.created', expect.any(Object));
    });

    it('token หมดอายุ/ปิดแล้ว → error จาก TableSessionsService ส่งต่อ', async () => {
      const { tableSessions, prisma, service } = setup();
      tableSessions.resolveOpenSessionByToken.mockRejectedValue(new NotFoundException());
      await expect(service[method]('dead')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.serviceRequest.create).not.toHaveBeenCalled();
    });
  });

  it('findAll ส่ง filter ตรงไปที่ where', async () => {
    const { prisma, service } = setup();
    await service.findAll({ status: ServiceRequestStatus.PENDING, tableId: 't' } as any);
    expect(prisma.serviceRequest.findMany.mock.calls[0][0].where).toEqual({
      status: ServiceRequestStatus.PENDING,
      type: undefined,
      tableId: 't',
      tableSessionId: undefined,
    });
  });

  it('findOne ไม่พบ → 404', async () => {
    const { prisma, service } = setup();
    prisma.serviceRequest.findUnique.mockResolvedValue(null);
    await expect(service.findOne('x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    ['resolve', ServiceRequestStatus.RESOLVED],
    ['cancel', ServiceRequestStatus.CANCELLED],
  ] as const)('%s → เปลี่ยนสถานะ + ใส่ resolvedAt + แจ้ง updated', async (method, status) => {
    const { prisma, events, service } = setup();
    prisma.serviceRequest.findUnique.mockResolvedValue(request());
    const updated = await service[method]('req-1');
    expect(updated.status).toBe(status);
    expect(prisma.serviceRequest.update.mock.calls[0][0].data.resolvedAt).toBeInstanceOf(Date);
    expect(events.emitToStaffAndSession).toHaveBeenCalledWith('sess-1', 'service-request.updated', expect.any(Object));
  });

  describe('updatePaymentMethod', () => {
    it('คำขอไม่ใช่เช็คบิล → 400', async () => {
      const { prisma, service } = setup();
      prisma.serviceRequest.findUnique.mockResolvedValue(request({ type: ServiceRequestType.CALL_STAFF }));
      await expect(service.updatePaymentMethod('req-1', PaymentMethod.CASH)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.serviceRequest.update).not.toHaveBeenCalled();
    });

    it('คำขอเช็คบิล → บันทึกวิธีจ่าย', async () => {
      const { prisma, service } = setup();
      prisma.serviceRequest.findUnique.mockResolvedValue(request({ type: ServiceRequestType.CHECKOUT }));
      const updated = await service.updatePaymentMethod('req-1', PaymentMethod.PROMPTPAY);
      expect(updated.paymentMethod).toBe(PaymentMethod.PROMPTPAY);
    });
  });
});
