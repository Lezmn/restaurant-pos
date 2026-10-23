import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { detectImageType } from './image-type';

/** ขนาดสูงสุดหลังหน้าเว็บย่อรูปแล้ว (ย่อเหลือด้านยาว ~1200px ปกติไม่เกิน 300 KB) */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** โฟลเดอร์เก็บรูปเมนู — เสิร์ฟที่ /uploads/<ชื่อไฟล์> (ดู main.ts) และต้องอยู่บน volume ที่ไม่หายตอน deploy */
export const uploadDir = (config?: ConfigService) =>
  resolve(config?.get<string>('UPLOAD_DIR') ?? process.env.UPLOAD_DIR ?? 'uploads');

@Injectable()
export class UploadsService {
  constructor(private readonly config: ConfigService) {}

  /** บันทึกรูปเมนู → คืน path ที่เปิดได้ (/uploads/<uuid>.<ext>) ชื่อไฟล์สุ่ม เดาไม่ได้ ไม่ใช้ชื่อจากผู้ใช้ */
  async saveMenuImage(file: { buffer: Buffer; size: number } | undefined): Promise<string> {
    if (!file?.buffer?.length) throw new BadRequestException('ไม่ได้แนบไฟล์รูป (field ชื่อ file)');
    if (file.size > MAX_IMAGE_BYTES) throw new BadRequestException('รูปใหญ่เกิน 2 MB');
    const ext = detectImageType(file.buffer);
    if (!ext) throw new BadRequestException('รองรับเฉพาะรูป JPG, PNG หรือ WebP');

    const dir = uploadDir(this.config);
    await mkdir(dir, { recursive: true });
    const name = `${randomUUID()}.${ext}`;
    await writeFile(join(dir, name), file.buffer, { flag: 'wx' });
    return `/uploads/${name}`;
  }
}
