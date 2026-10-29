import { BadRequestException, ConflictException } from '@nestjs/common';
import { PaymentStatus, Prisma, Role, SlipStatus } from '@prisma/client';
import { PaymentSlipService } from '../../../src/payments/payment-slip.service';

/** PromptPay ที่เคาน์เตอร์: ออกใบเสร็จพร้อม QR ก่อน (รอสลิป) แล้วแคชเชียร์แนบสลิปจากรายการบิลทีหลัง */
const D = (v: number) => new Prisma.Decimal(v);
const staff = { id: 's', email: 's@x', name: 'Staff', role: Role.STAFF };
const admin = { id: 'a', email: 'a@x', name: 'Admin', role: Role.ADMIN };

function build() {
  const prisma: any = {
    payment: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      update: jest.fn(async ({ data }: any) => ({ id: 'p1', ...data })),
    },
  };
  const slipOk: any = { check: jest.fn() };
  const events: any = { emitToStaff: jest.fn() };
  const service = new PaymentSlipService(prisma, slipOk, events, {
    get: (k: string) => (k === 'SLIP_RECHECK_INTERVAL_MS' ? '0' : undefined),
  } as any);
  return { prisma, slipOk, events, service };
}

const awaitingPayment = (overrides: Record<string, unknown> = {}) => ({
  id: 'p1',
  amount: D(150),
  status: PaymentStatus.COMPLETED,
  slipStatus: SlipStatus.AWAITING,
  tableSession: { openedAt: new Date(Date.now() - 3_600_000) },
  ...overrides,
});

const verified = (amount = 150) => ({
  kind: 'verified',
  transRef: 'TR1',
  amount,
  transAt: new Date(),
  sendingBank: '004',
  receivingBank: '014',
});

describe('PaymentSlipService — ออกใบเสร็จก่อน แนบสลิปทีหลัง', () => {
  it('slipLater ไม่มีสลิป → รอสลิป (ไม่เรียก SlipOK) STAFF ทำได้', async () => {
    const { slipOk, service } = build();
    const fields = await service.checkForNewPayment({
      slipLater: true,
      charged: D(150),
      sessionOpenedAt: new Date(),
      user: staff,
    });
    expect(fields).toEqual({ slipStatus: SlipStatus.AWAITING });
    expect(slipOk.check).not.toHaveBeenCalled();
  });

  it('ไม่มีสลิปและไม่ได้ส่ง slipLater → ยังต้องมีสลิปเหมือนเดิม', async () => {
    const { service } = build();
    await expect(
      service.checkForNewPayment({ charged: D(150), sessionOpenedAt: new Date(), user: staff }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('แนบสลิปที่ตรวจผ่าน → ตรวจผ่าน ใช้ยอดของบิล และแจ้งทุกจอ', async () => {
    const { prisma, slipOk, events, service } = build();
    prisma.payment.findUnique.mockResolvedValue(awaitingPayment());
    slipOk.check.mockResolvedValue(verified());
    const updated = await service.attachSlip('p1', 'QR', staff);
    expect(slipOk.check).toHaveBeenCalledWith('QR', 150);
    expect(updated.slipStatus).toBe(SlipStatus.VERIFIED);
    expect(prisma.payment.update.mock.calls[0][0].where).toEqual({ id: 'p1', slipStatus: SlipStatus.AWAITING });
    expect(prisma.payment.update.mock.calls[0][0].data).toMatchObject({ slipPayload: 'QR', slipTransRef: 'TR1' });
    expect(events.emitToStaff).toHaveBeenCalledWith('payment.slip-updated', { id: 'p1', slipStatus: SlipStatus.VERIFIED });
  });

  it('สลิปยอดไม่ตรง → 400 บิลยังรอสลิป (ไม่เขียนอะไร)', async () => {
    const { prisma, slipOk, service } = build();
    prisma.payment.findUnique.mockResolvedValue(awaitingPayment());
    slipOk.check.mockResolvedValue(verified(100));
    await expect(service.attachSlip('p1', 'QR', staff)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });

  it('SlipOK ล่ม → บันทึกเป็นรอตรวจ ให้ระบบตรวจซ้ำเอง', async () => {
    const { prisma, slipOk, service } = build();
    prisma.payment.findUnique.mockResolvedValue(awaitingPayment());
    slipOk.check.mockResolvedValue({ kind: 'unavailable', code: 1009, message: 'ธนาคารขัดข้อง' });
    const updated = await service.attachSlip('p1', 'QR', staff);
    expect(updated.slipStatus).toBe(SlipStatus.PENDING);
  });

  it('สลิปเดิมไม่ผ่าน → แนบใบใหม่ได้', async () => {
    const { prisma, slipOk, service } = build();
    prisma.payment.findUnique.mockResolvedValue(awaitingPayment({ slipStatus: SlipStatus.FAILED }));
    slipOk.check.mockResolvedValue(verified());
    await service.attachSlip('p1', 'QR2', staff);
    expect(prisma.payment.update.mock.calls[0][0].where).toEqual({ id: 'p1', slipStatus: SlipStatus.FAILED });
  });

  it('บิลที่ตรวจผ่านแล้ว / ยกเลิกแล้ว → แนบไม่ได้ (409)', async () => {
    const { prisma, service } = build();
    prisma.payment.findUnique.mockResolvedValueOnce(awaitingPayment({ slipStatus: SlipStatus.VERIFIED }));
    await expect(service.attachSlip('p1', 'QR', staff)).rejects.toBeInstanceOf(ConflictException);
    prisma.payment.findUnique.mockResolvedValueOnce(awaitingPayment({ status: PaymentStatus.VOIDED }));
    await expect(service.attachSlip('p1', 'QR', staff)).rejects.toBeInstanceOf(ConflictException);
  });

  it('สลิปถูกใช้กับบิลอื่นพร้อมกันพอดี (unique) → 409', async () => {
    const { prisma, slipOk, service } = build();
    prisma.payment.findUnique.mockResolvedValue(awaitingPayment());
    slipOk.check.mockResolvedValue(verified());
    prisma.payment.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );
    await expect(service.attachSlip('p1', 'QR', staff)).rejects.toThrow('สลิปนี้ถูกใช้กับบิลอื่นแล้ว');
  });

  it('ADMIN ยืนยันเองได้กับบิลที่รอสลิป', async () => {
    const { prisma, service } = build();
    prisma.payment.findUnique.mockResolvedValue(awaitingPayment());
    const updated = await service.confirmManually('p1', 'ดูยอดเข้าในแอปแล้ว', admin);
    expect(updated.slipStatus).toBe(SlipStatus.MANUAL);
  });
});
