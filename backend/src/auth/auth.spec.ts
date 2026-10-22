import { BadRequestException, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createIdentityTracker, ipTracker } from '../common/throttle-trackers';
import { AuthService } from './auth.service';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';
import { ROLES_KEY } from './decorators/roles.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

const jwt = new JwtService({ secret: 'unit-test-secret' });

describe('AuthService', () => {
  let prisma: any;
  let service: AuthService;
  let hash: string;

  beforeAll(async () => {
    hash = await bcrypt.hash('correct-password', 4);
  });

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn(), update: jest.fn() } };
    service = new AuthService(prisma, jwt);
  });

  it('login สำเร็จ: คืน JWT ที่มี sub/role และไม่คืน password', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1', name: 'A', email: 'a@x', role: Role.STAFF, password: hash, isActive: true,
    });
    const r = await service.login({ email: 'a@x', password: 'correct-password' });
    expect(r.user).toEqual({ id: 'u1', name: 'A', email: 'a@x', role: Role.STAFF });
    expect(JSON.stringify(r)).not.toContain(hash);
    const payload = jwt.verify(r.accessToken);
    expect(payload).toMatchObject({ sub: 'u1', role: Role.STAFF });
  });

  it('บัญชีที่ปิดใช้งาน → 401 แม้รหัสถูก', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1', name: 'A', email: 'a@x', role: Role.STAFF, password: hash, isActive: false,
    });
    const e = await service.login({ email: 'a@x', password: 'correct-password' }).catch((x) => x);
    expect(e).toBeInstanceOf(UnauthorizedException);
    expect(e.message).toContain('ปิดใช้งาน');
  });

  it('รหัสผิด → 401 ข้อความเดียวกับไม่พบอีเมล (ไม่บอกว่ามีอีเมลนี้)', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', password: hash });
    const wrong = await service.login({ email: 'a@x', password: 'wrong-password' }).catch((e) => e);
    prisma.user.findUnique.mockResolvedValue(null);
    const missing = await service.login({ email: 'b@x', password: 'whatever1' }).catch((e) => e);
    expect(wrong).toBeInstanceOf(UnauthorizedException);
    expect(missing).toBeInstanceOf(UnauthorizedException);
    expect(wrong.message).toBe(missing.message);
  });

  it('changePassword: รหัสเดิมผิด → 400 (ไม่ใช่ 401 ที่ทำให้หน้าเว็บเด้ง logout), รหัสใหม่ซ้ำเดิม → 400, สำเร็จ → hash ใหม่', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', password: hash });
    await expect(
      service.changePassword('u1', { currentPassword: 'nope-nope', newPassword: 'new-password-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.changePassword('u1', { currentPassword: 'correct-password', newPassword: 'correct-password' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await service.changePassword('u1', { currentPassword: 'correct-password', newPassword: 'new-password-1' });
    const saved = prisma.user.update.mock.calls[0][0].data.password;
    expect(saved).not.toBe('new-password-1');
    expect(await bcrypt.compare('new-password-1', saved)).toBe(true);
  });
});

function ctx(user?: { role: Role }): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  it('ไม่ได้ติด @Roles → ผ่านทุก role ที่ login แล้ว', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(ctx({ role: Role.KITCHEN }))).toBe(true);
  });

  it('role ตรง → ผ่าน, ไม่ตรง → ไม่ผ่าน, ไม่มี user → ไม่ผ่าน', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) =>
      key === ROLES_KEY ? [Role.ADMIN, Role.STAFF] : undefined,
    );
    expect(guard.canActivate(ctx({ role: Role.STAFF }))).toBe(true);
    expect(guard.canActivate(ctx({ role: Role.KITCHEN }))).toBe(false);
    expect(guard.canActivate(ctx(undefined))).toBe(false);
  });
});

describe('JwtAuthGuard', () => {
  it('@Public() ข้ามการตรวจ JWT', () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => key === IS_PUBLIC_KEY);
    const guard = new JwtAuthGuard(reflector);
    expect(guard.canActivate(ctx())).toBe(true);
  });
});

describe('throttle trackers', () => {
  const tracker = createIdentityTracker(jwt);

  it('JWT ถูกต้อง → นับรายคน', () => {
    const token = jwt.sign({ sub: 'u9' });
    expect(tracker({ headers: { authorization: `Bearer ${token}` }, ip: '1.1.1.1' })).toBe('user:u9');
  });

  it('JWT ปลอม → ไม่เชื่อ sub นับตาม IP แทน', () => {
    const forged = new JwtService({ secret: 'other' }).sign({ sub: 'victim' });
    expect(tracker({ headers: { authorization: `Bearer ${forged}` }, ip: '1.1.1.1' })).toBe('ip:1.1.1.1');
  });

  it('QR token จาก params/body/query → นับราย session', () => {
    expect(tracker({ headers: {}, params: { token: 'abc' } })).toBe('session:abc');
    expect(tracker({ headers: {}, body: { sessionToken: 'def' } })).toBe('session:def');
    expect(tracker({ headers: {}, query: { sessionToken: 'ghi' } })).toBe('session:ghi');
  });

  it('token ยาวผิดปกติ (>128) ไม่นับเป็น session', () => {
    expect(tracker({ headers: {}, params: { token: 'x'.repeat(200) }, ip: '2.2.2.2' })).toBe('ip:2.2.2.2');
  });

  it('ipTracker fallback', () => {
    expect(ipTracker({ socket: { remoteAddress: '3.3.3.3' } })).toBe('ip:3.3.3.3');
    expect(ipTracker({})).toBe('ip:unknown');
  });
});
