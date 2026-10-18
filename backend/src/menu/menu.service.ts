import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EventsGateway } from '../events/events.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { CreateMenuOptionDto } from './dto/create-menu-option.dto';
import { UpdateMenuOptionDto } from './dto/update-menu-option.dto';

@Injectable()
export class MenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
  ) {}

  async create(dto: CreateMenuItemDto) {
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
      select: { id: true },
    });
    if (!category) {
      throw new NotFoundException(`ไม่พบหมวดหมู่ id: ${dto.categoryId}`);
    }

    try {
      return this.notifyMenuChanged(
        await this.prisma.menuItem.create({ data: dto }),
      );
    } catch (e) {
      throw this.mapPrismaError(e);
    }
  }

  findAll(params?: { categoryId?: string; onlyAvailable?: boolean }) {
    return this.prisma.menuItem.findMany({
      where: {
        categoryId: params?.categoryId,
        isAvailable: params?.onlyAvailable ? true : undefined,
      },
      // เรียงเนื้อสัตว์ขึ้นก่อน แล้วค่อยตัวเลือกเพิ่มเติม ตามลำดับใน enum
      include: {
        category: true,
        // ส่งวัตถุดิบมาด้วย หน้าจัดการจะได้บอกได้ว่าตัวเลือกนี้ผูกกับอะไรและของหมดหรือยัง
        options: {
          include: { ingredient: true },
          orderBy: [{ group: 'asc' }, { name: 'asc' }],
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.menuItem.findUnique({
      where: { id },
      // เรียงเนื้อสัตว์ขึ้นก่อน แล้วค่อยตัวเลือกเพิ่มเติม ตามลำดับใน enum
      include: {
        category: true,
        // ส่งวัตถุดิบมาด้วย หน้าจัดการจะได้บอกได้ว่าตัวเลือกนี้ผูกกับอะไรและของหมดหรือยัง
        options: {
          include: { ingredient: true },
          orderBy: [{ group: 'asc' }, { name: 'asc' }],
        },
      },
    });
    if (!item) {
      throw new NotFoundException(`ไม่พบเมนู id: ${id}`);
    }
    return item;
  }

  async update(id: string, dto: UpdateMenuItemDto) {
    await this.findOne(id); // throws 404 if not found
    try {
      return this.notifyMenuChanged(
        await this.prisma.menuItem.update({ where: { id }, data: dto }),
      );
    } catch (e) {
      throw this.mapPrismaError(e);
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    try {
      return this.notifyMenuChanged(
        await this.prisma.menuItem.delete({ where: { id } }),
      );
    } catch (e) {
      throw this.mapItemDeleteError(e);
    }
  }

  async createOption(menuItemId: string, dto: CreateMenuOptionDto) {
    await this.findOne(menuItemId);
    try {
      return this.notifyMenuChanged(
        await this.prisma.menuOption.create({ data: { menuItemId, ...dto } }),
      );
    } catch (e) {
      throw this.mapPrismaError(e);
    }
  }

  async updateOption(
    menuItemId: string,
    optionId: string,
    dto: UpdateMenuOptionDto,
  ) {
    await this.findOptionOrThrow(menuItemId, optionId);
    try {
      return this.notifyMenuChanged(
        await this.prisma.menuOption.update({
          where: { id: optionId },
          data: dto,
        }),
      );
    } catch (e) {
      throw this.mapPrismaError(e);
    }
  }

  async removeOption(menuItemId: string, optionId: string) {
    await this.findOptionOrThrow(menuItemId, optionId);
    try {
      return this.notifyMenuChanged(
        await this.prisma.menuOption.delete({ where: { id: optionId } }),
      );
    } catch (e) {
      throw this.mapOptionDeleteError(e);
    }
  }

  /**
   * เมนู/ตัวเลือกเปลี่ยน (ปิดขาย แก้ราคา ลบ) — ให้ทุกจอดึงเมนูใหม่
   * ไม่งั้นลูกค้าที่เปิดหน้าเมนูค้างไว้ยังกดสั่งของที่ปิดไปแล้วได้ แล้วไปเจอ error ตอนส่งออเดอร์
   */
  private notifyMenuChanged<T>(result: T): T {
    this.events.emitToEveryone('menu.updated', { at: new Date().toISOString() });
    return result;
  }

  private async findOptionOrThrow(menuItemId: string, optionId: string) {
    const option = await this.prisma.menuOption.findUnique({
      where: { id: optionId },
    });
    if (option?.menuItemId !== menuItemId) {
      throw new NotFoundException(`ไม่พบตัวเลือก id: ${optionId} ในเมนูนี้`);
    }
    return option;
  }

  /** เมนูที่เคยถูกสั่งจะมี order_items อ้างอยู่ ลบไม่ได้ — บอกทางออกแทนที่จะปล่อยเป็น 500 */
  private mapItemDeleteError(e: unknown): Error {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2003'
    ) {
      return new BadRequestException(
        'ลบไม่ได้: เมนูนี้ถูกสั่งไปแล้วในออเดอร์ที่มีอยู่ ให้ปิด "พร้อมจำหน่าย" แทนการลบ',
      );
    }
    return e as Error;
  }

  private mapOptionDeleteError(e: unknown): Error {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2003'
    ) {
      return new BadRequestException(
        'ลบไม่ได้: ตัวเลือกนี้ถูกใช้ในออเดอร์ที่มีอยู่แล้ว ให้ปิดขาย (isAvailable: false) แทนการลบ',
      );
    }
    return e as Error;
  }

  private mapPrismaError(e: unknown): Error {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2003'
    ) {
      return new BadRequestException(
        'ข้อมูลที่อ้างอิงไม่ถูกต้อง เช่น categoryId หรือ ingredientId ไม่มีอยู่จริง',
      );
    }

    return e as Error;
  }
}
