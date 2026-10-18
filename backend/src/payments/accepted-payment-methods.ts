import { PaymentMethod } from '@prisma/client';

/**
 * วิธีจ่ายที่ร้านรับจริง — enum ใน DB ยังมี CARD ค้างอยู่ (มีข้อมูลเก่า ลบออกจาก enum ไม่ได้)
 * แต่ห้ามรับเข้ามาใหม่ ไม่งั้นหน้า POS ไม่มีป้ายให้แสดง และแคชเชียร์เลือกกลับไม่ได้
 * ใช้คู่กับ @IsIn(ACCEPTED_PAYMENT_METHODS) แทน @IsEnum(PaymentMethod) ในทุก DTO ที่รับวิธีจ่าย
 */
export const ACCEPTED_PAYMENT_METHODS = [
  PaymentMethod.CASH,
  PaymentMethod.PROMPTPAY,
] as const;

export type AcceptedPaymentMethod = (typeof ACCEPTED_PAYMENT_METHODS)[number];
