import { maskSecret, openSecret, sealSecret } from '../../../src/settings/secret-box';
import { LineSettingsService } from '../../../src/line/line-settings.service';

const config = (env: Record<string, string>) =>
  ({ get: (k: string) => env[k], getOrThrow: (k: string) => env[k] }) as any;

function prismaWith(rows: { key: string; value: string }[]) {
  const store = new Map(rows.map((r) => [r.key, r.value]));
  const prisma: any = {
    appSetting: {
      findMany: jest.fn(async () => [...store].map(([key, value]) => ({ key, value }))),
      upsert: jest.fn(({ where, update }: any) => {
        store.set(where.key, update.value);
        return Promise.resolve();
      }),
    },
  };
  prisma.$transaction = jest.fn((ops: Promise<unknown>[]) => Promise.all(ops));
  return { prisma, store };
}

describe('secret-box', () => {
  it('เข้ารหัสแล้วถอดกลับได้ด้วยกุญแจเดิม — กุญแจอื่นถอดไม่ได้ (คืน null ไม่ throw)', () => {
    const sealed = sealSecret('my-token', 'k1');
    expect(sealed).not.toContain('my-token');
    expect(openSecret(sealed, 'k1')).toBe('my-token');
    expect(openSecret(sealed, 'k2')).toBeNull();
    expect(openSecret('garbage', 'k1')).toBeNull();
  });

  it('mask โชว์แค่ 4 ตัวท้าย', () => {
    expect(maskSecret('abcdefgh1234')).toBe('••••••1234');
  });
});

describe('LineSettingsService', () => {
  const env = { JWT_SECRET: 'jwt-secret', LINE_CHANNEL_ACCESS_TOKEN: 'env-token', LINE_TO: 'Uenv' };

  it('ยังไม่เคยบันทึกจากหน้าเว็บ → ใช้ค่าใน .env', async () => {
    const { prisma } = prismaWith([]);
    const cfg = await new LineSettingsService(prisma, config(env)).get();
    expect(cfg).toMatchObject({ token: 'env-token', to: 'Uenv', source: 'env', enabled: true });
  });

  it('บันทึกจากหน้าเว็บ → เก็บ token แบบเข้ารหัส และค่านี้มาก่อน .env', async () => {
    const { prisma, store } = prismaWith([]);
    const service = new LineSettingsService(prisma, config(env));
    const summary = await service.update({ enabled: true, to: 'Uweb', token: 'web-token-123456789012' }, 'Admin');

    expect(store.get('line.channelAccessToken')).not.toContain('web-token');
    expect(summary).toMatchObject({ to: 'Uweb', hasToken: true, tokenHint: '••••••9012', source: 'database', ready: true });
    expect(JSON.stringify(summary)).not.toContain('web-token');
    expect((await service.get()).token).toBe('web-token-123456789012');
  });

  it('ไม่ส่ง token ตอนบันทึก = ใช้ตัวเดิม', async () => {
    const { prisma } = prismaWith([]);
    const service = new LineSettingsService(prisma, config(env));
    await service.update({ enabled: true, to: 'Uweb', token: 'first-token-1234567890' }, 'Admin');
    await service.update({ enabled: false, to: 'Uweb2' }, 'Admin');
    expect(await service.get()).toMatchObject({ token: 'first-token-1234567890', to: 'Uweb2', enabled: false });
  });

  it('กุญแจเปลี่ยน (ถอด token ไม่ได้) → บอกว่าต้องวางใหม่ ไม่ส่งด้วย token เสีย', async () => {
    const { prisma } = prismaWith([
      { key: 'line.channelAccessToken', value: sealSecret('old', 'other-key') },
      { key: 'line.to', value: 'Uweb' },
    ]);
    const cfg = await new LineSettingsService(prisma, config(env)).get();
    expect(cfg).toMatchObject({ token: '', tokenUnreadable: true, source: 'database' });
  });

  it('ไม่มีทั้งค่าในหน้าเว็บและ .env → source none, ยังส่งไม่ได้', async () => {
    const { prisma } = prismaWith([]);
    const service = new LineSettingsService(prisma, config({ JWT_SECRET: 'jwt-secret' }));
    expect(await service.get()).toMatchObject({ token: '', to: '', source: 'none', tokenUnreadable: false });
    expect(await service.summary()).toMatchObject({ hasToken: false, tokenHint: null, ready: false });
  });

  it('.env มีแค่ LINE_TO (ตัดช่องว่าง) → ยังนับว่ามาจาก env', async () => {
    const { prisma } = prismaWith([]);
    const cfg = await new LineSettingsService(prisma, config({ JWT_SECRET: 'j', LINE_TO: '  Uenv  ' })).get();
    expect(cfg).toMatchObject({ token: '', to: 'Uenv', source: 'env' });
  });

  it('บันทึกแค่บางค่า (ไม่มี token / ไม่มีผู้รับ) → ค่าที่ขาดเป็นว่าง และไม่ถือว่า token เสีย', async () => {
    const { prisma } = prismaWith([{ key: 'line.enabled', value: 'false' }]);
    const cfg = await new LineSettingsService(prisma, config(env)).get();
    expect(cfg).toEqual({ token: '', to: '', enabled: false, source: 'database', tokenUnreadable: false });
  });

  it('ไม่เคยมี token และไม่ส่งมา → ไม่บันทึกแถว token', async () => {
    const { prisma, store } = prismaWith([]);
    const service = new LineSettingsService(prisma, config({ JWT_SECRET: 'j' }));
    const summary = await service.update({ enabled: true, to: ' Uweb ' }, 'Admin');
    expect(store.has('line.channelAccessToken')).toBe(false);
    expect(store.get('line.to')).toBe('Uweb');
    expect(summary).toMatchObject({ hasToken: false, ready: false, source: 'database' });
  });

  it('มี SETTINGS_SECRET → ใช้เข้ารหัสแทน JWT_SECRET', async () => {
    const { prisma, store } = prismaWith([]);
    const service = new LineSettingsService(prisma, config({ ...env, SETTINGS_SECRET: ' settings-key ' }));
    await service.update({ enabled: true, to: 'U', token: 'tok-1234567890' }, 'Admin');
    const sealed = store.get('line.channelAccessToken')!;
    expect(openSecret(sealed, 'settings-key')).toBe('tok-1234567890');
    expect(openSecret(sealed, 'jwt-secret')).toBeNull();
  });

  it('อ่านครั้งเดียวแล้วใช้ cache จนกว่าจะบันทึกใหม่', async () => {
    const { prisma } = prismaWith([]);
    const service = new LineSettingsService(prisma, config(env));
    await service.get();
    await service.get();
    expect(prisma.appSetting.findMany).toHaveBeenCalledTimes(1);
  });
});
