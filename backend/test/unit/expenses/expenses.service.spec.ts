import { NotFoundException } from '@nestjs/common';
import { ExpenseCategory, Role } from '@prisma/client';
import { AuthenticatedUser } from '../../../src/auth/jwt.strategy';
import { ExpensesService } from '../../../src/expenses/expenses.service';

const staff: AuthenticatedUser = { id: 'u-staff', email: 's@x', name: 'Staff', role: Role.STAFF };

function setup() {
  const prisma: any = {
    expense: {
      create: jest.fn(async ({ data }: any) => ({ id: 'e-1', ...data })),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      update: jest.fn(async ({ data }: any) => ({ id: 'e-1', ...data })),
      delete: jest.fn().mockResolvedValue({ id: 'e-1' }),
    },
  };
  return { prisma, service: new ExpensesService(prisma) };
}

describe('ExpensesService', () => {
  it('create บันทึกผู้สร้างจาก user ที่ login และแปลง spentAt เป็น Date', async () => {
    const { prisma, service } = setup();
    await service.create(
      {
        title: 'ค่าน้ำแข็ง',
        amount: 120,
        category: ExpenseCategory.INGREDIENTS,
        spentAt: '2026-03-01T08:00:00.000Z',
      } as any,
      staff,
    );
    const data = prisma.expense.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ title: 'ค่าน้ำแข็ง', amount: 120, createdById: 'u-staff', createdByName: 'Staff' });
    expect(data.spentAt).toEqual(new Date('2026-03-01T08:00:00.000Z'));
  });

  it('create ไม่ส่ง spentAt → ปล่อยให้ DB ใส่เวลาเอง', async () => {
    const { prisma, service } = setup();
    await service.create({ title: 'x', amount: 1, category: ExpenseCategory.OTHER } as any, staff);
    expect(prisma.expense.create.mock.calls[0][0].data.spentAt).toBeUndefined();
  });

  it('createFromDrawer = จ่ายจากลิ้นชักเสมอ หมวดเริ่มต้นเป็นวัตถุดิบ', async () => {
    const { prisma, service } = setup();
    await service.createFromDrawer({ title: 'ผัก', amount: 80 } as any, staff);
    expect(prisma.expense.create.mock.calls[0][0].data).toMatchObject({
      paidFromDrawer: true,
      category: ExpenseCategory.INGREDIENTS,
      createdById: 'u-staff',
    });
  });

  it('createFromDrawer ใช้หมวดที่ส่งมาถ้ามี', async () => {
    const { prisma, service } = setup();
    await service.createFromDrawer({ title: 'แก๊ส', amount: 400, category: ExpenseCategory.UTILITIES } as any, staff);
    expect(prisma.expense.create.mock.calls[0][0].data.category).toBe(ExpenseCategory.UTILITIES);
  });

  it('findAll กรองหมวด + ช่วงวันที่ เรียงล่าสุดก่อน', async () => {
    const { prisma, service } = setup();
    await service.findAll({ category: ExpenseCategory.OTHER, from: '2026-03-01', to: '2026-03-31' } as any);
    const args = prisma.expense.findMany.mock.calls[0][0];
    expect(args.where.category).toBe(ExpenseCategory.OTHER);
    expect(args.where.spentAt.gte).toBeInstanceOf(Date);
    expect(args.where.spentAt.lte ?? args.where.spentAt.lt).toBeInstanceOf(Date);
    expect(args.orderBy).toEqual({ spentAt: 'desc' });
  });

  it('findOne/update/remove — ไม่พบ → 404 และไม่แก้ DB', async () => {
    const { prisma, service } = setup();
    prisma.expense.findUnique.mockResolvedValue(null);
    await expect(service.findOne('x')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.update('x', { amount: 1 } as any)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove('x')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.expense.update).not.toHaveBeenCalled();
    expect(prisma.expense.delete).not.toHaveBeenCalled();
  });

  it('update แก้เฉพาะฟิลด์ที่ส่งมา', async () => {
    const { prisma, service } = setup();
    prisma.expense.findUnique.mockResolvedValue({ id: 'e-1' });
    await service.update('e-1', { amount: 99, spentAt: '2026-03-02T00:00:00.000Z' } as any);
    const data = prisma.expense.update.mock.calls[0][0].data;
    expect(data.amount).toBe(99);
    expect(data.title).toBeUndefined();
    expect(data.spentAt).toEqual(new Date('2026-03-02T00:00:00.000Z'));
  });

  it('remove ลบเมื่อพบ', async () => {
    const { prisma, service } = setup();
    prisma.expense.findUnique.mockResolvedValue({ id: 'e-1' });
    await service.remove('e-1');
    expect(prisma.expense.delete).toHaveBeenCalledWith({ where: { id: 'e-1' } });
  });
});
