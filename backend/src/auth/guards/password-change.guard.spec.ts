import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PasswordChangeGuard } from './password-change.guard';

const ctx = (user: unknown) =>
  ({
    getType: () => 'http',
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as any;

describe('PasswordChangeGuard', () => {
  it('บัญชีปกติผ่านได้ทุก route', () => {
    const guard = new PasswordChangeGuard({ getAllAndOverride: () => false } as unknown as Reflector);
    expect(guard.canActivate(ctx({ mustChangePassword: false }))).toBe(true);
    expect(guard.canActivate(ctx(undefined))).toBe(true);
  });

  it('ยังใช้รหัสชั่วคราว → route ทั่วไป 403 PASSWORD_CHANGE_REQUIRED', () => {
    const guard = new PasswordChangeGuard({ getAllAndOverride: () => false } as unknown as Reflector);
    try {
      guard.canActivate(ctx({ mustChangePassword: true }));
      fail('ควรโยน 403');
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenException);
      expect((e as ForbiddenException).getResponse()).toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED' });
    }
  });

  it('ยังใช้รหัสชั่วคราว → /auth/me และ /auth/password (AllowDuringPasswordChange) ผ่านได้', () => {
    const guard = new PasswordChangeGuard({ getAllAndOverride: () => true } as unknown as Reflector);
    expect(guard.canActivate(ctx({ mustChangePassword: true }))).toBe(true);
  });
});
