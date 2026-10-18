import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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
      orderBy: { name: 'asc' },
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

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);

    const data: Prisma.UserUpdateInput = {
      name: dto.name,
      email: dto.email,
      role: dto.role,
    };
    if (dto.password) {
      data.password = await bcrypt.hash(dto.password, 12);
    }

    try {
      return await this.prisma.user.update({
        where: { id },
        data,
        select: USER_SELECT,
      });
    } catch (e) {
      throw this.mapPrismaError(e);
    }
  }

  async remove(id: string, currentUserId: string) {
    if (id === currentUserId) {
      throw new BadRequestException('ลบบัญชีของตัวเองไม่ได้');
    }
    await this.findOne(id);
    await this.prisma.user.delete({ where: { id } });
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
