import 'reflect-metadata';
import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { EXCEPTION_FILTERS_METADATA } from '@nestjs/common/constants';
import { OversizeImageFilter } from '../../../src/uploads/oversize-image.filter';
import { UploadsController } from '../../../src/uploads/uploads.controller';
import { MAX_IMAGE_BYTES } from '../../../src/uploads/uploads.service';

describe('OversizeImageFilter', () => {
  // ทดสอบ: รูปเกิน 2 MB ที่ multer ตัดทิ้ง (413 "File too large") ต้องกลายเป็น 400 ข้อความภาษาไทยเหมือนที่ service ตอบ
  // วิธี: ส่ง PayloadTooLargeException เข้า filter ด้วย response จำลอง → เช็กว่าตอบ status 400 และ body เป็นรูปแบบเดียวกับ BadRequestException ("รูปใหญ่เกิน 2 MB")
  it('413 File too large → 400 รูปใหญ่เกิน 2 MB (รูปแบบเดียวกับ error อื่นของระบบ)', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host: any = { switchToHttp: () => ({ getResponse: () => ({ status }) }) };

    new OversizeImageFilter().catch(new PayloadTooLargeException('File too large'), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(new BadRequestException('รูปใหญ่เกิน 2 MB').getResponse());
    expect(json.mock.calls[0][0]).toMatchObject({ statusCode: 400, message: 'รูปใหญ่เกิน 2 MB', error: 'Bad Request' });
  });

  // ทดสอบ: route อัปโหลดต้องผูก filter นี้ไว้จริง (ถ้าถูกถอดออก รูปใหญ่จะกลับไปได้ 413 ภาษาอังกฤษ)
  // วิธี: อ่าน metadata ของ UploadsController.uploadMenuImage → ต้องมี OversizeImageFilter
  it('uploadMenuImage ใช้ OversizeImageFilter', () => {
    const filters = Reflect.getMetadata(EXCEPTION_FILTERS_METADATA, UploadsController.prototype.uploadMenuImage) as unknown[];
    expect(filters).toContain(OversizeImageFilter);
  });

  // ทดสอบ: เพดานที่ผูกกับ multer ต้องเท่ากับ 2 MB พอดี ไม่ใช่ +1 เหมือนเดิม (ไฟล์ที่เกินแม้ byte เดียวก็ผ่านทาง filter เดียวกัน)
  // วิธี: เช็กค่าคงที่ MAX_IMAGE_BYTES = 2 MB แล้วดูว่า service ยังกันไฟล์เกินเพดานเป็นชั้นที่สองด้วยข้อความเดียวกัน
  it('เพดาน 2 MB พอดี และ service ยังกันซ้ำอีกชั้น', async () => {
    expect(MAX_IMAGE_BYTES).toBe(2 * 1024 * 1024);
    const { UploadsService } = await import('../../../src/uploads/uploads.service');
    const service = new UploadsService({ get: () => undefined } as any);
    await expect(
      service.saveMenuImage({ buffer: Buffer.alloc(8), size: MAX_IMAGE_BYTES + 1 }),
    ).rejects.toThrow('รูปใหญ่เกิน 2 MB');
  });
});
