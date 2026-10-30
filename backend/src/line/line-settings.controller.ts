import { BadRequestException, Body, Controller, Get, HttpCode, Post, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Audit } from '../audit/audit.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { TestLineSettingsDto, UpdateLineSettingsDto } from './dto/line-settings.dto';
import { LineMessagingService } from './line-messaging.service';
import { LineSettingsService } from './line-settings.service';

/**
 * ตั้งค่าการส่งสรุปยอดเข้า LINE — เจ้าของร้านทำเองจากหน้าเว็บตอนส่งมอบระบบ
 * ไม่เคยคืน token เต็มกลับไป (หน้าเว็บเห็นแค่ ••••••ab12)
 */
@ApiTags('settings')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('settings/line')
export class LineSettingsController {
  constructor(
    private readonly settings: LineSettingsService,
    private readonly line: LineMessagingService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'ค่าตั้งค่า LINE ปัจจุบัน (ไม่มี token เต็ม)' })
  get() {
    return this.settings.summary();
  }

  @Put()
  // ห้ามเก็บ token ลงประวัติ — เก็บแค่ว่าเปลี่ยน token หรือไม่
  @Audit('SETTINGS_LINE_UPDATE', {
    details: ({ body }) => ({
      enabled: body.enabled,
      to: body.to,
      tokenChanged: typeof body.token === 'string' && body.token.trim() !== '',
    }),
    targetId: () => 'line',
  })
  @ApiOperation({ summary: 'บันทึกค่าตั้งค่า LINE (token ไม่ส่ง = ใช้ตัวเดิม)' })
  async update(@Body() dto: UpdateLineSettingsDto, @Req() request: { user: AuthenticatedUser }) {
    const current = await this.settings.get();
    if (!dto.token && (!current.token || current.tokenUnreadable)) {
      throw new BadRequestException('ยังไม่มี Channel access token — วาง token ก่อนบันทึก');
    }
    return this.settings.update(dto, request.user.name);
  }

  @Post('test')
  @HttpCode(200)
  @ApiOperation({ summary: 'ส่งข้อความทดสอบ (ใช้ค่าที่กรอกอยู่ หรือค่าที่บันทึกไว้)' })
  async test(@Body() dto: TestLineSettingsDto, @Req() request: { user: AuthenticatedUser }) {
    const saved = await this.settings.get();
    const token = dto.token || saved.token;
    const to = dto.to || saved.to;
    if (!token) return { ok: false, message: 'ยังไม่มี Channel access token' };
    if (!to) return { ok: false, message: 'ยังไม่มี User ID' };

    const shopSuffix = this.line.shopName ? ` ${this.line.shopName}` : '';
    const result = await this.line.send(
      token,
      to,
      `✅ เชื่อมต่อ LINE กับระบบ POS${shopSuffix} สำเร็จ\nทดสอบโดย ${request.user.name}\nต่อไปจะได้สรุปยอดทุกครั้งที่กด "ปิดยอดวันนี้"`,
    );
    return result.ok
      ? { ok: true, message: 'ส่งข้อความทดสอบแล้ว — เช็คใน LINE ได้เลย' }
      : { ok: false, message: result.message };
  }
}
