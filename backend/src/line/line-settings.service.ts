import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { maskSecret, openSecret, sealSecret } from '../settings/secret-box';

const KEY_TOKEN = 'line.channelAccessToken';
const KEY_TO = 'line.to';
const KEY_ENABLED = 'line.enabled';

export type LineConfig = {
  token: string;
  to: string;
  enabled: boolean;
  /** มาจากหน้าตั้งค่า (DB) / .env / ยังไม่ตั้ง */
  source: 'database' | 'env' | 'none';
  /** มี token เก็บไว้แต่ถอดรหัสไม่ได้ (SETTINGS_SECRET/JWT_SECRET ถูกเปลี่ยน) — ต้องวางใหม่ */
  tokenUnreadable: boolean;
};

/**
 * ค่าตั้งค่า LINE — เจ้าของร้านแก้จากหน้าเว็บ (/owner/line) ได้เอง ไม่ต้องเข้าเซิร์ฟเวอร์
 * ลำดับ: ค่าที่บันทึกจากหน้าเว็บก่อน → ไม่เคยบันทึก = ใช้ค่าใน .env (ร้านที่ตั้งแบบเดิมไม่ต้องทำใหม่)
 */
@Injectable()
export class LineSettingsService {
  private readonly logger = new Logger(LineSettingsService.name);
  /** ไว้ไม่ต้องอ่าน DB ทุกครั้งที่ส่ง — ล้างตอนบันทึก (API รันโปรเซสเดียว) */
  private cache: LineConfig | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get secret() {
    return (
      this.config.get<string>('SETTINGS_SECRET')?.trim() ||
      this.config.getOrThrow<string>('JWT_SECRET')
    );
  }

  async get(): Promise<LineConfig> {
    if (this.cache) return this.cache;

    const rows = await this.prisma.appSetting.findMany({
      where: { key: { in: [KEY_TOKEN, KEY_TO, KEY_ENABLED] } },
    });
    const value = (key: string) => rows.find((r) => r.key === key)?.value;

    let result: LineConfig;
    if (rows.length > 0) {
      const sealed = value(KEY_TOKEN);
      const token = sealed ? openSecret(sealed, this.secret) : '';
      if (sealed && token === null) {
        this.logger.warn('ถอดรหัส LINE token ไม่ได้ (SETTINGS_SECRET/JWT_SECRET เปลี่ยน?) — ให้เจ้าของร้านวาง token ใหม่');
      }
      result = {
        token: token ?? '',
        to: value(KEY_TO) ?? '',
        enabled: value(KEY_ENABLED) !== 'false',
        source: 'database',
        tokenUnreadable: Boolean(sealed) && token === null,
      };
    } else {
      const token = this.config.get<string>('LINE_CHANNEL_ACCESS_TOKEN')?.trim() ?? '';
      const to = this.config.get<string>('LINE_TO')?.trim() ?? '';
      result = {
        token,
        to,
        enabled: true,
        source: token || to ? 'env' : 'none',
        tokenUnreadable: false,
      };
    }
    this.cache = result;
    return result;
  }

  /** ข้อมูลให้หน้าตั้งค่า — ห้ามคืน token เต็ม */
  async summary() {
    const c = await this.get();
    return {
      enabled: c.enabled,
      to: c.to,
      hasToken: Boolean(c.token),
      tokenHint: c.token ? maskSecret(c.token) : null,
      source: c.source,
      tokenUnreadable: c.tokenUnreadable,
      ready: c.enabled && Boolean(c.token && c.to),
    };
  }

  /** token ไม่ส่ง = ใช้ตัวเดิม (หน้าเว็บไม่เคยได้ token เต็มกลับไป จึงส่งกลับมาไม่ได้) */
  async update(input: { enabled: boolean; to: string; token?: string }, updatedByName: string) {
    const current = await this.get();
    const token = input.token?.trim() || current.token;
    const rows: { key: string; value: string }[] = [
      { key: KEY_TO, value: input.to.trim() },
      { key: KEY_ENABLED, value: String(input.enabled) },
      ...(token ? [{ key: KEY_TOKEN, value: sealSecret(token, this.secret) }] : []),
    ];
    await this.prisma.$transaction(
      rows.map((row) =>
        this.prisma.appSetting.upsert({
          where: { key: row.key },
          create: { ...row, updatedByName },
          update: { value: row.value, updatedByName },
        }),
      ),
    );
    this.cache = null;
    return this.summary();
  }
}
