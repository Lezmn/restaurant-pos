import { BadRequestException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { UsersService } from './users.service';

const user = (over: Partial<{ id: string; role: Role; isActive: boolean }> = {}) => ({
  id: 'u2',
  name: 'สมชาย',
  email: 'somchai@restaurant.local',
  role: Role.STAFF,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

function setup() {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn().mockImplementation(({ data }) => ({ ...user(), ...data })),
      delete: jest.fn(),
      count: jest.fn(),
    },
  };
  const events = { disconnectUser: jest.fn() };
  return { prisma, events, service: new UsersService(prisma as any, events as any) };
}

describe('UsersService — กันร้านไม่มี ADMIN เหลือ', () => {
  it('ลดสิทธิ์ ADMIN คนสุดท้าย → 400', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue(user({ id: 'a2', role: Role.ADMIN }));
    prisma.user.count.mockResolvedValue(0);
    await expect(service.update('a2', { role: Role.STAFF }, 'a1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('ปิดใช้งาน ADMIN ได้ถ้ายังมี ADMIN อื่นที่ใช้งานอยู่', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue(user({ id: 'a2', role: Role.ADMIN }));
    prisma.user.count.mockResolvedValue(1);
    await service.update('a2', { isActive: false }, 'a1');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isActive: false }) }),
    );
  });

  it('ลบ ADMIN คนสุดท้าย → 400', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue(user({ id: 'a2', role: Role.ADMIN }));
    prisma.user.count.mockResolvedValue(0);
    await expect(service.remove('a2', 'a1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });
});

describe('UsersService — บัญชีตัวเอง', () => {
  it('เปลี่ยนสิทธิ์ตัวเอง / ปิดตัวเอง / ลบตัวเอง → 400', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue(user({ id: 'a1', role: Role.ADMIN }));
    await expect(service.update('a1', { role: Role.STAFF }, 'a1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.update('a1', { isActive: false }, 'a1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.remove('a1', 'a1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('แก้ชื่อตัวเองได้ตามปกติ', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue(user({ id: 'a1', role: Role.ADMIN }));
    await expect(service.update('a1', { name: 'เจ้าของร้าน' }, 'a1')).resolves.toMatchObject({
      name: 'เจ้าของร้าน',
    });
  });
});

describe('UsersService — ลบพนักงานที่มีประวัติ', () => {
  it('ติด foreign key (เคยปิดยอด/เบิกเงิน) → 400 บอกให้ปิดใช้งานแทน ไม่ใช่ 500', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue(user());
    prisma.user.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('fk', { code: 'P2003', clientVersion: 'x' }),
    );
    await expect(service.remove('u2', 'a1')).rejects.toThrow('ปิดใช้งาน');
  });
});

describe('UsersService — ออกจากระบบทุกเครื่อง (บัญชีกลางตามตำแหน่ง)', () => {
  it('ตั้งรหัสใหม่ + logoutEverywhere → tokenVersion +1 และตัด socket ของบัญชีนั้น', async () => {
    const { prisma, events, service } = setup();
    prisma.user.findUnique.mockResolvedValue(user({ id: 'k1', role: Role.KITCHEN }));
    await service.update('k1', { password: 'NewKitchen1', logoutEverywhere: true }, 'a1');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tokenVersion: { increment: 1 } }),
      }),
    );
    expect(events.disconnectUser).toHaveBeenCalledWith('k1');
  });

  it('ตั้งรหัสใหม่อย่างเดียว ไม่เตะเครื่องที่ใช้อยู่', async () => {
    const { prisma, events, service } = setup();
    prisma.user.findUnique.mockResolvedValue(user({ id: 'k1', role: Role.KITCHEN }));
    await service.update('k1', { password: 'NewKitchen1' }, 'a1');
    expect(prisma.user.update.mock.calls[0][0].data.tokenVersion).toBeUndefined();
    expect(events.disconnectUser).not.toHaveBeenCalled();
  });

  it('สั่งกับบัญชีตัวเองไม่ได้ (จะหลุดจากหน้าจัดการทันที)', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue(user({ id: 'a1', role: Role.ADMIN }));
    await expect(service.update('a1', { logoutEverywhere: true }, 'a1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
