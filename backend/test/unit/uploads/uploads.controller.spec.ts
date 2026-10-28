import { UploadsController } from '../../../src/uploads/uploads.controller';

describe('UploadsController', () => {
  it('คืน URL เต็มจาก protocol + host ของ request (หลัง proxy)', async () => {
    const uploads: any = { saveMenuImage: jest.fn().mockResolvedValue('/uploads/menu/abc.webp') };
    const req: any = { protocol: 'https', get: (h: string) => (h === 'host' ? 'api.shop.test' : undefined) };
    const file = { buffer: Buffer.from('x'), size: 1 };

    await expect(new UploadsController(uploads).uploadMenuImage(file, req)).resolves.toEqual({
      url: 'https://api.shop.test/uploads/menu/abc.webp',
    });
    expect(uploads.saveMenuImage).toHaveBeenCalledWith(file);
  });

  it('ไม่มีไฟล์ → error จาก service ส่งต่อ (service ตอบภาษาไทยเอง)', async () => {
    const err = new Error('ไม่พบไฟล์');
    const uploads: any = { saveMenuImage: jest.fn().mockRejectedValue(err) };
    await expect(new UploadsController(uploads).uploadMenuImage(undefined, {} as any)).rejects.toBe(err);
  });
});
