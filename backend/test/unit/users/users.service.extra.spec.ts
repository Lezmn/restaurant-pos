import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../../../src/users/users.service';

/** ส่วนของ UsersService ที่ users.service.spec.ts ยังไม่ครอบ */
const prismaError = (code: string) => new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: 't' });

const row = (over: Record<string, unknown> = {}) => ({
  id: 'u2',
  name: 'ครัว',
  email: 'kitchen@x',
  role: Role.KITCHEN,
  isActive: true,
  ...over,
});

function setup() {
  const prisma: any = {
    user: {
      create: jest.fn(async ({ data }: any) => ({ id: 'new', ...data })),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(row()),
      update: jest.fn(async ({ data }: any) => ({ ...row(), ...data })),
      delete: jest.fn(),
      count: jest.fn().mockResolvedValue(1),
    },
  };
  const events: any = { disconnectUser: jest.fn() };
  return { prisma, events, service: new UsersService(prisma, events) };
}

describe('UsersService.create', () => {
  it('hash รหัส ไม่เก็บตัวจริง และไม่คืน password กลับ', async () => {
    const { prisma, service } = setup();
    await service.create({ name: 'ครัว', email: 'k@x', password: 'secret123', role: Role.KITCHEN });
    const args = prisma.user.create.mock.calls[0][0];
    expect(args.data.password).not.toBe('secret123');
    expect(await bcrypt.compare('secret123', args.data.password)).toBe(true);
    expect(args.select.password).toBeUndefined();
  });

  it.each([
    [Role.ADMIN, true],
    [Role.STAFF, false],
    [Role.KITCHEN, false],
  ])('%s → mustChangePassword = %s (บัญชีกลางเปลี่ยนรหัสเองไม่ได้)', async (role, expected) => {
    const { prisma, service } = setup();
    await service.create({ name: 'x', email: 'x@x', password: '12345678', role });
    expect(prisma.user.create.mock.calls[0][0].data.mustChangePassword).toBe(expected);
  });

  it('อีเมลซ้ำ → 400 / error อื่นโยนต่อ', async () => {
    const { prisma, service } = setup();
    prisma.user.create.mockRejectedValueOnce(prismaError('P2002'));
    await expect(service.create({ name: 'x', email: 'x@x', password: '12345678', role: Role.STAFF })).rejects.toThrow(
      'อีเมลนี้ถูกใช้แล้ว',
    );
    const other = new Error('db');
    prisma.user.create.mockRejectedValueOnce(other);
    await expect(
      service.create({ name: 'x', email: 'x@x', password: '12345678', role: Role.STAFF }),
    ).rejects.toBe(other);
  });
});

