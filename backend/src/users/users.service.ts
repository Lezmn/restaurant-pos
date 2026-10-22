import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { EventsGateway } from '../events/events.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
  ) {}

  async create(dto: CreateUserDto) {
    const password = await bcrypt.hash(dto.password, 12);
    try {
      return await this.prisma.user.create({
        data: { name: dto.name, email: dto.email, password, role: dto.role },
        select: USER_SELECT,
      });
    } catch (e) {
      throw this.mapPrismaError(e);
    }
  }

  findAll(role?: Role) {
    return this.prisma.user.findMany({
      where: { role },
      select: USER_SELECT,
      // คนที่ยังทำงานอยู่ขึ้นก่อน คนที่ปิดใช้งานแล้วไปอยู่ท้าย
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });
    if (!user) {
      throw new NotFoundException(`ไม่พบผู้ใช้ id: ${id}`);
    }
    return user;
  }

  async update(id: string, dto: UpdateUserDto, currentUserId: string) {
    const user = await this.findOne(id);

    // แก้บัญชีตัวเอง: ห้ามลดสิทธิ์/ปิดตัวเอง — กดพลาดทีเดียวหลุดจากหน้าจัดการทันทีและกลับเข้ามาแก้ไม่ได้
    if (id === currentUserId) {
      if (dto.role !== undefined && dto.role !== user.role) {
        throw new BadRequestException('เปลี่ยนสิทธิ์ของบัญชีตัวเองไม่ได้ — ให้ ADMIN อีกคนเปลี่ยนให้');
      }
      if (dto.isActive === false) {
        throw new BadRequestException('ปิดใช้งานบัญชีตัวเองไม่ได้');
      }
      if (dto.logoutEverywhere) {
        throw new BadRequestException('สั่งออกจากระบบทุกเครื่องกับบัญชีตัวเองไม่ได้');
      }
    }

    const losesAdmin =
      user.role === Role.ADMIN &&
      user.isActive &&
      ((dto.role !== undefined && dto.role !== Role.ADMIN) || dto.isActive === false);
    if (losesAdmin) await this.assertAnotherActiveAdmin(id);

    const data: Prisma.UserUpdateInput = {
      name: dto.name,
      email: dto.email,
      role: dto.role,
      isActive: dto.isActive,
      ...(dto.logoutEverywhere ? { tokenVersion: { increment: 1 } } : {}),
    };
    if (dto.password) {
      data.password = await bcrypt.hash(dto.password, 12);
    }

    try {
      const updated = await this.prisma.user.update({
        where: { id },
        data,
        select: USER_SELECT,
      });
      // token เก่าใช้ไม่ได้แล้ว (JwtStrategy เช็ค) — ตัด socket ด้วย ไม่งั้นเครื่องที่ถูกเตะยังได้ event ต่อ
      if (dto.logoutEverywhere || dto.isActive === false) this.events.disconnectUser(id);
      return updated;
    } catch (e) {
      throw this.mapPrismaError(e);
    }
  }

  async remove(id: string, currentUserId: string) {
    if (id === currentUserId) {
      throw new BadRequestException('ลบบัญชีของตัวเองไม่ได้');
    }
    const user = await this.findOne(id);
    if (user.role === Role.ADMIN && user.isActive) {
      await this.assertAnotherActiveAdmin(id);
    }
    try {
      await this.prisma.user.delete({ where: { id } });
    } catch (e) {
      // เคยปิดยอดลิ้นชัก/เบิกเงิน — ลบแล้วประวัติจะไม่รู้ว่าใครทำ ให้ปิดใช้งานแทน
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
        throw new BadRequestException(
          'ลบไม่ได้: บัญชีนี้มีประวัติปิดยอดหรือเบิกเงินอยู่ — ให้ "ปิดใช้งาน" แทน',
        );
      }
      throw e;
    }
    this.events.disconnectUser(id);
    // คืนผู้ใช้ที่ลบไป (ไม่มี password) — ตอบ body ว่างแล้ว client ที่ parse JSON จะพัง
    return user;
  }

  /** ร้านต้องมี ADMIN ที่ใช้งานได้อย่างน้อย 1 คนเสมอ ไม่งั้นไม่มีใครเข้าหน้าจัดการ/เพิ่มพนักงานได้อีก */
  private async assertAnotherActiveAdmin(exceptId: string) {
    const others = await this.prisma.user.count({
      where: { role: Role.ADMIN, isActive: true, id: { not: exceptId } },
    });
    if (others === 0) {
      throw new BadRequestException(
        'ต้องมี ADMIN ที่ใช้งานได้อย่างน้อย 1 คน — เพิ่ม ADMIN คนใหม่ก่อน แล้วค่อยเปลี่ยนคนนี้',
      );
    }
  }

  private mapPrismaError(e: unknown): Error {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002'
    ) {
      return new BadRequestException('อีเมลนี้ถูกใช้แล้ว');
    }
    return e as Error;
  }
}
