import { BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { LineSettingsController } from '../../../src/line/line-settings.controller';
import { auditOf, user } from '../helpers/controller';

const admin = { user: user(Role.ADMIN, { name: 'เจ้าของร้าน' }) as any };

function setup(saved: Record<string, unknown> = { token: 'saved-token', to: 'Usaved', tokenUnreadable: false }) {
  const settings: any = {
    summary: jest.fn().mockResolvedValue({ hasToken: true }),
    get: jest.fn().mockResolvedValue(saved),
    update: jest.fn().mockResolvedValue({ ok: 1 }),
  };
  const line: any = { shopName: 'ร้านป้าแดง', send: jest.fn().mockResolvedValue({ ok: true }) };
  return { settings, line, controller: new LineSettingsController(settings, line) };
}

describe('LineSettingsController', () => {
  it('GET คืน summary (ไม่มี token เต็ม)', async () => {
    const { settings, controller } = setup();
    await expect(controller.get()).resolves.toEqual({ hasToken: true });
    expect(settings.summary).toHaveBeenCalled();
  });

  describe('PUT', () => {
    it.each([
      ['ยังไม่เคยมี token', { token: '', to: '' }],
      ['token เดิมถอดรหัสไม่ได้', { token: '', to: 'U', tokenUnreadable: true }],
    ])('%s และไม่ส่ง token มา → 400', async (_label, saved) => {
      const { settings, controller } = setup(saved);
      await expect(controller.update({ enabled: true, to: 'U' } as any, admin)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(settings.update).not.toHaveBeenCalled();
    });

    it('มี token เดิมแล้ว → บันทึกโดยไม่ต้องส่ง token ใหม่ พร้อมชื่อคนแก้', async () => {
      const { settings, controller } = setup();
      await controller.update({ enabled: false, to: 'U2' } as any, admin);
      expect(settings.update).toHaveBeenCalledWith({ enabled: false, to: 'U2' }, 'เจ้าของร้าน');
    });

    it('ส่ง token ใหม่มา → บันทึกได้แม้ของเดิมเสีย', async () => {
      const { settings, controller } = setup({ token: '', tokenUnreadable: true });
      await controller.update({ enabled: true, to: 'U', token: 'new' } as any, admin);
      expect(settings.update).toHaveBeenCalled();
    });

    it('ประวัติไม่เก็บ token เก็บแค่ว่าเปลี่ยนหรือไม่', () => {
      const audit = auditOf(LineSettingsController, 'update')!;
      const changed = audit.details?.({ body: { enabled: true, to: 'U', token: 'secret' } } as any);
      expect(changed).toEqual({ enabled: true, to: 'U', tokenChanged: true });
      expect(audit.details?.({ body: { enabled: true, to: 'U', token: '   ' } } as any)?.tokenChanged).toBe(false);
      expect(audit.targetId?.({} as any)).toBe('line');
    });
  });

  describe('POST test', () => {
    it('ใช้ค่าที่กรอกอยู่ก่อนค่าที่บันทึก และใส่ชื่อร้าน + ผู้ทดสอบในข้อความ', async () => {
      const { line, controller } = setup();
      const res = await controller.test({ token: 'typed', to: 'Utyped' } as any, admin);
      expect(res.ok).toBe(true);
      const [token, to, text] = line.send.mock.calls[0];
      expect([token, to]).toEqual(['typed', 'Utyped']);
      expect(text).toContain('ร้านป้าแดง');
      expect(text).toContain('เจ้าของร้าน');
    });

    it('ไม่กรอก = ใช้ค่าที่บันทึกไว้', async () => {
      const { line, controller } = setup();
      await controller.test({} as any, admin);
      expect(line.send.mock.calls[0].slice(0, 2)).toEqual(['saved-token', 'Usaved']);
    });

    it('ไม่มีชื่อร้าน → ข้อความไม่มีช่องว่างเกิน', async () => {
      const { line, controller } = setup();
      line.shopName = '';
      await controller.test({} as any, admin);
      expect(line.send.mock.calls[0][2]).toContain('ระบบ POS สำเร็จ');
    });

    it.each([
      [{ token: '', to: 'U' }, 'ยังไม่มี Channel access token'],
      [{ token: 't', to: '' }, 'ยังไม่มี User ID'],
    ])('ค่าที่บันทึก %j → ไม่ยิง LINE และบอกว่าขาดอะไร', async (saved, message) => {
      const { line, controller } = setup(saved);
      await expect(controller.test({} as any, admin)).resolves.toEqual({ ok: false, message });
      expect(line.send).not.toHaveBeenCalled();
    });

    it('LINE ตอบ error → ส่งข้อความ error ต่อให้หน้าเว็บ', async () => {
      const { line, controller } = setup();
      line.send.mockResolvedValue({ ok: false, message: 'token ผิด' });
      await expect(controller.test({} as any, admin)).resolves.toEqual({ ok: false, message: 'token ผิด' });
    });
  });
});
