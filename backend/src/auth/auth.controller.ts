import { Body, Controller, Get, Patch, Post, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AllowDuringPasswordChange } from './decorators/allow-password-change.decorator';
import { Public } from './decorators/public.decorator';
import { Roles } from './decorators/roles.decorator';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { AuthenticatedUser } from './jwt.strategy';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  // เดารหัสได้แค่ 5 ครั้ง/นาที/IP — เข้มกว่า limit ทั้งแอปเพราะเป็นจุดที่ bot ชอบยิง
  // ปรับได้ด้วย LOGIN_THROTTLE_LIMIT (ค่าเริ่มต้น 5) — ไว้เปิดกว้างตอนรันเทสต์ E2E ที่ login ทุกเคส
  // อ่านตอน request (ไม่ใช่ตอนโหลดไฟล์) เพราะ decorator รันก่อน .env ถูกโหลด
  @Throttle({
    default: { limit: () => Number(process.env.LOGIN_THROTTLE_LIMIT ?? 5), ttl: 60_000 },
  })
  @ApiOperation({ summary: 'เข้าสู่ระบบและรับ JWT access token' })
  login(@Body() dto: LoginDto) { return this.authService.login(dto); }

  @Get('me')
  @AllowDuringPasswordChange()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'ดูข้อมูลผู้ใช้ที่ login อยู่' })
  me(@Req() request: { user: AuthenticatedUser }) { return request.user; }

  @Patch('password')
  // ร้านใช้บัญชีกลางตามตำแหน่ง (ครัว/หน้าร้าน) ทุกคนในตำแหน่งรู้รหัสเดิม — ถ้าให้เปลี่ยนเองได้
  // คนเดียวกดเปลี่ยนแล้วทั้งตำแหน่ง login ไม่ได้ จึงให้เฉพาะ ADMIN เปลี่ยนของตัวเอง
  // ส่วนบัญชีกลาง ADMIN ตั้งรหัสใหม่ให้ที่หน้าบัญชีผู้ใช้ (PATCH /users/:id)
  @Roles(Role.ADMIN)
  @AllowDuringPasswordChange()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'เปลี่ยนรหัสผ่านของตัวเอง (ต้องส่งรหัสเดิม) — เฉพาะ ADMIN' })
  changePassword(
    @Req() request: { user: AuthenticatedUser },
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(request.user.id, dto);
  }
}
