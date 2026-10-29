import { NotFoundException } from '@nestjs/common';
import { PaymentStatus, Prisma, Role, SlipStatus } from '@prisma/client';
import { PaymentSlipService } from '../../../src/payments/payment-slip.service';

/** ส่วนของ PaymentSlipService ที่ payments.service.spec.ts ยังไม่ครอบ: timer ตรวจซ้ำ, ใช้สลิปเดิมหลังยกเลิกบิล */
const D = (v: number) => new Prisma.Decimal(v);
const admin = { id: 'a', email: 'a@x', name: 'Admin', role: Role.ADMIN };

function build(env: Record<string, string> = {}) {
  const prisma: any = {
    payment: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(async ({ data }: any) => ({ id: 'p1', ...data })),
    },
  };
  const slipOk: any = { check: jest.fn() };
  const events: any = { emitToStaff: jest.fn() };
  const service = new PaymentSlipService(prisma, slipOk, events, { get: (k: string) => env[k] } as any);
  return { prisma, slipOk, events, service };
}

describe('PaymentSlipService — ตรวจซ้ำอัตโนมัติ', () => {
  afterEach(() => jest.useRealTimers());

  it('ค่าเริ่มต้น: ตรวจทุก 2 นาที สูงสุด 15 ครั้ง', () => {
    const { service } = build();
    expect((service as any).intervalMs).toBe(120_000);
    expect((service as any).maxAttempts).toBe(15);
  });

  it('เริ่ม timer ตอน boot และหยุดตอนปิดแอป', () => {
    jest.useFakeTimers();
    const { service } = build({ SLIP_RECHECK_INTERVAL_MS: '1000' });
    const spy = jest.spyOn(service, 'recheckPending').mockResolvedValue(undefined as any);
    service.onModuleInit();
    jest.advanceTimersByTime(2500);
    expect(spy).toHaveBeenCalledTimes(2);
    service.onModuleDestroy();
    jest.advanceTimersByTime(5000);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('ตั้ง 0 = ปิดการตรวจซ้ำอัตโนมัติ', () => {
    const { service } = build({ SLIP_RECHECK_INTERVAL_MS: '0' });
    service.onModuleInit();
    expect((service as any).timer).toBeFalsy();
    expect(() => service.onModuleDestroy()).not.toThrow();
  });
});

describe('PaymentSlipService — สลิปของบิลที่ยกเลิกไป', () => {
  const base = { slipPayload: 'QR', charged: D(150), sessionOpenedAt: new Date(Date.now() - 3_600_000), user: admin };

  it('บันทึกใหม่ด้วยสลิปเดิม → ใช้ผลตรวจเดิม ไม่ยิง SlipOK ซ้ำ (กัน 1012 สลิปซ้ำ) และใช้ transRef เดิม', async () => {
    const { prisma, slipOk, service } = build({ SLIP_RECHECK_INTERVAL_MS: '0' });
    prisma.payment.findFirst
      .mockResolvedValueOnce({
        id: 'old',
        slipAmount: D(150),
        slipTransAt: new Date(),
        slipSendingBank: '004',
        slipMessage: 'ยกเลิกบิล — ปล่อยสลิป transRef=ABC123',
      })
      .mockResolvedValue(null); // ไม่มีบิลอื่นใช้ transRef นี้อยู่
    const fields = await service.checkForNewPayment(base);
    expect(slipOk.check).not.toHaveBeenCalled();
    expect(fields).toMatchObject({
      slipStatus: SlipStatus.VERIFIED,
      slipTransRef: 'ABC123',
      slipSendingBank: '004',
      slipMessage: 'ใช้ผลตรวจจากบิลที่ยกเลิกไป',
    });
    expect(prisma.payment.findFirst.mock.calls[0][0].where).toEqual({
      slipPayload: 'QR',
      status: PaymentStatus.VOIDED,
      slipStatus: SlipStatus.VERIFIED,
    });
  });

  it('ข้อความเดิมไม่มี transRef → ใช้รหัส REUSED-<id>', async () => {
    const { prisma, service } = build({ SLIP_RECHECK_INTERVAL_MS: '0' });
    prisma.payment.findFirst
      .mockResolvedValueOnce({ id: 'old', slipAmount: D(150), slipTransAt: new Date(), slipSendingBank: null, slipMessage: null })
      .mockResolvedValue(null);
    await expect(service.checkForNewPayment(base)).resolves.toMatchObject({ slipTransRef: 'REUSED-old' });
  });

  it('ยอดบิลใหม่ไม่ตรงกับยอดในสลิปเดิม → 400', async () => {
    const { prisma, service } = build({ SLIP_RECHECK_INTERVAL_MS: '0' });
    prisma.payment.findFirst.mockResolvedValueOnce({
      id: 'old',
      slipAmount: D(100),
      slipTransAt: new Date(),
      slipMessage: 'transRef=X',
    });
    await expect(service.checkForNewPayment(base)).rejects.toThrow(/ตรวจสลิปไม่ผ่าน/);
  });

  it('releaseOnVoid: ไม่มีสลิป → ไม่แตะ / มีสลิป → ปล่อย transRef และจดไว้ในข้อความ', () => {
    const { service } = build({ SLIP_RECHECK_INTERVAL_MS: '0' });
    expect(service.releaseOnVoid(null)).toEqual({});
    expect(service.releaseOnVoid('T9')).toEqual({
      slipTransRef: null,
      slipMessage: 'ยกเลิกบิล — ปล่อยสลิป transRef=T9',
    });
  });

  it('confirmManually: ไม่พบบิล → 404 / บิลถูกยกเลิก → 409', async () => {
    const { prisma, service } = build({ SLIP_RECHECK_INTERVAL_MS: '0' });
    prisma.payment.findUnique.mockResolvedValueOnce(null);
    await expect(service.confirmManually('x', 'r', admin)).rejects.toBeInstanceOf(NotFoundException);
    prisma.payment.findUnique.mockResolvedValueOnce({ status: PaymentStatus.VOIDED, slipStatus: SlipStatus.PENDING });
    await expect(service.confirmManually('x', 'r', admin)).rejects.toThrow(/ยกเลิกไปแล้ว/);
  });

  it('confirmManually: บิลตรวจผ่านแล้ว/ยืนยันไปแล้ว → 409 ไม่แก้บิล', async () => {
    const { prisma, service } = build({ SLIP_RECHECK_INTERVAL_MS: '0' });
    for (const slipStatus of [SlipStatus.VERIFIED, SlipStatus.MANUAL]) {
      prisma.payment.findUnique.mockResolvedValueOnce({ status: PaymentStatus.COMPLETED, slipStatus });
      await expect(service.confirmManually('x', 'r', admin)).rejects.toThrow(/เฉพาะบิลที่รอสลิป รอตรวจ/);
    }
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });

  it('confirmManually: บิลตรวจไม่ผ่าน → MANUAL พร้อมเหตุผลและชื่อผู้ยืนยัน แล้วแจ้งพนักงาน', async () => {
    const { prisma, events, service } = build({ SLIP_RECHECK_INTERVAL_MS: '0' });
    prisma.payment.findUnique.mockResolvedValueOnce({ status: PaymentStatus.COMPLETED, slipStatus: SlipStatus.FAILED });
    const updated: any = await service.confirmManually('p1', 'เช็กยอดในแอปธนาคารแล้ว', admin);
    expect(prisma.payment.update.mock.calls[0][0].where).toEqual({ id: 'p1' });
    expect(updated).toMatchObject({
      slipStatus: SlipStatus.MANUAL,
      slipOverrideReason: 'เช็กยอดในแอปธนาคารแล้ว',
      slipOverrideByName: 'Admin',
    });
    expect(updated.slipCheckedAt).toBeInstanceOf(Date);
    expect(events.emitToStaff).toHaveBeenCalled();
  });

  it('recheck: บันทึกผลแล้ว DB error อื่นที่ไม่ใช่ P2002/P2025 → โยนต่อ ไม่แจ้งพนักงาน', async () => {
    const { prisma, slipOk, events, service } = build({ SLIP_RECHECK_INTERVAL_MS: '0' });
    prisma.payment.findUnique.mockResolvedValueOnce({
      id: 'p1',
      status: PaymentStatus.COMPLETED,
      slipStatus: SlipStatus.PENDING,
      slipPayload: 'payload',
      slipAttempts: 0,
      amount: D(100),
      tableSession: { openedAt: new Date() },
    });
    slipOk.check.mockResolvedValueOnce({ kind: 'unavailable', code: null, message: 'ล่ม' });
    const boom = new Error('connection lost');
    prisma.payment.update.mockRejectedValueOnce(boom);
    await expect(service.recheck('p1')).rejects.toBe(boom);
    expect(events.emitToStaff).not.toHaveBeenCalled();
  });
});
