import { UnauthorizedException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtStrategy } from '../../../src/auth/jwt.strategy';

const config = (secret?: string) => ({ get: () => secret }) as any;

function setup(dbUser: Record<string, unknown> | null) {
  const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue(dbUser) } };
  return { prisma, strategy: new JwtStrategy(config('secret'), prisma) };
}

const active = {
  id: 'u1',
  email: 'k@x',
  name: 'ครัว',
  role: Role.KITCHEN,
  isActive: true,
  tokenVersion: 3,
  mustChangePassword: false,
};

describe('JwtStrategy', () => {
  it('ไม่ตั้ง JWT_SECRET → ไม่ยอม boot', () => {
    expect(() => new JwtStrategy(config(undefined), {} as any)).toThrow('JWT_SECRET is required');
  });

  it('บัญชีใช้งานได้และรุ่น token ตรง → คืน user โดยไม่มี isActive/tokenVersion/password', async () => {
    const { strategy, prisma } = setup(active);
    await expect(strategy.validate({ sub: 'u1', tv: 3 })).resolves.toEqual({
      id: 'u1',
      email: 'k@x',
      name: 'ครัว',
      role: Role.KITCHEN,
      mustChangePassword: false,
    });
    expect(prisma.user.findUnique.mock.calls[0][0].select.password).toBeUndefined();
  });

  it('token ไม่มี tv = รุ่น 0', async () => {
    const { strategy } = setup({ ...active, tokenVersion: 0 });
    await expect(strategy.validate({ sub: 'u1' })).resolves.toMatchObject({ id: 'u1' });
  });

  it.each([
    ['ไม่พบบัญชี', null, 3],
    ['บัญชีถูกปิด', { ...active, isActive: false }, 3],
    ['ถูกออกจากระบบทุกเครื่อง (รุ่น token เก่า)', active, 2],
  ])('%s → 401 ทันทีแม้ token ยังไม่หมดอายุ', async (_label, dbUser, tv) => {
    const { strategy } = setup(dbUser);
    await expect(strategy.validate({ sub: 'u1', tv })).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
