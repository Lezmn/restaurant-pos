import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCategoryDto) {
    try {
      return await this.prisma.category.create({ data: dto });
    } catch (e) {
      throw this.mapPrismaError(e, dto.name);
    }
  }

  findAll() {
    return this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { menuItems: true } } },
    });
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { menuItems: true },
    });
    if (!category) {
      throw new NotFoundException(`ไม่พบหมวดหมู่ id: ${id}`);
    }
    return category;
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.findOne(id);
    try {
      return await this.prisma.category.update({ where: { id }, data: dto });
    } catch (e) {
      throw this.mapPrismaError(e, dto.name);
    }
  }

  async remove(id: string) {
    const category = await this.findOne(id);
    if (category.menuItems.length > 0) {
      throw new ConflictException(
        `ลบไม่ได้: หมวดหมู่นี้ยังมีเมนู ${category.menuItems.length} รายการผูกอยู่ ต้องย้ายหรือลบเมนูก่อน`,
      );
    }
    return this.prisma.category.delete({ where: { id } });
  }

  private mapPrismaError(e: unknown, name?: string): Error {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002'
    ) {
      return new ConflictException(`มีหมวดหมู่ชื่อ "${name}" อยู่แล้ว`);
    }
    return e as Error;
  }
}
