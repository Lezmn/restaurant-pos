import { SetMetadata } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';

/** รายการที่เก็บประวัติ — frontend มีชื่อภาษาไทยของแต่ละตัว (features/audit) */
export const AUDIT_ACTIONS = [
  'PAYMENT_DISCOUNT',
  'PAYMENT_SLIP_OVERRIDE',
  'PAYMENT_VOID',
  'PAYMENT_SLIP_CONFIRM',
  'ORDER_CANCEL',
  'ORDER_ITEM_REMOVE',
  'ORDER_CUSTOM_ITEM',
  'CASH_CLOSE_CREATE',
  'CASH_CLOSE_DELETE',
  'EXPENSE_DRAWER',
  'EXPENSE_CREATE',
  'EXPENSE_UPDATE',
  'EXPENSE_DELETE',
  'MENU_UPDATE',
  'MENU_DELETE',
  'USER_CREATE',
  'USER_UPDATE',
  'USER_DELETE',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditContext = {
  params: Record<string, string>;
  body: Record<string, unknown>;
  user: AuthenticatedUser;
  /** ค่าที่ `before` โหลดไว้ก่อนทำรายการ (เช่น ของที่กำลังจะถูกลบ / ค่าเก่าก่อนแก้) */
  before?: unknown;
  /** ค่าที่ handler คืนมา (มีเฉพาะตอนสร้าง details หลังทำสำเร็จ) */
  result?: unknown;
};

export type AuditOptions = {
  /** ค่าคงที่ หรือฟังก์ชันที่คืน null = ไม่ต้องเก็บประวัติครั้งนี้ */
  action: AuditAction | ((ctx: AuditContext) => AuditAction | null);
  /** โหลดข้อมูลก่อนทำรายการ — ของที่ถูกลบไปแล้วจะไม่เหลือให้อ่านตอนบันทึก */
  before?: (prisma: PrismaService, ctx: AuditContext) => Promise<unknown>;
  /** รายละเอียดที่เก็บ — ไม่ส่ง = body ของ request (ตัด field ลับออกแล้ว) */
  details?: (ctx: AuditContext) => Record<string, unknown> | null;
  /** ไม่ส่ง = params.id */
  targetId?: (ctx: AuditContext) => string | undefined;
};

export const AUDIT_KEY = 'audit';

/**
 * เก็บประวัติของ endpoint นี้หลังทำสำเร็จ (ทำไม่สำเร็จ = ไม่มีอะไรเปลี่ยน ไม่ต้องเก็บ)
 * บันทึกบัญชี + เครื่อง (header X-Device-Name / X-Device-Id) + IP + เวลา — ดู AuditInterceptor
 */
export const Audit = (
  action: AuditOptions['action'],
  options: Omit<AuditOptions, 'action'> = {},
) => SetMetadata(AUDIT_KEY, { action, ...options } satisfies AuditOptions);
