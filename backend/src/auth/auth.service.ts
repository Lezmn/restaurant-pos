import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const passwordMatches = user && await bcrypt.compare(dto.password, user.password);
    if (!passwordMatches || !user) throw new UnauthorizedException('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    // บอกเฉพาะคนที่ใส่รหัสถูกแล้ว — คนเดารหัสจะไม่รู้ว่าบัญชีนี้มีอยู่จริง
    if (!user.isActive) {
      throw new UnauthorizedException('บัญชีนี้ถูกปิดใช้งาน — ติดต่อเจ้าของร้าน');
    }

    return {
      // tv = tokenVersion ตอนออก token — ADMIN กด "ออกจากระบบทุกเครื่อง" แล้ว token นี้ใช้ไม่ได้
      accessToken: await this.jwt.signAsync({ sub: user.id, role: user.role, tv: user.tokenVersion }),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        // true = หน้าเว็บพาไปตั้งรหัสใหม่ก่อน (backend ก็บล็อก API อื่นไว้อีกชั้น)
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  /** เปลี่ยนรหัสตัวเอง — ต้องรู้รหัสเดิม กันคนหยิบเครื่องที่ login ค้างไปเปลี่ยนรหัส */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    const currentMatches = await bcrypt.compare(dto.currentPassword, user.password);
    // 400 ไม่ใช่ 401 — session ยังใช้ได้ปกติ แค่พิมพ์รหัสเดิมผิด
    // (หน้าเว็บถือว่า 401 = หมดอายุ แล้วเด้งไปหน้า login ทำให้พิมพ์ผิดทีเดียวหลุดออกจากระบบ)
    if (!currentMatches) {
      throw new BadRequestException('รหัสผ่านปัจจุบันไม่ถูกต้อง');
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('รหัสผ่านใหม่ต้องต่างจากรหัสเดิม');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS), mustChangePassword: false },
    });
    return { ok: true };
  }
}
