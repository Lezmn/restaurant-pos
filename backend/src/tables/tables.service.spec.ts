import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TablesService } from './tables.service';

function setup() {
  const prisma: any = {
    restaurantTable: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({ id: 't1', number: 5, orders: [] }),
      create: jest.fn(({ data }: any) => Promise.resolve({ id: 'new', ...data })),
      update: jest.fn(({ data }: any) => Promise.resolve({ id: 't1', ...data })),
      delete: jest.fn(),
    },
    tableSession: { count: jest.fn().mockResolvedValue(0) },
  };
  return { prisma, service: new TablesService(prisma) };
}

const known = (code: string) => new Prisma.PrismaClientKnownRequestError(code, { code, clientVersion: 'x' });

describe('TablesService — จัดการโต๊ะ (ADMIN)', () => {
  it('หน้าพนักงานเห็นเฉพาะโต๊ะที่ใช้งาน, หน้าจัดการโต๊ะขอรวมที่ปิดไว้ได้', async () => {
    const { prisma, service } = setup();
    await service.findAll();
    expect(prisma.restaurantTable.findMany.mock.calls[0][0].where).toEqual({ status: undefined, isActive: true });
    await service.findAll(undefined, true);
    expect(prisma.restaurantTable.findMany.mock.calls[1][0].where).toEqual({ status: undefined, isActive: undefined });
  });

  it('เลขโต๊ะซ้ำ → 409 บอกเลขที่ซ้ำ', async () => {
    const { prisma, service } = setup();
    prisma.restaurantTable.create.mockRejectedValue(known('P2002'));
    await expect(service.create({ number: 5 })).rejects.toThrow('มีโต๊ะหมายเลข 5 อยู่แล้ว');
  });

  it('ปิดใช้งานโต๊ะที่ลูกค้ายังนั่งอยู่ (QR เปิด) → 409, ว่างอยู่ → ปิดได้', async () => {
    const { prisma, service } = setup();
    prisma.tableSession.count.mockResolvedValueOnce(1);
    await expect(service.update('t1', { isActive: false })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.restaurantTable.update).not.toHaveBeenCalled();

    await expect(service.update('t1', { isActive: false })).resolves.toMatchObject({ isActive: false });
  });

  it('ลบโต๊ะที่มีประวัติการขาย → 409 แนะนำให้ปิดใช้งานแทน', async () => {
    const { prisma, service } = setup();
    prisma.restaurantTable.delete.mockRejectedValue(known('P2003'));
    await expect(service.remove('t1')).rejects.toThrow('ปิดใช้งาน');
  });
});
