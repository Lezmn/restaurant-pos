import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SystemStatusService } from '../../../src/health/system-status.service';

const NOW = new Date('2026-10-26T12:00:00+07:00');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

describe('SystemStatusService', () => {
  let dir: string;
  let prisma: { $queryRaw: jest.Mock };
  let slipOk: { mock: boolean; configured: boolean };
  let line: { get: jest.Mock };

  const make = (env: Record<string, string> = {}) =>
    new SystemStatusService(
      prisma as any,
      slipOk as any,
      line as any,
      {
        get: (key: string) =>
          ({ BACKUP_DIR: join(dir, 'backups'), BACKUP_STATUS_DIR: join(dir, 'status'), ...env })[key],
      } as any,
    );

  const dump = async (name: string, ageHours: number, size = 4096) => {
    const file = join(dir, 'backups', name);
    await writeFile(file, Buffer.alloc(size));
    await utimes(file, hoursAgo(ageHours), hoursAgo(ageHours));
  };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'status-'));
    prisma = { $queryRaw: jest.fn().mockResolvedValue([1]) };
    slipOk = { mock: false, configured: true };
    line = { get: jest.fn().mockResolvedValue({ enabled: true, token: '', to: '' }) };
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('ไม่มีโฟลเดอร์สำรอง = off (เครื่อง dev) ไม่ใช่ error', async () => {
    const s = await make().getStatus(NOW);
    expect(s.backup).toMatchObject({ state: 'off', lastAt: null });
    expect(s.offsite.state).toBe('off');
    expect(s.database.state).toBe('ok');
    expect(s.slipOk.state).toBe('ok');
    expect(s.line.state).toBe('off');
  });

  it('อ่านไฟล์สำรองล่าสุด — ภายใน 26 ชม. = ok', async () => {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(dir, 'backups'));
    await dump('restaurant_db_2026-10-24_0300.dump', 57);
    await dump('restaurant_db_2026-10-26_0300.dump', 9);
    await writeFile(join(dir, 'backups', 'note.txt'), 'x');

    const s = await make().getStatus(NOW);
    expect(s.backup).toMatchObject({ state: 'ok', fileCount: 2, lastSizeBytes: 4096 });
    expect(s.backup.lastAt).toBe(hoursAgo(9).toISOString());
  });

  it('สำรองล่าสุดเก่าเกิน หรือไฟล์เล็กผิดปกติ = warn / โฟลเดอร์ว่าง = error', async () => {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(dir, 'backups'));
    expect((await make().getStatus(NOW)).backup.state).toBe('error');

    await dump('a.dump', 30);
    expect((await make().getStatus(NOW)).backup.state).toBe('warn');

    await dump('b.dump', 1, 200);
    expect((await make().getStatus(NOW)).backup.state).toBe('warn');
  });

  it('ส่งออกนอกเครื่อง: อ่านเวลาจากไฟล์ที่ offsite.sh เขียน', async () => {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(dir, 'status'));
    await writeFile(join(dir, 'status', 'offsite-last-ok'), `${hoursAgo(2).toISOString()}\n`);
    expect((await make().getStatus(NOW)).offsite).toEqual({
      state: 'ok',
      lastAt: hoursAgo(2).toISOString(),
    });

    await writeFile(join(dir, 'status', 'offsite-last-ok'), hoursAgo(40).toISOString());
    expect((await make().getStatus(NOW)).offsite.state).toBe('warn');
  });

  it('DB ต่อไม่ได้ = error / SlipOK โหมดจำลอง = warn', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('down'));
    slipOk.mock = true;
    const s = await make().getStatus(NOW);
    expect(s.database).toEqual({ state: 'error', latencyMs: null });
    expect(s.slipOk.state).toBe('warn');
  });

  it('LINE: ตั้งครบและเปิดอยู่ = ok / ปิดไว้ = off / อ่านค่าไม่ได้ = warn', async () => {
    line.get.mockResolvedValue({ enabled: true, token: 't', to: 'U1' });
    expect((await make().getStatus(NOW)).line).toEqual({ state: 'ok', configured: true });
    line.get.mockResolvedValue({ enabled: false, token: 't', to: 'U1' });
    expect((await make().getStatus(NOW)).line.state).toBe('off');
    line.get.mockRejectedValue(new Error('bad secret'));
    expect((await make().getStatus(NOW)).line.state).toBe('warn');
  });
});
