import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { decimalToNumber } from '../common/interceptors/decimal.interceptor';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction } from './audit.decorator';
import { FindAuditLogsQueryDto } from './dto/find-audit-logs-query.dto';

export type AuditDevice = {
  deviceName: string | null;
  deviceId: string | null;
  ip: string | null;
  userAgent: string | null;
};

/** field ที่ห้ามเก็บลงประวัติ — รหัสผ่านเก็บแค่ว่า "มีการเปลี่ยน" */
const SECRET_KEYS = /password|token|slipPayload/i;

export function sanitizeDetails(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (/password/i.test(key)) {
      if (item) out.passwordChanged = true;
      continue;
    }
    if (SECRET_KEYS.test(key)) continue;
    out[key] = item;
  }
  return Object.keys(out).length ? out : null;
}

const MAX_PAGE = 200;

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * บันทึกประวัติ — พลาดแล้วแค่ log ไว้ ไม่โยน error
   * รายการ (เช่น รับเงิน) ทำสำเร็จไปแล้ว ถ้าโยนตรงนี้แคชเชียร์จะเห็นว่าล้มเหลวแล้วกดซ้ำ
   */
  async record(input: {
    action: AuditAction;
    targetId?: string | null;
    details?: Record<string, unknown> | null;
    user: AuthenticatedUser;
    device: AuditDevice;
  }) {
    try {
      const details = decimalToNumber(input.details ?? null);
      await this.prisma.auditLog.create({
        data: {
          action: input.action,
          targetId: input.targetId ?? null,
          details: (details ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          userId: input.user.id,
          userName: input.user.name,
          userRole: input.user.role,
          ...input.device,
        },
      });
    } catch (error) {
      this.logger.error(`บันทึกประวัติ ${input.action} ไม่สำเร็จ`, error as Error);
    }
  }

  /** ล่าสุดก่อน — ส่ง before (createdAt ของแถวสุดท้าย) เพื่อโหลดหน้าถัดไป */
  async findAll(query: FindAuditLogsQueryDto) {
    const take = Math.min(query.limit ?? 100, MAX_PAGE);
    const createdAt: Prisma.DateTimeFilter = {};
    if (query.from) createdAt.gte = new Date(query.from);
    if (query.to) createdAt.lt = new Date(query.to);
    if (query.before) createdAt.lt = new Date(query.before);

    const rows = await this.prisma.auditLog.findMany({
      where: {
        ...(Object.keys(createdAt).length ? { createdAt } : {}),
        ...(query.action ? { action: query.action } : {}),
        ...(query.deviceId ? { deviceId: query.deviceId } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
    });
    return {
      items: rows.slice(0, take),
      hasMore: rows.length > take,
    };
  }

  /** เครื่องทั้งหมดที่เคยมีประวัติ — ไว้ทำตัวกรอง "เครื่องไหน" */
  async findDevices() {
    const rows = await this.prisma.auditLog.groupBy({
      by: ['deviceId', 'deviceName'],
      where: { deviceId: { not: null } },
      _max: { createdAt: true },
    });
    return rows
      .map((row) => ({
        deviceId: row.deviceId!,
        deviceName: row.deviceName,
        lastSeenAt: row._max.createdAt,
      }))
      .sort((a, b) => Number(b.lastSeenAt) - Number(a.lastSeenAt));
  }
}
