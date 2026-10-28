import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IngredientsService } from '../../../src/ingredients/ingredients.service';

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('db error', { code, clientVersion: 'test' });

function setup(current: Record<string, unknown> | null = { id: 'ing-1', name: 'ไข่', stockQty: 10 }) {
  const tx: any = {
    menuOption: {
      deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    ingredient: { delete: jest.fn().mockResolvedValue({ id: 'ing-1', name: 'ไข่' }) },
  };
  const prisma: any = {
    ingredient: {
      create: jest.fn(async ({ data }: any) => ({ id: 'ing-1', ...data })),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(current),
      update: jest.fn(async ({ data }: any) => ({ id: 'ing-1', ...data })),
    },
    $transaction: jest.fn((fn: (t: any) => unknown) => fn(tx)),
  };
  const events: any = { emitToEveryone: jest.fn() };
  return { prisma, tx, events, service: new IngredientsService(prisma, events) };
}

describe('IngredientsService', () => {
  describe('create', () => {
    it('trim ชื่อ, ไม่มีรูป = null, แจ้งทุกจอให้โหลดเมนูใหม่', async () => {
      const { prisma, events, service } = setup();
      await service.create({ name: '  หมู  ' } as any);
      expect(prisma.ingredient.create.mock.calls[0][0].data).toMatchObject({
        name: 'หมู',
        imageUrl: null,
        isAvailable: undefined,
      });
      expect(events.emitToEveryone).toHaveBeenCalledWith('menu.updated', expect.any(Object));
    });

    it.each([
      [{ stockQty: 0 }, false],
      [{ stockQty: 5 }, true],
      [{ stockQty: null }, undefined],
      [{ stockQty: 5, isAvailable: false }, false],
    ])('สต็อก %j → isAvailable = %s', async (extra, expected) => {
      const { prisma, service } = setup();
      await service.create({ name: 'x', ...extra } as any);
      expect(prisma.ingredient.create.mock.calls[0][0].data.isAvailable).toBe(expected);
    });

    // BUG (รายงานใน PR): update() ปฏิเสธ "ยอด 0 แต่สั่งเปิด" แต่ create() ไม่ตรวจ — สร้างวัตถุดิบที่เปิดอยู่แต่ตัดสต็อกไม่ได้
    // ลูกค้าเห็นเมนูขายได้ แต่สั่งแล้วโดน 400 "ไม่พอ" — ตั้งใจให้ "ล้มเหลว" จนกว่าจะแก้ (แก้แล้วเอา .failing ออก)
    it.failing('BUG: สร้างด้วยยอด 0 พร้อมสั่งเปิด → ควร 400 เหมือนตอนแก้', async () => {
      const { service } = setup();
      await expect(service.create({ name: 'ไข่', stockQty: 0, isAvailable: true } as any)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('ชื่อซ้ำ → 409 และไม่แจ้ง socket', async () => {
      const { prisma, events, service } = setup();
      prisma.ingredient.create.mockRejectedValue(prismaError('P2002'));
      await expect(service.create({ name: 'ไข่' } as any)).rejects.toBeInstanceOf(ConflictException);
      expect(events.emitToEveryone).not.toHaveBeenCalled();
    });
  });

  it('findOne ไม่พบ → 404', async () => {
    const { service } = setup(null);
    await expect(service.findOne('x')).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('update', () => {
    it('ยอดคงเหลือเป็น 0 แล้วสั่งเปิด → 400 (เปิดได้แต่สั่งไม่ได้จริง)', async () => {
      const { prisma, service } = setup({ id: 'ing-1', name: 'ไข่', stockQty: 0 });
      await expect(service.update('ing-1', { isAvailable: true } as any)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.ingredient.update).not.toHaveBeenCalled();
    });

    it('ตั้งยอดเป็น 0 พร้อมสั่งเปิด → 400', async () => {
      const { service } = setup();
      await expect(service.update('ing-1', { stockQty: 0, isAvailable: true } as any)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('เติมสต็อกจาก 0 → เปิดให้เอง', async () => {
      const { prisma, service } = setup({ id: 'ing-1', name: 'ไข่', stockQty: 0 });
      await service.update('ing-1', { stockQty: 12 } as any);
      expect(prisma.ingredient.update.mock.calls[0][0].data).toEqual({ stockQty: 12, isAvailable: true });
    });

    it('ไม่นับสต็อก (null) เปิด/ปิดด้วยมือได้', async () => {
      const { prisma, service } = setup({ id: 'ing-1', name: 'ไข่', stockQty: null });
      await service.update('ing-1', { isAvailable: true } as any);
      expect(prisma.ingredient.update.mock.calls[0][0].data.isAvailable).toBe(true);
    });

    it('ส่งเฉพาะฟิลด์ที่เปลี่ยน — ไม่ส่งเลยไม่ทับค่าเดิม', async () => {
      const { prisma, events, service } = setup();
      await service.update('ing-1', { name: ' ไข่เป็ด ', imageUrl: null, lowStockAt: 3 } as any);
      expect(prisma.ingredient.update.mock.calls[0][0].data).toEqual({
        name: 'ไข่เป็ด',
        imageUrl: null,
        lowStockAt: 3,
        isAvailable: undefined,
      });
      expect(events.emitToEveryone).toHaveBeenCalled();
    });

    it('เปลี่ยนชื่อชนของเดิม → 409', async () => {
      const { prisma, service } = setup();
      prisma.ingredient.update.mockRejectedValue(prismaError('P2002'));
      await expect(service.update('ing-1', { name: 'หมู' } as any)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('remove', () => {
    it('ลบตัวเลือกที่ไม่เคยถูกสั่ง ปิด+ปลดตัวที่เคยสั่ง แล้วลบวัตถุดิบในทรานแซกชันเดียว', async () => {
      const { tx, events, service } = setup();
      const res = await service.remove('ing-1');
      expect(tx.menuOption.deleteMany).toHaveBeenCalledWith({
        where: { ingredientId: 'ing-1', orderItemOptions: { none: {} } },
      });
      expect(tx.menuOption.updateMany).toHaveBeenCalledWith({
        where: { ingredientId: 'ing-1' },
        data: { ingredientId: null, isAvailable: false },
      });
      expect(res).toMatchObject({ id: 'ing-1', deletedOptions: 2, disabledOptions: 1 });
      expect(events.emitToEveryone).toHaveBeenCalled();
    });

    it('มีออเดอร์เข้ามาระหว่างลบ (FK P2003) → 409 ให้ลองใหม่', async () => {
      const { prisma, events, service } = setup();
      prisma.$transaction.mockRejectedValue(prismaError('P2003'));
      await expect(service.remove('ing-1')).rejects.toBeInstanceOf(ConflictException);
      expect(events.emitToEveryone).not.toHaveBeenCalled();
    });

    it('error อื่น → โยนต่อ', async () => {
      const { prisma, service } = setup();
      const err = new Error('boom');
      prisma.$transaction.mockRejectedValue(err);
      await expect(service.remove('ing-1')).rejects.toBe(err);
    });

    it('ไม่พบ → 404 ไม่เปิดทรานแซกชัน', async () => {
      const { prisma, service } = setup(null);
      await expect(service.remove('x')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
