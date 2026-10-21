import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EventsGateway } from '../events/events.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { CreateMenuOptionDto } from './dto/create-menu-option.dto';
import { UpdateMenuOptionDto } from './dto/update-menu-option.dto';

const MENU_ITEM_INCLUDE = {
  category: true,
  // วัตถุดิบหลักของเมนู — หน้าจัดการต้องรู้ว่าเมนูนี้หมดเพราะวัตถุดิบตัวไหน
  ingredients: { include: { ingredient: true } },
  // เรียงเนื้อสัตว์ขึ้นก่อน แล้วค่อยตัวเลือกเพิ่มเติม ตามลำดับใน enum
  // ส่งวัตถุดิบมาด้วย หน้าจัดการจะได้บอกได้ว่าตัวเลือกนี้ผูกกับอะไรและของหมดหรือยัง
  options: {
    include: { ingredient: true },
    orderBy: [{ group: 'asc' }, { name: 'asc' }],
  },
} satisfies Prisma.MenuItemInclude;

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

    const { ingredientIds, ...data } = dto;
    try {
      return this.notifyMenuChanged(
        await this.prisma.menuItem.create({
          data: {
            ...data,
            ingredients: {
              create: (ingredientIds ?? []).map((ingredientId) => ({ ingredientId })),
            },
          },
          include: MENU_ITEM_INCLUDE,
        }),
      );
    } catch (e) {
      throw this.mapPrismaError(e);
    }
  }

  findAll(params?: { categoryId?: string; onlyAvailable?: boolean }) {
    return this.prisma.menuItem.findMany({
      where: {
        categoryId: params?.categoryId,
        ...(params?.onlyAvailable
          ? {
              isAvailable: true,
              ingredients: { none: { ingredient: { isAvailable: false } } },
            }
          : {}),
      },
      include: MENU_ITEM_INCLUDE,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.menuItem.findUnique({
      where: { id },
      include: MENU_ITEM_INCLUDE,
    });
    if (!item) {
      throw new NotFoundException(`ไม่พบเมนู id: ${id}`);
    }
    return item;
  }

  async update(id: string, dto: UpdateMenuItemDto) {
    await this.findOne(id); // throws 404 if not found
    const { ingredientIds, ...data } = dto;
    try {
      return this.notifyMenuChanged(
        await this.prisma.menuItem.update({
          where: { id },
          data: {
            ...data,
            // ส่งมา = แทนที่ทั้งชุด ไม่ส่ง = ไม่แตะวัตถุดิบเดิม
            ...(ingredientIds === undefined
              ? {}
              : {
                  ingredients: {
                    deleteMany: {},
                    create: ingredientIds.map((ingredientId) => ({ ingredientId })),
                  },
                }),
          },
          include: MENU_ITEM_INCLUDE,
        }),
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
    await this.assertOptionNameFree(menuItemId, dto.name);
    const isAvailable = this.resolveOptionAvailability(dto.ingredientId, dto.isAvailable);
    try {
      return this.notifyMenuChanged(
        await this.prisma.menuOption.create({
          data: { menuItemId, ...dto, isAvailable },
        }),
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
    const option = await this.findOptionOrThrow(menuItemId, optionId);
    if (dto.name !== undefined && dto.name !== option.name) {
      await this.assertOptionNameFree(menuItemId, dto.name, optionId);
    }
    const ingredientId =
      dto.ingredientId === undefined ? option.ingredientId : dto.ingredientId;
    const isAvailable = this.resolveOptionAvailability(ingredientId, dto.isAvailable);
    try {
      return this.notifyMenuChanged(
        await this.prisma.menuOption.update({
          where: { id: optionId },
          data: { ...dto, isAvailable },
        }),
      );
    } catch (e) {
      throw this.mapPrismaError(e);
    }
  }

  /**
   * ลบตัวเลือก — ที่เคยถูกสั่งแล้วลบจริงไม่ได้ (order_item_options อ้างอยู่)
   * จึงซ่อนแทน: ปิดขาย + ปลดวัตถุดิบ หน้าจัดการ/ลูกค้าจะไม่เห็นอีก ประวัติออเดอร์ยังอยู่ครบ
   */
  async removeOption(menuItemId: string, optionId: string) {
    await this.findOptionOrThrow(menuItemId, optionId);
    try {
      return this.notifyMenuChanged(
        await this.prisma.menuOption.delete({ where: { id: optionId } }),
      );
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2003'
      ) {
        return this.notifyMenuChanged(
          await this.prisma.menuOption.update({
            where: { id: optionId },
            data: { isAvailable: false, ingredientId: null },
          }),
        );
      }
      throw e;
    }
  }

  /**
   * ตัวเลือกชื่อซ้ำในเมนูเดียวกัน ลูกค้า/ครัวแยกไม่ออกว่าเลือกตัวไหน
   * ไม่นับตัวที่ถูกลบแบบซ่อน (ปิดขาย + ไม่ผูกวัตถุดิบ ดู removeOption) — ชื่อนั้นใช้ใหม่ได้
   */
  private async assertOptionNameFree(menuItemId: string, name: string, exceptId?: string) {
    const taken = await this.prisma.menuOption.findFirst({
      where: {
        menuItemId,
        name: { equals: name, mode: 'insensitive' },
        id: exceptId ? { not: exceptId } : undefined,
        OR: [{ isAvailable: true }, { ingredientId: { not: null } }],
      },
      select: { id: true },
    });
    if (taken) {
      throw new ConflictException(`เมนูนี้มีตัวเลือก "${name}" อยู่แล้ว`);
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

  /**
   * ตัวเลือกที่ผูกวัตถุดิบเปิด/ปิดที่วัตถุดิบที่เดียว — ปิดที่ตัวเลือกด้วยจะได้สวิตช์ซ้อนสองที่
   * แล้วลืมเปิดคืนอันใดอันหนึ่ง ผูกแล้วจึงเปิดตัวเลือกให้เสมอ และไม่ยอมให้ปิดตรงนี้
   */
  private resolveOptionAvailability(
    ingredientId: string | null | undefined,
    isAvailable: boolean | undefined,
  ) {
    if (!ingredientId) return isAvailable;
    if (isAvailable === false) {
      throw new BadRequestException(
        'ตัวเลือกนี้ผูกกับวัตถุดิบแล้ว ให้ปิดที่หน้า "วัตถุดิบ" แทน',
      );
    }
    return true;
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
