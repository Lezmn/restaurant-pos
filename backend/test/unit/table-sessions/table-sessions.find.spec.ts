import { NotFoundException } from '@nestjs/common';
import { ServiceRequestStatus, ServiceRequestType, TableSessionStatus } from '@prisma/client';
import { TableSessionsService } from '../../../src/table-sessions/table-sessions.service';

// findAll / findOne (ย้าย/รวมโต๊ะ, จำนวนลูกค้า และการหารบิล ไม่มีในระบบแล้ว จึงไม่มีเทสต์ของส่วนนั้น)

/** แถวเต็มที่ findOne/findAll อ่าน */
const fullSession = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  status: TableSessionStatus.OPEN,
  tableId: `table-of-${id}`,
  isTakeaway: false,
  table: { id: `table-of-${id}`, number: 1 },
  orders: [],
  serviceRequests: [],
  billSplits: [],
  ...extra,
});

function setup() {
  const prisma: any = {
    tableSession: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
  };
  const events: any = { emitToStaff: jest.fn(), emitToStaffAndSession: jest.fn() };
  return { prisma, service: new TableSessionsService(prisma, events) };
}

describe('TableSessionsService.findAll / findOne', () => {
  // ทดสอบ: findAll กรองตามสถานะ และส่งคำขอเช็คบิลล่าสุดของโต๊ะออกไป (ไม่ส่งรายการคำขอทั้งหมด)
  // วิธี: mock โต๊ะที่มีคำขอเช็คบิล 2 ครั้ง + เรียกพนักงาน 1 ครั้ง → เช็ก where, checkoutRequest เป็นใบใหม่สุด และไม่มี serviceRequests
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

  // ทดสอบ: ขอดูโต๊ะที่ไม่มีอยู่ → 404
  // วิธี: findUnique คืน null → findOne('x') ต้องโยน NotFoundException
  it('findOne ไม่พบ → 404', async () => {
    const { service } = setup();
    await expect(service.findOne('x')).rejects.toBeInstanceOf(NotFoundException);
  });
});
