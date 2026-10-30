import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { LineSettingsService } from '../line/line-settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { SlipOkService } from '../slipok/slipok.service';

/** สำรองล่าสุดเก่ากว่านี้ (ชั่วโมง) = เตือน — สำรองวันละครั้ง เผื่อเวลาเลื่อนอีก 2 ชั่วโมง */
export const BACKUP_STALE_HOURS = 26;
/** ส่งออกนอกเครื่องล่าสุดเก่ากว่านี้ = เตือน (ค่าเริ่มต้นส่งทุกชั่วโมง) */
export const OFFSITE_STALE_HOURS = 26;

export type CheckState = 'ok' | 'warn' | 'error' | 'off';

const hoursSince = (date: Date, now: Date) => (now.getTime() - date.getTime()) / 3_600_000;

/**
 * สถานะระบบสำหรับหน้า "สถานะระบบ" ของเจ้าของร้าน
 * ต่างจาก /health (สาธารณะ ใช้กับ monitor) ตรงที่บอกรายละเอียด — จึงต้องเป็น ADMIN
 * ไม่ส่งค่าลับ (token/key) ออกไป บอกแค่ว่าตั้งแล้วหรือยัง
 */
@Injectable()
export class SystemStatusService {
  private readonly backupDir: string;
  private readonly statusDir: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly slipOk: SlipOkService,
    private readonly lineSettings: LineSettingsService,
    config: ConfigService,
  ) {
    // docker-compose mount ./backups เข้ามาแบบอ่านอย่างเดียว (ไม่ตั้ง = เครื่อง dev ไม่มีระบบสำรอง)
    this.backupDir = config.get<string>('BACKUP_DIR') || '/backups';
    // offsite.sh เขียนเวลาที่ส่งสำเร็จล่าสุดไว้ที่นี่ (container offsite อ่าน ./backups ได้อย่างเดียว)
    this.statusDir = config.get<string>('BACKUP_STATUS_DIR') || '/backup-status';
  }

  async getStatus(now = new Date()) {
    const [database, backup, offsite, line] = await Promise.all([
      this.checkDatabase(),
      this.checkBackup(now),
      this.checkOffsite(now),
      this.checkLine(),
    ]);

    return {
      checkedAt: now.toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      database,
      backup,
      offsite,
      slipOk: {
        state: this.slipOkState(),
        mock: this.slipOk.mock,
        configured: this.slipOk.configured,
      },
      line,
    };
  }

  private slipOkState(): CheckState {
    if (this.slipOk.mock) return 'warn';
    return this.slipOk.configured ? 'ok' : 'off';
  }

  /** ตั้งจากหน้า /owner/line (หรือ .env) — ตั้งครบแต่ปิดไว้ = off เหมือนยังไม่ตั้ง */
  private async checkLine() {
    try {
      const cfg = await this.lineSettings.get();
      const configured = Boolean(cfg.enabled && cfg.token && cfg.to);
      return { state: (configured ? 'ok' : 'off') as CheckState, configured };
    } catch {
      // อ่านค่าไม่ได้ (เช่น เปลี่ยน secret แล้วถอดรหัส token เดิมไม่ออก) = ต้องไปตั้งใหม่
      return { state: 'warn' as CheckState, configured: false };
    }
  }

  private async checkDatabase() {
    const started = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const latencyMs = Date.now() - started;
      return { state: (latencyMs > 500 ? 'warn' : 'ok') as CheckState, latencyMs };
    } catch {
      return { state: 'error' as CheckState, latencyMs: null };
    }
  }

  /** ไฟล์สำรองล่าสุดใน ./backups — ชื่อไฟล์ <db>_YYYY-MM-DD_HHMM.dump ตาม deploy/backup.sh */
  private async checkBackup(now: Date) {
    let names: string[];
    try {
      names = (await readdir(this.backupDir)).filter((n) => n.endsWith('.dump'));
    } catch {
      // ไม่มีโฟลเดอร์ = ไม่ได้ mount (เครื่อง dev / compose เก่า) ไม่ใช่สำรองพัง
      return { state: 'off' as CheckState, lastAt: null, lastSizeBytes: null, fileCount: 0 };
    }

    const files = await Promise.all(
      names.map(async (name) => {
        const info = await stat(join(this.backupDir, name));
        return { name, at: info.mtime, size: info.size };
      }),
    );
    const [latest] = [...files].sort((a, b) => b.at.getTime() - a.at.getTime());
    if (!latest) {
      return { state: 'error' as CheckState, lastAt: null, lastSizeBytes: null, fileCount: 0 };
    }

    const stale = hoursSince(latest.at, now) > BACKUP_STALE_HOURS;
    // ไฟล์เล็กผิดปกติ = dump ได้แค่โครงตาราง ไม่มีข้อมูล (หรือ DB เปล่า)
    const tiny = latest.size < 1024;
    return {
      state: (stale || tiny ? 'warn' : 'ok') as CheckState,
      lastAt: latest.at.toISOString(),
      lastSizeBytes: latest.size,
      fileCount: files.length,
    };
  }

  private async checkOffsite(now: Date) {
    let raw: string;
    try {
      raw = await readFile(join(this.statusDir, 'offsite-last-ok'), 'utf8');
    } catch {
      return { state: 'off' as CheckState, lastAt: null };
    }
    const at = new Date(raw.trim());
    if (Number.isNaN(at.getTime())) return { state: 'warn' as CheckState, lastAt: null };
    return {
      state: (hoursSince(at, now) > OFFSITE_STALE_HOURS ? 'warn' : 'ok') as CheckState,
      lastAt: at.toISOString(),
    };
  }
}
