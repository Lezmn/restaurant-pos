import { ServiceUnavailableException } from '@nestjs/common';
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HealthController } from '../../../src/health/health.controller';
import { SystemStatusController } from '../../../src/health/system-status.controller';
import { SystemStatusService } from '../../../src/health/system-status.service';

const NOW = new Date('2026-05-01T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

describe('HealthController (GET /health สาธารณะ)', () => {
  it('DB ตอบ → 200 ok', async () => {
    const prisma: any = { $queryRaw: jest.fn().mockResolvedValue([{ 1: 1 }]) };
    await expect(new HealthController(prisma).check()).resolves.toMatchObject({ status: 'ok', db: 'ok' });
  });

  it('DB ล่ม → 503 โดยไม่หลุดรายละเอียด error', async () => {
    const prisma: any = { $queryRaw: jest.fn().mockRejectedValue(new Error('password authentication failed')) };
    const err = await new HealthController(prisma).check().catch((e) => e);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect(JSON.stringify(err.getResponse())).not.toContain('password');
  });
});

describe('SystemStatusService (หน้าสถานะระบบของเจ้าของร้าน)', () => {
  let backupDir: string;
  let statusDir: string;

  beforeEach(() => {
    backupDir = mkdtempSync(join(tmpdir(), 'pos-backup-'));
    statusDir = mkdtempSync(join(tmpdir(), 'pos-status-'));
  });
  afterEach(() => {
    rmSync(backupDir, { recursive: true, force: true });
    rmSync(statusDir, { recursive: true, force: true });
  });

  function build(opts: {
    db?: 'ok' | 'down';
    slipOk?: { mock: boolean; configured: boolean };
    line?: Record<string, unknown> | Error;
    dirs?: { backup?: string; status?: string };
  } = {}) {
    const prisma: any = {
      $queryRaw: opts.db === 'down' ? jest.fn().mockRejectedValue(new Error('x')) : jest.fn().mockResolvedValue([]),
    };
    const slipOk: any = opts.slipOk ?? { mock: false, configured: true };
    const line: any = {
      get:
        opts.line instanceof Error
          ? jest.fn().mockRejectedValue(opts.line)
          : jest.fn().mockResolvedValue(opts.line ?? { enabled: true, token: 't', to: 'U' }),
    };
    const env: Record<string, string> = {
      BACKUP_DIR: opts.dirs?.backup ?? backupDir,
      BACKUP_STATUS_DIR: opts.dirs?.status ?? statusDir,
    };
    const config: any = { get: (k: string) => env[k] };
    return new SystemStatusService(prisma, slipOk, line, config);
  }

  function dump(name: string, sizeBytes: number, at: Date) {
    const file = join(backupDir, name);
    writeFileSync(file, Buffer.alloc(sizeBytes));
    utimesSync(file, at, at);
  }

  it('ทุกอย่างปกติ → ok ทุกช่อง และไม่ส่ง token ออกไป', async () => {
    dump('pos_2026-05-01_0300.dump', 4096, hoursAgo(9));
    dump('pos_2026-04-30_0300.dump', 4096, hoursAgo(33));
    writeFileSync(join(backupDir, 'notes.txt'), 'ignored');
    writeFileSync(join(statusDir, 'offsite-last-ok'), `${hoursAgo(1).toISOString()}\n`);

    const status = await build({ line: { enabled: true, token: 'secret-token', to: 'U' } }).getStatus(NOW);

    expect(status.database.state).toBe('ok');
    expect(status.backup).toMatchObject({
      state: 'ok',
      fileCount: 2,
      lastSizeBytes: 4096,
      lastAt: hoursAgo(9).toISOString(),
    });
    expect(status.offsite).toEqual({ state: 'ok', lastAt: hoursAgo(1).toISOString() });
    expect(status.slipOk.state).toBe('ok');
    expect(status.line).toEqual({ state: 'ok', configured: true });
    expect(JSON.stringify(status)).not.toContain('secret-token');
  });

  it('สำรองเก่าเกิน 26 ชม. หรือไฟล์เล็กผิดปกติ → warn', async () => {
    dump('a.dump', 4096, hoursAgo(27));
    expect((await build().getStatus(NOW)).backup.state).toBe('warn');

    rmSync(join(backupDir, 'a.dump'));
    dump('b.dump', 100, hoursAgo(1));
    expect((await build().getStatus(NOW)).backup.state).toBe('warn');
  });

  it('มีโฟลเดอร์สำรองแต่ไม่มีไฟล์ .dump → error', async () => {
    expect((await build().getStatus(NOW)).backup).toMatchObject({ state: 'error', fileCount: 0 });
  });

  it('ไม่มีโฟลเดอร์ (เครื่อง dev) → off ทั้งสำรองและ offsite', async () => {
    const missing = join(backupDir, 'nope');
    const status = await build({ dirs: { backup: missing, status: missing } }).getStatus(NOW);
    expect(status.backup.state).toBe('off');
    expect(status.offsite.state).toBe('off');
  });

  it('offsite เก่าเกินหรืออ่านวันที่ไม่ได้ → warn', async () => {
    writeFileSync(join(statusDir, 'offsite-last-ok'), hoursAgo(30).toISOString());
    expect((await build().getStatus(NOW)).offsite.state).toBe('warn');
    writeFileSync(join(statusDir, 'offsite-last-ok'), 'not-a-date');
    expect((await build().getStatus(NOW)).offsite).toEqual({ state: 'warn', lastAt: null });
  });

  it('DB ล่ม → error', async () => {
    expect((await build({ db: 'down' }).getStatus(NOW)).database).toEqual({ state: 'error', latencyMs: null });
  });

  it.each([
    [{ mock: true, configured: false }, 'warn'],
    [{ mock: false, configured: false }, 'off'],
  ])('SlipOK %j → %s', async (slipOk, state) => {
    expect((await build({ slipOk }).getStatus(NOW)).slipOk.state).toBe(state);
  });

  it('LINE ตั้งครบแต่ปิดไว้ → off / อ่านค่าไม่ได้ → warn', async () => {
    expect((await build({ line: { enabled: false, token: 't', to: 'U' } }).getStatus(NOW)).line.state).toBe('off');
    expect((await build({ line: new Error('decrypt') }).getStatus(NOW)).line).toEqual({
      state: 'warn',
      configured: false,
    });
  });

  it('ไม่ได้ตั้ง BACKUP_DIR → ใช้ค่าเริ่มต้นของ docker', () => {
    const service = new SystemStatusService({} as any, {} as any, {} as any, { get: () => undefined } as any);
    expect((service as any).backupDir).toBe('/backups');
    expect((service as any).statusDir).toBe('/backup-status');
  });

  it('SystemStatusController ส่งต่อไปที่ service', async () => {
    const service: any = { getStatus: jest.fn().mockResolvedValue({ ok: 1 }) };
    await expect(new SystemStatusController(service).getStatus()).resolves.toEqual({ ok: 1 });
  });
});