describe('UsersService.findAll / findOne', () => {
  it('กรอง role และเรียงคนที่ใช้งานอยู่ก่อน', async () => {
    const { prisma, service } = setup();
    await service.findAll(Role.STAFF);
    expect(prisma.user.findMany.mock.calls[0][0]).toMatchObject({
      where: { role: Role.STAFF },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  });

  it('ไม่พบ → 404', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.findOne('x')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('UsersService.update', () => {
  it('ออกจากระบบทุกเครื่อง → เพิ่ม tokenVersion และตัด socket', async () => {
    const { prisma, events, service } = setup();
    await service.update('u2', { logoutEverywhere: true }, 'admin-1');
    expect(prisma.user.update.mock.calls[0][0].data.tokenVersion).toEqual({ increment: 1 });
    expect(events.disconnectUser).toHaveBeenCalledWith('u2');
  });

  it('ตั้งรหัสใหม่ให้บัญชีกลาง → ไม่บังคับเปลี่ยนรหัส / ให้ ADMIN อื่น → บังคับเปลี่ยน', async () => {
    const { prisma, service } = setup();
    await service.update('u2', { password: 'newpass12' }, 'admin-1');
    expect(prisma.user.update.mock.calls[0][0].data.mustChangePassword).toBeUndefined();

    prisma.user.findUnique.mockResolvedValue(row({ role: Role.ADMIN }));
    await service.update('u2', { password: 'newpass12' }, 'admin-1');
    expect(prisma.user.update.mock.calls[1][0].data.mustChangePassword).toBe(true);
  });

  // ทดสอบ: ADMIN ตั้งรหัสใหม่ให้บัญชีอื่น → เก็บเป็น bcrypt hash ไม่ใช่ตัวจริง และ response ไม่มีรหัส
  // วิธี: update ด้วย password → เช็กว่าค่าที่บันทึกไม่ใช่ตัวจริง ตรวจด้วย bcrypt ผ่าน และ select ไม่ขอ password กลับ
  it('ตั้งรหัสใหม่ให้บัญชีอื่น → hash ไม่เก็บตัวจริง และไม่คืนรหัสกลับ', async () => {
    const { prisma, service } = setup();
    await service.update('u2', { password: 'newpass12' }, 'admin-1');
    const args = prisma.user.update.mock.calls[0][0];
    expect(args.data.password).not.toBe('newpass12');
    expect(await bcrypt.compare('newpass12', args.data.password)).toBe(true);
    expect(args.select.password).toBeUndefined();
  });

  // ทดสอบ: แก้ชื่อ/สิทธิ์โดยไม่ส่งรหัส → ไม่แตะรหัสเดิม และไม่บังคับเปลี่ยนรหัส
  // วิธี: update แค่ name ของ ADMIN → data ต้องไม่มี password และ mustChangePassword
  it('แก้ชื่ออย่างเดียว → ไม่แตะรหัสเดิม ไม่บังคับเปลี่ยนรหัส', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue(row({ role: Role.ADMIN }));
    await service.update('u2', { name: 'ผู้จัดการ' }, 'admin-1');
    const { data } = prisma.user.update.mock.calls[0][0];
    expect(data.password).toBeUndefined();
    expect(data.mustChangePassword).toBeUndefined();
  });

  it('เลื่อน STAFF เป็น ADMIN พร้อมตั้งรหัส → บังคับเปลี่ยนรหัส', async () => {
    const { prisma, service } = setup();
    await service.update('u2', { role: Role.ADMIN, password: 'newpass12' }, 'admin-1');
    expect(prisma.user.update.mock.calls[0][0].data.mustChangePassword).toBe(true);
  });

  it.each([
    [{ role: Role.STAFF }, /เปลี่ยนสิทธิ์/],
    [{ isActive: false }, /ปิดใช้งานบัญชีตัวเอง/],
    [{ logoutEverywhere: true }, /ออกจากระบบทุกเครื่อง/],
  ])('แก้บัญชีตัวเอง %j → 400', async (dto, msg) => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue(row({ id: 'me', role: Role.ADMIN }));
    await expect(service.update('me', dto as any, 'me')).rejects.toThrow(msg);
  });

  it('แก้ชื่อตัวเองได้', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue(row({ id: 'me', role: Role.ADMIN }));
    await service.update('me', { name: 'ใหม่', role: Role.ADMIN }, 'me');
    expect(prisma.user.update).toHaveBeenCalled();
  });

  it('เปลี่ยนอีเมลชนคนอื่น → 400', async () => {
    const { prisma, service } = setup();
    prisma.user.update.mockRejectedValue(prismaError('P2002'));
    await expect(service.update('u2', { email: 'dup@x' }, 'admin-1')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('UsersService.remove', () => {
  it('ลบตัวเอง → 400', async () => {
    const { service } = setup();
    await expect(service.remove('me', 'me')).rejects.toThrow('ลบบัญชีของตัวเองไม่ได้');
  });

  it('ลบได้ → ตัด socket และคืนข้อมูลผู้ใช้ที่ลบ (ไม่ใช่ body ว่าง)', async () => {
    const { events, service } = setup();
    await expect(service.remove('u2', 'admin-1')).resolves.toMatchObject({ id: 'u2' });
    expect(events.disconnectUser).toHaveBeenCalledWith('u2');
  });

  it('มีประวัติปิดยอด/เบิกเงิน (FK) → 400 ให้ปิดใช้งานแทน', async () => {
    const { prisma, events, service } = setup();
    prisma.user.delete.mockRejectedValue(prismaError('P2003'));
    await expect(service.remove('u2', 'admin-1')).rejects.toThrow(/ปิดใช้งาน/);
    expect(events.disconnectUser).not.toHaveBeenCalled();
  });

  it('error อื่น → โยนต่อ', async () => {
    const { prisma, service } = setup();
    const err = new Error('db');
    prisma.user.delete.mockRejectedValue(err);
    await expect(service.remove('u2', 'admin-1')).rejects.toBe(err);
  });

  it('ADMIN คนสุดท้าย → ลบไม่ได้', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue(row({ role: Role.ADMIN }));
    prisma.user.count.mockResolvedValue(0);
    await expect(service.remove('u2', 'admin-1')).rejects.toThrow(/ADMIN ที่ใช้งานได้อย่างน้อย 1 คน/);
  });
});
