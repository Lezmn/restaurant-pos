import { BadRequestException } from '@nestjs/common';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectImageType } from './image-type';
import { MAX_IMAGE_BYTES, UploadsService } from './uploads.service';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]);

describe('รูปเมนู — ตรวจชนิดจากเนื้อไฟล์', () => {
  it('รู้จัก JPG / PNG / WebP', () => {
    expect(detectImageType(JPG)).toBe('jpg');
    expect(detectImageType(PNG)).toBe('png');
    expect(detectImageType(WEBP)).toBe('webp');
  });

  it('ไฟล์อื่นที่แอบตั้งชื่อเป็น .png (HTML/SVG/สคริปต์) ไม่ผ่าน', () => {
    expect(detectImageType(Buffer.from('<svg onload=alert(1)>'))).toBeNull();
    expect(detectImageType(Buffer.from('<html><script>'))).toBeNull();
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
  });
});

describe('UploadsService.saveMenuImage', () => {
  let dir: string;
  let service: UploadsService;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'uploads-'));
    service = new UploadsService({ get: () => dir } as any);
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('บันทึกด้วยชื่อสุ่ม (uuid) + นามสกุลตามเนื้อไฟล์ ไม่ใช้ชื่อที่ผู้ใช้ส่งมา', async () => {
    const path = await service.saveMenuImage({ buffer: PNG, size: PNG.length });
    expect(path).toMatch(/^\/uploads\/[0-9a-f-]{36}\.png$/);
    expect(await readdir(dir)).toEqual([path.slice('/uploads/'.length)]);
  });

  it('ไม่แนบไฟล์ / ไม่ใช่รูป / ใหญ่เกิน 2 MB → 400 และไม่เขียนไฟล์', async () => {
    await expect(service.saveMenuImage(undefined)).rejects.toBeInstanceOf(BadRequestException);
    const html = Buffer.from('<html>');
    await expect(service.saveMenuImage({ buffer: html, size: html.length })).rejects.toThrow('JPG, PNG หรือ WebP');
    await expect(service.saveMenuImage({ buffer: PNG, size: MAX_IMAGE_BYTES + 1 })).rejects.toThrow('2 MB');
    expect(await readdir(dir)).toEqual([]);
  });
});
