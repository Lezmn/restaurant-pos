import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALLOW_DURING_PASSWORD_CHANGE_KEY } from '../decorators/allow-password-change.decorator';

/**
 * บัญชีที่ยังใช้รหัสชั่วคราว (mustChangePassword) ใช้ได้แค่ "ดูตัวเอง" กับ "ตั้งรหัสใหม่"
 * กันไว้ที่ backend ด้วย ไม่ใช่แค่ซ่อนหน้าจอ — ใครได้รหัสชั่วคราวไปก็ยิง API ตรงไม่ได้
 */
@Injectable()
export class PasswordChangeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const request = context.switchToHttp().getRequest<{ user?: { mustChangePassword?: boolean } }>();
    if (!request.user?.mustChangePassword) return true;

    const allowed = this.reflector.getAllAndOverride<boolean>(ALLOW_DURING_PASSWORD_CHANGE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowed) return true;
    throw new ForbiddenException({
      statusCode: 403,
      code: 'PASSWORD_CHANGE_REQUIRED',
      message: 'ต้องตั้งรหัสผ่านใหม่ก่อนใช้งาน',
    });
  }
}
