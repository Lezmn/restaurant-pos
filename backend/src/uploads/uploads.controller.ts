import { Controller, Post, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { MAX_IMAGE_BYTES, UploadsService } from './uploads.service';

@ApiTags('uploads')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post('menu-image')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'อัปโหลดรูปเมนู (JPG/PNG/WebP ไม่เกิน 2 MB) → ได้ url ไปใส่ imageUrl ของเมนู' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  // เกินขนาด multer ตัดทิ้งก่อนอ่านทั้งไฟล์เข้าหน่วยความจำ (+1 ให้ service ตอบข้อความภาษาไทยเองแทน 413)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES + 1, files: 1 } }))
  async uploadMenuImage(
    @UploadedFile() file: { buffer: Buffer; size: number } | undefined,
    @Req() req: Request,
  ) {
    const path = await this.uploads.saveMenuImage(file);
    // URL เต็มของ API (หลัง Nginx ได้ https + โดเมน api.* จาก X-Forwarded-Proto/Host ผ่าน trust proxy)
    return { url: `${req.protocol}://${req.get('host')}${path}` };
  }
}
