import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma, TableStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableDto } from './dto/update-table.dto';

const OPEN_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.PREPARING,
  OrderStatus.SERVED,
];

@Injectable()
export class TablesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTableDto) {
    try {
      return await this.prisma.restaurantTable.create({
        data: { number: dto.number, seats: dto.seats ?? 4 },
      });
    } catch (e) {
      throw this.mapPrismaError(e, dto.number);
    }
  }

  findAll(status?: TableStatus) {
    return this.prisma.restaurantTable.findMany({
      where: { status },
      orderBy: { number: 'asc' },
    });
  }

  async findOne(id: string) {
    const table = await this.prisma.restaurantTable.findUnique({
      where: { id },
      include: {
        orders: {
          where: { status: { in: OPEN_ORDER_STATUSES } },
          include: { items: { include: { menuItem: true } } },
        },
      },
    });
    if (!table) {
      throw new NotFoundException(`ไม่พบโต๊ะ id: ${id}`);
    }
    return table;
  }

  async update(id: string, dto: UpdateTableDto) {
    await this.assertExists(id);
    try {
      return await this.prisma.restaurantTable.update({
        where: { id },
        data: dto,
      });
    } catch (e) {
      throw this.mapPrismaError(e, dto.number);
    }
  }

  async remove(id: string) {
    const table = await this.findOne(id);
    if (table.orders.length > 0) {
      throw new ConflictException(
        `ลบไม่ได้: โต๊ะนี้ยังมีออเดอร์ที่เปิดอยู่ ${table.orders.length} รายการ ต้องปิดออเดอร์ก่อน`,
      );
    }
    try {
      return await this.prisma.restaurantTable.delete({ where: { id } });
    } catch (e) {
      // โต๊ะที่เคยมีออเดอร์/บิล/QR session อ้างอยู่ ลบไม่ได้ (ต้องเก็บประวัติการขายไว้)
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2003'
      ) {
        throw new ConflictException(
          'ลบไม่ได้: โต๊ะนี้มีประวัติออเดอร์หรือใบเสร็จอยู่ ซึ่งต้องเก็บไว้เป็นหลักฐานการขาย',
        );
      }
      throw e;
    }
  }

  private async assertExists(id: string) {
    const table = await this.prisma.restaurantTable.findUnique({
      where: { id },
    });
    if (!table) {
      throw new NotFoundException(`ไม่พบโต๊ะ id: ${id}`);
    }
    return table;
  }

  private mapPrismaError(e: unknown, number?: number): Error {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002'
    ) {
      return new ConflictException(`มีโต๊ะหมายเลข ${number} อยู่แล้ว`);
    }
    return e as Error;
  }
}
