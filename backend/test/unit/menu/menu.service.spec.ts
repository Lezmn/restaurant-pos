import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MenuService } from '../../../src/menu/menu.service';

const known = (code: string) => new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: 'x' });

function makePrisma() {
  return {
    category: { findUnique: jest.fn().mockResolvedValue({ id: 'c1' }) },
    menuItem: {
      create: jest.fn(({ data }: any) => Promise.resolve({ id: 'm1', ...data })),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({ id: 'm1', name: 'ข้าวผัด' }),
      update: jest.fn(({ data }: any) => Promise.resolve({ id: 'm1', ...data })),
      delete: jest.fn().mockResolvedValue({ id: 'm1' }),
    },
    menuOption: {
      create: jest.fn(({ data }: any) => Promise.resolve({ id: 'o1', ...data })),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue({ id: 'o1', menuItemId: 'm1', name: 'ไข่ดาว', ingredientId: null }),
      update: jest.fn(({ data }: any) => Promise.resolve({ id: 'o1', ...data })),
      delete: jest.fn().mockResolvedValue({ id: 'o1' }),
    },
  };
}

describe('MenuService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let events: { emitToEveryone: jest.Mock };
  let service: MenuService;

  beforeEach(() => {
    prisma = makePrisma();
    events = { emitToEveryone: jest.fn() };
    service = new MenuService(prisma as any, events as any);
  });

  describe('เมนู', () => {
    // ทดสอบ: เพิ่มเมนูพร้อมวัตถุดิบหลัก ต้องผูกวัตถุดิบตาม id ที่ส่งมา และแจ้งทุกจอให้ดึงเมนูใหม่
    // วิธี: create() ด้วย ingredientIds 2 ตัว → เช็ก data ที่ส่งให้ prisma.menuItem.create และมี event menu.updated
    it('เพิ่มเมนู: ผูกวัตถุดิบหลัก และแจ้งทุกจอ', async () => {
      await service.create({ name: 'ข้าวผัด', price: 50, categoryId: 'c1', ingredientIds: ['rice', 'egg'] } as any);
      expect(prisma.menuItem.create.mock.calls[0][0].data).toMatchObject({
        name: 'ข้าวผัด',
        categoryId: 'c1',
        ingredients: { create: [{ ingredientId: 'rice' }, { ingredientId: 'egg' }] },
      });
      expect(events.emitToEveryone).toHaveBeenCalledWith('menu.updated', expect.any(Object));
    });

    // ทดสอบ: เพิ่มเมนูในหมวดที่ไม่มีอยู่ ต้องได้ 404 และไม่สร้างเมนู ไม่แจ้งใคร
    // วิธี: category.findUnique คืน null → create() ต้อง throw NotFoundException → เช็กว่าไม่เรียก menuItem.create และไม่มี event
    it('เพิ่มเมนูในหมวดที่ไม่มี → 404', async () => {
      prisma.category.findUnique.mockResolvedValue(null);
      await expect(service.create({ name: 'x', price: 1, categoryId: 'nope' } as any)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.menuItem.create).not.toHaveBeenCalled();
      expect(events.emitToEveryone).not.toHaveBeenCalled();
    });

    // ทดสอบ: อ้างวัตถุดิบที่ไม่มีอยู่ (foreign key ไม่เจอ) ต้องได้ 400 ที่อ่านเข้าใจ ไม่ใช่ 500
    // วิธี: menuItem.create โยน P2003 → create() ต้อง throw BadRequestException ที่บอกว่า ingredientId ไม่มีอยู่จริง
    it('วัตถุดิบที่อ้างไม่มีอยู่ → 400', async () => {
      prisma.menuItem.create.mockRejectedValue(known('P2003'));
      await expect(service.create({ name: 'x', price: 1, categoryId: 'c1', ingredientIds: ['ghost'] } as any)).rejects.toThrow(
        /ingredientId ไม่มีอยู่จริง/,
      );
    });

    // ทดสอบ: แก้เมนูโดยไม่ส่ง ingredientIds ต้องไม่แตะวัตถุดิบเดิม ส่วนส่งมาต้องแทนที่ทั้งชุด
    // วิธี: update() ครั้งแรกส่งแค่ราคา → data ไม่มี ingredients → update() ครั้งที่สองส่ง ingredientIds → data ลบของเดิมแล้วสร้างชุดใหม่
    it('แก้เมนู: ไม่ส่งวัตถุดิบ = ไม่แตะ ส่งมา = แทนทั้งชุด', async () => {
      await service.update('m1', { price: 60 } as any);
      expect(prisma.menuItem.update.mock.calls[0][0].data).toEqual({ price: 60 });
      await service.update('m1', { ingredientIds: ['rice'] } as any);
      expect(prisma.menuItem.update.mock.calls[1][0].data).toEqual({
        ingredients: { deleteMany: {}, create: [{ ingredientId: 'rice' }] },
      });
    });

    // ทดสอบ: แก้หรือลบเมนูที่ไม่มีอยู่ ต้องได้ 404 และไม่เขียนอะไร
    // วิธี: menuItem.findUnique คืน null → update() และ remove() ต้อง throw NotFoundException → เช็กว่าไม่เรียก update/delete
    it('แก้/ลบเมนูที่ไม่มี → 404', async () => {
      prisma.menuItem.findUnique.mockResolvedValue(null);
      await expect(service.update('nope', { price: 1 } as any)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.remove('nope')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.menuItem.update).not.toHaveBeenCalled();
      expect(prisma.menuItem.delete).not.toHaveBeenCalled();
    });

    // ทดสอบ: ลบเมนูที่เคยถูกสั่งแล้ว (ออเดอร์อ้างอยู่) ต้องได้ 400 พร้อมบอกให้ปิดขายแทน ไม่ใช่ 500
    // วิธี: menuItem.delete โยน P2003 → remove() ต้อง throw BadRequestException ที่แนะนำให้ปิด "พร้อมจำหน่าย"
    it('ลบเมนูที่เคยถูกสั่ง → 400 แนะนำให้ปิดขายแทน', async () => {
      prisma.menuItem.delete.mockRejectedValue(known('P2003'));
      const error = await service.remove('m1').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as Error).message).toMatch(/ให้ปิด "พร้อมจำหน่าย" แทนการลบ/);
    });

    // ทดสอบ: หน้าลูกค้าขอเฉพาะเมนูที่สั่งได้ ต้องกรองทั้งเมนูที่ปิดขายเองและเมนูที่วัตถุดิบหลักหมด ส่วนหน้าจัดการได้ทุกเมนู
    // วิธี: findAll({ onlyAvailable: true }) → เช็ก where มี isAvailable และเงื่อนไขวัตถุดิบไม่หมด → findAll() เฉย ๆ → where ไม่มีเงื่อนไขพวกนี้
    it('findAll: onlyAvailable กรองทั้งปิดขายและวัตถุดิบหมด', async () => {
      await service.findAll({ onlyAvailable: true });
      expect(prisma.menuItem.findMany.mock.calls[0][0].where).toEqual({
        categoryId: undefined,
        isAvailable: true,
        ingredients: { none: { ingredient: { isAvailable: false } } },
      });
      await service.findAll();
      expect(prisma.menuItem.findMany.mock.calls[1][0].where).toEqual({ categoryId: undefined });
    });
  });

  describe('ตัวเลือก', () => {
    // ทดสอบ: ชื่อตัวเลือกซ้ำในเมนูเดียวกัน (ไม่สนตัวพิมพ์) ต้องได้ 409 แต่ชื่อของตัวที่ถูกลบแบบซ่อนไปแล้วใช้ใหม่ได้
    // วิธี: menuOption.findFirst เจอตัวซ้ำ → createOption() ต้อง ConflictException → เช็ก where ค้นแบบ insensitive และนับเฉพาะตัวที่ยังเปิดหรือผูกวัตถุดิบ
    it('ชื่อซ้ำ → 409 (ไม่นับตัวที่ลบแบบซ่อน)', async () => {
      prisma.menuOption.findFirst.mockResolvedValue({ id: 'dup' });
      await expect(service.createOption('m1', { name: 'ไข่ดาว', price: 10 } as any)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.menuOption.findFirst.mock.calls[0][0].where).toMatchObject({
        menuItemId: 'm1',
        name: { equals: 'ไข่ดาว', mode: 'insensitive' },
        OR: [{ isAvailable: true }, { ingredientId: { not: null } }],
      });
      expect(prisma.menuOption.create).not.toHaveBeenCalled();
    });

    // ทดสอบ: ตัวเลือกที่ผูกวัตถุดิบ เปิดขายเสมอ (เปิด/ปิดที่วัตถุดิบที่เดียว) และสั่งปิดที่ตัวเลือกต้องได้ 400
    // วิธี: createOption() ผูกวัตถุดิบโดยไม่ส่ง isAvailable → บันทึกเป็น true → createOption() ผูกวัตถุดิบพร้อม isAvailable false → BadRequestException
    it('ผูกวัตถุดิบแล้วเปิดเสมอ ปิดที่ตัวเลือกไม่ได้', async () => {
      await service.createOption('m1', { name: 'กุ้ง', price: 20, ingredientId: 'shrimp' } as any);
      expect(prisma.menuOption.create.mock.calls[0][0].data).toMatchObject({ ingredientId: 'shrimp', isAvailable: true });
      await expect(
        service.createOption('m1', { name: 'หมึก', price: 20, ingredientId: 'squid', isAvailable: false } as any),
      ).rejects.toThrow(/ให้ปิดที่หน้า "วัตถุดิบ" แทน/);
    });

    // ทดสอบ: แก้ตัวเลือกที่ผูกวัตถุดิบอยู่เดิม (ไม่ได้ส่ง ingredientId มาใหม่) แล้วสั่งปิด ต้องได้ 400 เหมือนกัน
    // วิธี: ตัวเลือกเดิมผูกวัตถุดิบ → updateOption() ส่งแค่ isAvailable false → BadRequestException และไม่เรียก update
    it('แก้ตัวเลือกที่ผูกวัตถุดิบเดิมให้ปิด → 400', async () => {
      prisma.menuOption.findUnique.mockResolvedValue({ id: 'o1', menuItemId: 'm1', name: 'กุ้ง', ingredientId: 'shrimp' });
      await expect(service.updateOption('m1', 'o1', { isAvailable: false } as any)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.menuOption.update).not.toHaveBeenCalled();
    });

    // ทดสอบ: แก้ชื่อตัวเลือกให้ซ้ำตัวอื่นได้ 409 ส่วนบันทึกโดยชื่อเดิมไม่ต้องเช็กซ้ำ (ไม่ชนตัวเอง)
    // วิธี: updateOption() ชื่อเดิม → ไม่เรียก findFirst → updateOption() ชื่อใหม่ที่มีอยู่แล้ว → ConflictException และ where ยกเว้นตัวเอง
    it('แก้ชื่อตัวเลือก: ชื่อเดิมผ่าน ชื่อซ้ำตัวอื่น → 409', async () => {
      await service.updateOption('m1', 'o1', { name: 'ไข่ดาว', price: 15 } as any);
      expect(prisma.menuOption.findFirst).not.toHaveBeenCalled();
      prisma.menuOption.findFirst.mockResolvedValue({ id: 'o2' });
      await expect(service.updateOption('m1', 'o1', { name: 'ไข่เจียว' } as any)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.menuOption.findFirst.mock.calls[0][0].where.id).toEqual({ not: 'o1' });
    });

    // ทดสอบ: แก้/ลบตัวเลือกด้วย id ของเมนูอื่น หรือ id ที่ไม่มี ต้องได้ 404 (กันแก้ตัวเลือกข้ามเมนู)
    // วิธี: ตัวเลือก o1 เป็นของเมนู m2 → updateOption('m1', 'o1') และ removeOption('m1', 'o1') ต้อง NotFoundException → findUnique คืน null ก็ 404
    it('ตัวเลือกของเมนูอื่น / ไม่มีอยู่ → 404', async () => {
      prisma.menuOption.findUnique.mockResolvedValue({ id: 'o1', menuItemId: 'm2', name: 'x', ingredientId: null });
      await expect(service.updateOption('m1', 'o1', { price: 1 } as any)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.removeOption('m1', 'o1')).rejects.toBeInstanceOf(NotFoundException);
      prisma.menuOption.findUnique.mockResolvedValue(null);
      await expect(service.removeOption('m1', 'o1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.menuOption.delete).not.toHaveBeenCalled();
    });

    // ทดสอบ: ลบตัวเลือกที่เคยถูกสั่งแล้ว (ลบจริงไม่ได้) ต้องซ่อนแทน: ปิดขายและปลดวัตถุดิบ ประวัติออเดอร์ยังอยู่
    // วิธี: menuOption.delete โยน P2003 → removeOption() → เช็กว่า update เป็น isAvailable false, ingredientId null และยังแจ้งทุกจอ
    it('ลบตัวเลือกที่เคยถูกสั่ง → ซ่อนแทนการลบ', async () => {
      prisma.menuOption.delete.mockRejectedValue(known('P2003'));
      await service.removeOption('m1', 'o1');
      expect(prisma.menuOption.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { isAvailable: false, ingredientId: null },
      });
      expect(events.emitToEveryone).toHaveBeenCalledWith('menu.updated', expect.any(Object));
    });
  });
});
