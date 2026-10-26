import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { from, Observable, of } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { AUDIT_KEY, AuditContext, AuditOptions } from './audit.decorator';
import { AuditDevice, AuditService, sanitizeDetails } from './audit.service';

/** header ยาวผิดปกติ = ตัดทิ้ง กันใครยัดข้อความยาว ๆ ลง DB */
const MAX_HEADER = 100;

function header(req: Request, name: string, decode = false): string | null {
  const raw = req.headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  let text = value;
  if (decode) {
    // ชื่อเครื่องเป็นภาษาไทยได้ แต่ HTTP header รับแค่ ASCII — frontend จึง encodeURIComponent มา
    try {
      text = decodeURIComponent(value);
    } catch {
      // encode มาผิดรูป — เก็บตามที่ได้รับ
    }
  }
  text = text.trim();
  return text ? text.slice(0, MAX_HEADER) : null;
}

export function readDevice(req: Request): AuditDevice {
  return {
    deviceName: header(req, 'x-device-name', true),
    deviceId: header(req, 'x-device-id'),
    ip: req.ip ?? null,
    userAgent: (req.headers['user-agent'] ?? '').slice(0, 300) || null,
  };
}

/**
 * ทำงานเฉพาะ endpoint ที่ติด @Audit(...) — ทำรายการสำเร็จแล้วค่อยบันทึก
 * ลงทะเบียนเป็น global interceptor ใน AuditModule
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.get<AuditOptions | undefined>(AUDIT_KEY, context.getHandler());
    if (!options || context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = req.user;
    if (!user) return next.handle();

    const ctx: AuditContext = {
      params: (req.params ?? {}) as Record<string, string>,
      body: (req.body ?? {}) as Record<string, unknown>,
      user,
    };

    // โหลดค่าเก่าพลาด (เช่น id ไม่มีจริง) ไม่ใช่เรื่องของประวัติ — ปล่อยให้ handler ตอบ 404 เอง
    const before$ = options.before
      ? from(options.before(this.prisma, ctx)).pipe(
          catchError((error) => {
            this.logger.warn(`โหลดข้อมูลก่อนทำรายการไม่สำเร็จ: ${String(error)}`);
            return of(undefined);
          }),
        )
      : of(undefined);

    return before$.pipe(
      switchMap((before) => {
        ctx.before = before;
        return next.handle().pipe(
          tap((result) => {
            void this.write(options, { ...ctx, result }, readDevice(req));
          }),
        );
      }),
    );
  }

  private async write(options: AuditOptions, ctx: AuditContext, device: AuditDevice) {
    try {
      const action = typeof options.action === 'function' ? options.action(ctx) : options.action;
      if (!action) return;
      await this.audit.record({
        action,
        targetId: options.targetId ? options.targetId(ctx) : ctx.params.id,
        details: options.details ? options.details(ctx) : sanitizeDetails(ctx.body),
        user: ctx.user,
        device,
      });
    } catch (error) {
      this.logger.error('สร้างประวัติไม่สำเร็จ', error as Error);
    }
  }
}
