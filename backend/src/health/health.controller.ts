import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

/**
 * GET /health — ใช้โดย Docker HEALTHCHECK, Caddy และ uptime monitor ภายนอก (UptimeRobot ฯลฯ)
 * เช็ค DB ด้วย ไม่ใช่แค่ process ยังรันอยู่ — DB ล่ม = ร้านใช้งานไม่ได้ ต้องแจ้งเตือนเหมือนกัน
 * ไม่ต้อง login และไม่นับ rate limit (monitor ยิงทุกนาที ไม่ควรไปกินโควตาของร้าน)
 */
@ApiTags('health')
@Public()
@SkipThrottle({ default: true, ip: true })
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'สถานะ API + ฐานข้อมูล (200 = พร้อมใช้งาน, 503 = DB ต่อไม่ได้)' })
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      // ไม่ส่งรายละเอียด error ออกไป — endpoint นี้เปิดสาธารณะ
      throw new ServiceUnavailableException({ status: 'error', db: 'down' });
    }
    return { status: 'ok', db: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }
}
