import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from '../../../src/health/health.controller';

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
