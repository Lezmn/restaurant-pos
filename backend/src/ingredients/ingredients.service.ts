import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EventsGateway } from '../events/events.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIngredientDto } from './dto/create-ingredient.dto';
import { UpdateIngredientDto } from './dto/update-ingredient.dto';

const INGREDIENT_INCLUDE = {
  _count: { select: { menuOptions: true, menuItems: true } },
} as const;

@Injectable()
export class IngredientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
  ) {}

  async create(dto: CreateIngredientDto) {
    try {
      const ingredient = await this.prisma.ingredient.create({
        data: { name: dto.name.trim(), isAvailable: dto.isAvailable },
        include: INGREDIENT_INCLUDE,
      });
      this.emitMenuChanged();
      return ingredient;
    } catch (e) {
      throw this.mapPrismaError(e, dto.name);
    }
  }

  findAll() {
    return this.prisma.ingredient.findMany({
      orderBy: { name: 'asc' },
      include: INGREDIENT_INCLUDE,
    });
  }

  async findOne(id: string) {
    const ingredient = await this.prisma.ingredient.findUnique({
      where: { id },
      include: INGREDIENT_INCLUDE,
    });
    if (!ingredient) {
      throw new NotFoundException(`ไม่พบวัตถุดิบ id: ${id}`);
    }
    return ingredient;
  }

  async update(id: string, dto: UpdateIngredientDto) {
    await this.findOne(id);
    try {
      const ingredient = await this.prisma.ingredient.update({
        where: { id },
        data: {
          ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
          ...(dto.isAvailable === undefined
            ? {}
            : { isAvailable: dto.isAvailable }),
        },
        include: INGREDIENT_INCLUDE,
      });
      // ปิดวัตถุดิบ = เมนูที่ใช้วัตถุดิบนี้เปลี่ยนตัวเลือกทันที ต้องบอกจอลูกค้าที่เปิดค้างไว้ด้วย
      this.emitMenuChanged();
      return ingredient;
    } catch (e) {
      throw this.mapPrismaError(e, dto.name);
    }
  }

  /**
   * ลบวัตถุดิบพร้อมเก็บกวาดตัวเลือกเมนูที่ผูกอยู่ในคราวเดียว
   * - ตัวเลือกที่ยังไม่เคยถูกสั่ง → ลบทิ้ง
   * - ตัวเลือกที่อยู่ในออเดอร์แล้ว (ลบไม่ได้เพราะ FK) → ปิดขาย + ปลดวัตถุดิบ ประวัติออเดอร์ยังอยู่ครบ
   */
  async remove(id: string) {
    await this.findOne(id);
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const deleted = await tx.menuOption.deleteMany({
          where: { ingredientId: id, orderItemOptions: { none: {} } },
        });
        const disabled = await tx.menuOption.updateMany({
          where: { ingredientId: id },
          data: { ingredientId: null, isAvailable: false },
        });
        const ingredient = await tx.ingredient.delete({ where: { id } });
        return {
          ...ingredient,
          deletedOptions: deleted.count,
          disabledOptions: disabled.count,
        };
      });
      this.emitMenuChanged();
      return result;
    } catch (e) {
      // มีคนสั่งตัวเลือกนั้นเข้ามาพอดีระหว่างลบ → FK ชน ให้ลองใหม่
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2003'
      ) {
        throw new ConflictException(
          'ลบไม่สำเร็จ: มีออเดอร์ใช้ตัวเลือกของวัตถุดิบนี้เข้ามาระหว่างลบ กรุณาลองใหม่',
        );
      }
      throw e;
    }
  }

  /** เมนู/ตัวเลือกเปลี่ยน — ให้ทุกจอ (พนักงาน + ลูกค้าที่เปิดค้างไว้) ดึงเมนูใหม่ */
  private emitMenuChanged() {
    this.events.emitToEveryone('menu.updated', { at: new Date().toISOString() });
  }

  private mapPrismaError(e: unknown, name?: string): Error {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002'
    ) {
      return new ConflictException(`มีวัตถุดิบชื่อ "${name}" อยู่แล้ว`);
    }
    return e as Error;
  }
}
