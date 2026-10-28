import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { lastValueFrom, of, throwError } from 'rxjs';
import { AUDIT_KEY, AuditOptions } from '../../../src/audit/audit.decorator';
import { AuditInterceptor, readDevice } from '../../../src/audit/audit.interceptor';
import { sanitizeDetails } from '../../../src/audit/audit.service';

const user = { id: 'u1', email: 'front@shop', name: 'หน้าร้าน', role: Role.STAFF };

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    user,
    params: { id: 'pay-1' },
    body: { reason: 'กดผิดโต๊ะ' },
    ip: '10.0.0.5',
    headers: {
      'x-device-name': encodeURIComponent('แท็บเล็ตแคชเชียร์'),
      'x-device-id': 'dev-abc',
      'user-agent': 'Mozilla/5.0 (Linux; Android 13)',
    },
    ...overrides,
  };
}

function setup(options: AuditOptions | undefined, request = makeRequest()) {
  const reflector = { get: jest.fn((key: string) => (key === AUDIT_KEY ? options : undefined)) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const prisma = {};
  const interceptor = new AuditInterceptor(
    reflector as unknown as Reflector,
    audit as never,
    prisma as never,
  );
  const context = {
    getType: () => 'http',
    getHandler: () => () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { interceptor, audit, context, prisma };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('AuditInterceptor', () => {
  it('ไม่มี @Audit = ไม่บันทึก', async () => {
    const { interceptor, audit, context } = setup(undefined);
    await lastValueFrom(interceptor.intercept(context, { handle: () => of('ok') } as CallHandler));
    await flush();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('ทำสำเร็จ → บันทึกบัญชี + ชื่อเครื่อง (ถอด encode ภาษาไทย) + IP + body', async () => {
    const { interceptor, audit, context } = setup({ action: 'PAYMENT_VOID' });
    await lastValueFrom(interceptor.intercept(context, { handle: () => of({ id: 'pay-1' }) } as CallHandler));
    await flush();
    expect(audit.record).toHaveBeenCalledWith({
      action: 'PAYMENT_VOID',
      targetId: 'pay-1',
      details: { reason: 'กดผิดโต๊ะ' },
      user,
      device: {
        deviceName: 'แท็บเล็ตแคชเชียร์',
        deviceId: 'dev-abc',
        ip: '10.0.0.5',
        userAgent: 'Mozilla/5.0 (Linux; Android 13)',
      },
    });
  });

  it('ทำไม่สำเร็จ (handler โยน error) → ไม่บันทึก', async () => {
    const { interceptor, audit, context } = setup({ action: 'PAYMENT_VOID' });
    await expect(
      lastValueFrom(
        interceptor.intercept(context, { handle: () => throwError(() => new Error('409')) } as CallHandler),
      ),
    ).rejects.toThrow('409');
    await flush();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('action คืน null = ข้ามครั้งนี้ (เช่น รับเงินไม่มีส่วนลด)', async () => {
    const { interceptor, audit, context } = setup({
      action: ({ body }) => (body.discountPercent ? 'PAYMENT_DISCOUNT' : null),
    }, makeRequest({ body: { method: 'CASH' } }));
    await lastValueFrom(interceptor.intercept(context, { handle: () => of({}) } as CallHandler));
    await flush();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('before โหลดค่าเก่าก่อนทำรายการ แล้วส่งให้ details', async () => {
    const order: string[] = [];
    const { interceptor, audit, context } = setup({
      action: 'ORDER_ITEM_REMOVE',
      before: async () => {
        order.push('before');
        return { name: 'ผัดกะเพรา' };
      },
      details: ({ before }) => ({ removed: before }),
    });
    await lastValueFrom(
      interceptor.intercept(context, {
        handle: () => {
          order.push('handler');
          return of({});
        },
      } as CallHandler),
    );
    await flush();
    expect(order).toEqual(['before', 'handler']);
    expect(audit.record.mock.calls[0][0].details).toEqual({ removed: { name: 'ผัดกะเพรา' } });
  });

  it('before พัง → ทำรายการต่อได้ และยังบันทึก', async () => {
    const { interceptor, audit, context } = setup({
      action: 'MENU_DELETE',
      before: () => Promise.reject(new Error('db down')),
    });
    const result = await lastValueFrom(interceptor.intercept(context, { handle: () => of('done') } as CallHandler));
    await flush();
    expect(result).toBe('done');
    expect(audit.record).toHaveBeenCalled();
  });
});

describe('readDevice', () => {
  it('ไม่มี header = null, header ยาวเกินถูกตัด', () => {
    const device = readDevice({
      headers: { 'x-device-id': 'x'.repeat(500) },
      ip: undefined,
    } as never);
    expect(device.deviceName).toBeNull();
    expect(device.deviceId).toHaveLength(100);
    expect(device.ip).toBeNull();
  });
});

describe('sanitizeDetails', () => {
  it('ไม่เก็บรหัสผ่าน/ข้อความสลิป — เก็บแค่ว่ามีการเปลี่ยนรหัส', () => {
    expect(
      sanitizeDetails({ name: 'ครัว', password: 'secret123', slipPayload: '0041...', isActive: false }),
    ).toEqual({ name: 'ครัว', passwordChanged: true, isActive: false });
  });
});
