import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, PayloadTooLargeException } from '@nestjs/common';
import type { Response } from 'express';

/**
 * multer ตัดไฟล์ที่เกินเพดานก่อนอ่านเข้าหน่วยความจำ แล้ว Nest แปลงเป็น 413 "File too large" (อังกฤษ)
 * หน้าเว็บโชว์ข้อความจาก backend ตรง ๆ จึงเปลี่ยนเป็น 400 ภาษาไทยแบบเดียวกับที่ service ตอบ
 */
@Catch(PayloadTooLargeException)
export class OversizeImageFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost) {
    const error = new BadRequestException('รูปใหญ่เกิน 2 MB');
    host.switchToHttp().getResponse<Response>().status(error.getStatus()).json(error.getResponse());
  }
}
