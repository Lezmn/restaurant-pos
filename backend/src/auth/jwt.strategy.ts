import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

export type AuthenticatedUser = { id: string; email: string; name: string; role: Role };
/** tv ไม่มี = token ที่ออกก่อนมีระบบนี้ ถือเป็นรุ่น 0 (deploy แล้วทุกเครื่องไม่ต้อง login ใหม่) */
export type JwtPayload = { sub: string; tv?: number };

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private readonly prisma: PrismaService) {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) throw new Error('JWT_SECRET is required');
    super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), ignoreExpiration: false, secretOrKey: secret });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, role: true, isActive: true, tokenVersion: true },
    });
    // ปิดใช้งาน หรือถูกสั่งออกจากระบบทุกเครื่อง = token ที่ยังไม่หมดอายุก็ใช้ต่อไม่ได้ทันที
    if (!user?.isActive || (payload.tv ?? 0) !== user.tokenVersion) {
      throw new UnauthorizedException();
    }
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }
}
