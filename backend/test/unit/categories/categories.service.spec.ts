import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CategoriesService } from '../../../src/categories/categories.service';

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('db error', { code, clientVersion: 'test' });

function setup() {
  const prisma: any = {
    category: {
      create: jest.fn(async ({ data }: any) => ({ id: 'c-1', ...data })),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      update: jest.fn(async ({ data }: any) => ({ id: 'c-1', ...data })),
      delete: jest.fn().mockResolvedValue({ id: 'c-1' }),
    },
    // เมนูที่ลบแบบซ่อนแล้วแต่ยังผูกหมวดอยู่ — ค่าเริ่มต้นไม่มี
    menuItem: { count: jest.fn().mockResolvedValue(0) },
  };
  return { prisma, service: new CategoriesService(prisma) };
}

describe('CategoriesService', () => {
  it('create ชื่อซ้ำ (P2002) → 409 พร้อมชื่อ', async () => {
    const { prisma, service } = setup();
    prisma.category.create.mockRejectedValue(prismaError('P2002'));
    await expect(service.create({ name: 'ของหวาน' } as any)).rejects.toThrow(
      new ConflictException('มีหมวดหมู่ชื่อ "ของหวาน" อยู่แล้ว'),
    );
  });

  it('create error อื่นจาก DB → โยนต่อตามเดิม', async () => {
    const { prisma, service } = setup();
    const err = prismaError('P2025');
    prisma.category.create.mockRejectedValue(err);
    await expect(service.create({ name: 'x' } as any)).rejects.toBe(err);
  });

  it('findAll นับจำนวนเมนูในหมวด (ไม่นับเมนูที่ลบแบบซ่อน) เรียงตามชื่อ', async () => {
    const { prisma, service } = setup();
    await service.findAll();
    expect(prisma.category.findMany).toHaveBeenCalledWith({
      orderBy: { name: 'asc' },
      include: { _count: { select: { menuItems: { where: { deletedAt: null } } } } },
    });
  });

  it('findOne ไม่พบ → 404', async () => {
    const { prisma, service } = setup();
    prisma.category.findUnique.mockResolvedValue(null);
    await expect(service.findOne('x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update เปลี่ยนชื่อไปชนหมวดอื่น → 409', async () => {
    const { prisma, service } = setup();
    prisma.category.findUnique.mockResolvedValue({ id: 'c-1', menuItems: [] });
    prisma.category.update.mockRejectedValue(prismaError('P2002'));
    await expect(service.update('c-1', { name: 'ซ้ำ' } as any)).rejects.toBeInstanceOf(ConflictException);
  });

  it('update สำเร็จ', async () => {
    const { prisma, service } = setup();
    prisma.category.findUnique.mockResolvedValue({ id: 'c-1', menuItems: [] });
    await expect(service.update('c-1', { name: 'ใหม่' } as any)).resolves.toMatchObject({ name: 'ใหม่' });
  });

  it('remove หมวดที่ยังมีเมนู → 409 และไม่ลบ', async () => {
    const { prisma, service } = setup();
    prisma.category.findUnique.mockResolvedValue({ id: 'c-1', menuItems: [{}, {}] });
    await expect(service.remove('c-1')).rejects.toThrow(/2 รายการ/);
    expect(prisma.category.delete).not.toHaveBeenCalled();
  });

  it('remove หมวดที่เหลือแต่เมนูที่ลบแบบซ่อน (มีประวัติออเดอร์) → 409 และไม่ลบ', async () => {
    const { prisma, service } = setup();
    prisma.category.findUnique.mockResolvedValue({ id: 'c-1', menuItems: [] });
    prisma.menuItem.count.mockResolvedValue(3);
    await expect(service.remove('c-1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.menuItem.count).toHaveBeenCalledWith({ where: { categoryId: 'c-1' } });
    expect(prisma.category.delete).not.toHaveBeenCalled();
  });

  it('remove หมวดว่าง → ลบได้', async () => {
    const { prisma, service } = setup();
    prisma.category.findUnique.mockResolvedValue({ id: 'c-1', menuItems: [] });
    await service.remove('c-1');
    expect(prisma.category.delete).toHaveBeenCalledWith({ where: { id: 'c-1' } });
  });
});
