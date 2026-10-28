import { Role } from '@prisma/client';
import { PaymentsController } from '../../../src/payments/payments.controller';
import { auditOf, autoMock, user } from '../helpers/controller';

const staff = user(Role.STAFF) as any;
const admin = user(Role.ADMIN) as any;

function setup() {
  const payments = autoMock();
  const slip = autoMock();
  return { payments, slip, controller: new PaymentsController(payments as any, slip as any) };
}

describe('PaymentsController', () => {
  it('ส่งต่อไปที่ PaymentsService พร้อม user ที่รับเงิน', async () => {
    const { payments, controller } = setup();
    const dto = { tableSessionId: 's1', method: 'CASH' } as any;
    expect(await controller.create(dto, { user: staff })).toEqual({ from: 'create' });
    expect(payments.create).toHaveBeenCalledWith(dto, staff);

    await controller.voidPayment('p1', { reason: 'ผิดโต๊ะ' } as any, { user: staff });
    expect(payments.voidPayment).toHaveBeenCalledWith('p1', { reason: 'ผิดโต๊ะ' }, staff);

    await controller.findAll({ from: 'x' } as any);
    expect(payments.findAll).toHaveBeenCalledWith({ from: 'x' });
    await controller.findOne('p1');
    expect(payments.findOne).toHaveBeenCalledWith('p1');
  });

  it('สลิป: ตรวจซ้ำ / ADMIN ยืนยันเองพร้อมเหตุผล ไปที่ PaymentSlipService', async () => {
    const { slip, controller } = setup();
    await controller.recheckSlip('p1');
    expect(slip.recheck).toHaveBeenCalledWith('p1');
    await controller.confirmSlip('p1', { reason: 'เห็นเงินเข้าแอปธนาคาร' } as any, { user: admin });
    expect(slip.confirmManually).toHaveBeenCalledWith('p1', 'เห็นเงินเข้าแอปธนาคาร', admin);
  });

  describe('ประวัติการรับเงิน (@Audit)', () => {
    const audit = auditOf(PaymentsController, 'create')!;
    const action = audit.action as (ctx: any) => string | null;

    it.each([
      [{ discountPercent: 10 }, 'PAYMENT_DISCOUNT'],
      [{ discountPercent: 10, slipOverrideReason: 'x' }, 'PAYMENT_DISCOUNT'],
      [{ slipOverrideReason: 'สลิปไม่ขึ้น' }, 'PAYMENT_SLIP_OVERRIDE'],
      [{ discountPercent: 0 }, null],
      [{}, null],
    ])('body %j → %s', (body, expected) => {
      expect(action({ body })).toBe(expected);
    });

    it('details รวมเลขโต๊ะ + ตัวเลขใบเสร็จ', () => {
      const details = audit.details!({
        body: { discountPercent: 10 },
        before: { tableNumber: 4 },
        result: {
          id: 'p1',
          method: 'CASH',
          receipt: { number: 'R-0001', subtotal: 100, discount: 10, total: 90 },
        },
      } as any);
      expect(details).toEqual({
        tableNumber: 4,
        receiptNumber: 'R-0001',
        method: 'CASH',
        subtotal: 100,
        discountPercent: 10,
        discount: 10,
        total: 90,
        note: null,
        slipOverrideReason: null,
      });
      expect(audit.targetId!({ result: { id: 'p1' } } as any)).toBe('p1');
    });

    it.each(['voidPayment', 'confirmSlip'])('%s เก็บเลขใบเสร็จ/โต๊ะ/ยอด + เหตุผล', (method) => {
      const opts = auditOf(PaymentsController, method)!;
      expect(
        opts.details!({
          body: { reason: 'r' },
          before: {
            amount: 90,
            method: 'PROMPTPAY',
            receipt: { number: 'R-1' },
            tableSession: { table: { number: 3 } },
          },
        } as any),
      ).toEqual({ receiptNumber: 'R-1', tableNumber: 3, amount: 90, method: 'PROMPTPAY', reason: 'r' });
      // โหลดบิลไม่เจอ (ถูกลบไปแล้ว) ก็ยังเก็บประวัติได้
      expect(opts.details!({ body: { reason: 'r' }, before: null } as any)).toEqual({
        receiptNumber: null,
        tableNumber: null,
        amount: null,
        method: null,
        reason: 'r',
      });
    });
  });
});
