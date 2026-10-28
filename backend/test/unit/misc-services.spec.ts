import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { CashClosesService } from '../../src/cash-closes/cash-closes.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TablesService } from '../../src/tables/tables.service';

/** ช่องว่างเล็ก ๆ ของ service ที่มี spec หลักอยู่แล้ว (cash-closes, tables, prisma) */
const D = (v: number) => new Prisma.Decimal(v);
const prismaError = (code: string) => new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: 't' });

describe('CashClosesService — findAll / findOne / remove', () => {
  function setup() {
    const prisma: any = {
      payment: { groupBy: jest.fn().mockResolvedValue([]) },
      expense: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }), findMany: jest.fn().mockResolvedValue([]) },
      order: { groupBy: jest.fn().mockResolvedValue([]) },
      dailyCashClose: {
        create: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        delete: jest.fn().mockResolvedValue({ id: 'cc1' }),
      },
    };
    return { prisma, service: new CashClosesService(prisma) };
  }

  const snapshot = {
    id: 'cc1',
    date: '2026-05-01',
    cashSales: D(0),
    promptpaySales: D(0),
    drawerExpenses: D(0),
  };

  it('findAll กรองตามเดือนด้วย date key [ต้นเดือน, ต้นเดือนถัดไป)', async () => {
    const { prisma, service } = setup();
    await service.findAll({ month: '2026-12' } as any);
    expect(prisma.dailyCashClose.findMany.mock.calls[0][0].where).toEqual({
      date: { gte: '2026-12-01', lt: '2027-01-01' },
    });
    await service.findAll({} as any);
    expect(prisma.dailyCashClose.findMany.mock.calls[1][0].where).toBeUndefined();
  });

  it('findOne ไม่พบ → 404 / remove ไม่พบ → 404 ไม่ลบ', async () => {
    const { prisma, service } = setup();
    await expect(service.findOne('x')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove('x')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.dailyCashClose.delete).not.toHaveBeenCalled();
  });

  it('findOne ยอดไม่เปลี่ยนหลังปิด → changedSinceClose = false', async () => {
    const { prisma, service } = setup();
    prisma.dailyCashClose.findUnique.mockResolvedValue(snapshot);
    await expect(service.findOne('cc1')).resolves.toMatchObject({ changedSinceClose: false });
  });

  it('remove คืนแถวที่ลบ (ไม่ใช่ body ว่าง)', async () => {
    const { prisma, service } = setup();
    prisma.dailyCashClose.findUnique.mockResolvedValue(snapshot);
    await expect(service.remove('cc1')).resolves.toEqual({ id: 'cc1' });
  });

  it('create: error อื่นที่ไม่ใช่ปิดยอดซ้ำ → โยนต่อ', async () => {
    const { prisma, service } = setup();
    const err = new Error('db');
    prisma.dailyCashClose.create.mockRejectedValue(err);
    await expect(
      service.create({ openingFloat: 0, countedCash: 0 } as any, { id: 'u', email: 'e', name: 'n', role: Role.STAFF }),
    ).rejects.toBe(err);
  });
});

describe('TablesService — ช่องว่างที่เหลือ', () => {
  function setup() {
    const prisma: any = {
      restaurantTable: {
        findUnique: jest.fn().mockResolvedValue({ id: 't1', number: 5, orders: [] }),
        update: jest.fn(),
        delete: jest.fn(),
      },
      tableSession: { count: jest.fn().mockResolvedValue(0) },
    };
    return { prisma, service: new TablesService(prisma) };
  }

  it('findOne/update ไม่พบโต๊ะ → 404', async () => {
    const { prisma, service } = setup();
    prisma.restaurantTable.findUnique.mockResolvedValue(null);
    await expect(service.findOne('x')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.update('x', { seats: 2 } as any)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update เลขโต๊ะชน → 409 / error อื่นโยนต่อ', async () => {
    const { prisma, service } = setup();
    prisma.restaurantTable.update.mockRejectedValueOnce(prismaError('P2002'));
    await expect(service.update('t1', { number: 9 } as any)).rejects.toThrow('มีโต๊ะหมายเลข 9 อยู่แล้ว');
    const err = new Error('db');
    prisma.restaurantTable.update.mockRejectedValueOnce(err);
    await expect(service.update('t1', { seats: 2 } as any)).rejects.toBe(err);
  });

  it('เปิดใช้งาน/แก้ที่นั่งไม่ต้องเช็คลูกค้า', async () => {
    const { prisma, service } = setup();
    await service.update('t1', { isActive: true } as any);
    expect(prisma.tableSession.count).not.toHaveBeenCalled();
  });

  it('remove: ยังมีออเดอร์เปิด → 409 / error อื่นตอนลบ → โยนต่อ', async () => {
    const { prisma, service } = setup();
    prisma.restaurantTable.findUnique.mockResolvedValueOnce({ id: 't1', orders: [{}, {}] });
    await expect(service.remove('t1')).rejects.toThrow(/2 รายการ/);
    const err = new Error('db');
    prisma.restaurantTable.delete.mockRejectedValueOnce(err);
    await expect(service.remove('t1')).rejects.toBe(err);
  });

  it('remove สำเร็จ', async () => {
    const { prisma, service } = setup();
    prisma.restaurantTable.delete.mockResolvedValue({ id: 't1' });
    await expect(service.remove('t1')).resolves.toEqual({ id: 't1' });
  });

  it('remove มีประวัติขาย (FK) → 409 ให้ปิดใช้งานแทน', async () => {
    const { prisma, service } = setup();
    prisma.restaurantTable.delete.mockRejectedValue(prismaError('P2003'));
    await expect(service.remove('t1')).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('PrismaService', () => {
  it('ต่อ DB ตอน boot และตัดตอนปิดแอป', async () => {
    const service = Object.create(PrismaService.prototype) as PrismaService;
    (service as any).$connect = jest.fn();
    (service as any).$disconnect = jest.fn();
    await service.onModuleInit();
    await service.onModuleDestroy();
    expect((service as any).$connect).toHaveBeenCalled();
    expect((service as any).$disconnect).toHaveBeenCalled();
  });
});
