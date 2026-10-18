import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderStatus,
  TableStatus,
  MenuItem,
  Prisma,
  TableSessionStatus,
} from '@prisma/client';
import { EventsGateway } from '../events/events.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { closeSessionIfSettled } from '../table-sessions/session-settlement';
import { TableSessionsService } from '../table-sessions/table-sessions.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { FindOrdersQueryDto } from './dto/find-orders-query.dto';
import { OrderItemInputDto } from './dto/order-item-input.dto';

const ORDER_INCLUDE = {
  table: true,
  tableSession: {
    select: {
      id: true,
      status: true,
      openedAt: true,
      closedAt: true,
      expiresAt: true,
      tableId: true,
    },
  },
  items: { include: { menuItem: true, selectedOptions: { include: { menuOption: true } } } },
} as const;

/** ตัวเลือกเมนูพร้อมวัตถุดิบ — ต้องรู้ว่าวัตถุดิบหมดหรือยังก่อนรับออเดอร์ */
const MENU_ITEM_WITH_OPTIONS = {
  options: { include: { ingredient: true } },
} as const;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    private readonly tableSessions: TableSessionsService,
  ) {}

  async create(dto: CreateOrderDto) {
    const table = await this.prisma.restaurantTable.findUnique({
      where: { id: dto.tableId },
    });
    if (!table) {
      throw new NotFoundException(`ไม่พบโต๊ะ id: ${dto.tableId}`);
    }

    const menuItems = await this.prisma.menuItem.findMany({
      where: { id: { in: dto.items.map((i) => i.menuItemId) } },
      include: MENU_ITEM_WITH_OPTIONS,
    });
    this.assertAllMenuItemsExistAndAvailable(dto.items, menuItems);

    // ใช้ transaction: สร้าง order + item ทั้งหมด และอัปเดตสถานะโต๊ะ
    // ต้องสำเร็จพร้อมกันทั้งหมด ถ้าล้มเหลวจุดใดจุดหนึ่งให้ rollback ทั้งหมด
    const order = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // โต๊ะที่เปิด QR session ไว้แล้วจะเป็น OCCUPIED อยู่ก่อน — พนักงานต้องสั่งเพิ่ม
      // ให้โต๊ะนั้นได้ และออเดอร์ต้องผูกกับ session เดิม ไม่งั้นจะไม่เข้าบิลของโต๊ะ
      const openSession = await tx.tableSession.findFirst({
        where: { tableId: dto.tableId, status: TableSessionStatus.OPEN },
        select: { id: true },
      });

      if (!openSession) {
        // Claim the table atomically, preventing two open orders for one table.
        const claimedTable = await tx.restaurantTable.updateMany({
          where: { id: dto.tableId, status: TableStatus.AVAILABLE },
          data: { status: TableStatus.OCCUPIED },
        });
        if (claimedTable.count === 0) {
          throw new BadRequestException('โต๊ะนี้ไม่พร้อมรับออเดอร์ใหม่');
        }
      }

      const order = await tx.order.create({
        data: {
          tableId: dto.tableId,
          tableSessionId: openSession?.id,
          items: { create: this.buildOrderItems(dto.items, menuItems) },
        },
        include: ORDER_INCLUDE,
      });

      return order;
    });

    this.emitOrderEvent('order.created', order);
    return order;
  }

  async createFromTableSession(sessionToken: string, items: OrderItemInputDto[]) {
    // ใช้กติกาหมดอายุชุดเดียวกับหน้าลูกค้า (ยังมียอดค้างจ่าย = ยังไม่หมดอายุ)
    const session = await this.tableSessions.resolveOpenSessionByToken(sessionToken);

    const menuItems = await this.prisma.menuItem.findMany({
      where: { id: { in: items.map((i) => i.menuItemId) } },
      include: MENU_ITEM_WITH_OPTIONS,
    });
    this.assertAllMenuItemsExistAndAvailable(items, menuItems);

    const order = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.restaurantTable.update({
        where: { id: session.tableId },
        data: { status: TableStatus.OCCUPIED },
      });

      return tx.order.create({
        data: {
          tableId: session.tableId,
          tableSessionId: session.id,
          items: { create: this.buildOrderItems(items, menuItems) },
        },
        include: ORDER_INCLUDE,
      });
    });

    this.emitOrderEvent('order.created', order);
    return order;
  }

  findAll(query: FindOrdersQueryDto) {
    return this.prisma.order.findMany({
      where: {
        status: query.status,
        tableId: query.tableId,
        tableSessionId: query.tableSessionId,
      },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: ORDER_INCLUDE,
    });
    if (!order) {
      throw new NotFoundException(`ไม่พบออเดอร์ id: ${id}`);
    }
    return order;
  }

  /** ยอดรวมของออเดอร์ = sum(unitPrice * quantity) ของทุกรายการ */
  async getTotal(id: string) {
    const order = await this.findOne(id);
    const total = order.items.reduce((sum, item) => sum + this.calculateLineTotal(item), 0);
    return { orderId: id, total, itemCount: order.items.length };
  }

  async addItem(orderId: string, dto: OrderItemInputDto) {
    const order = await this.findOne(orderId);
    this.assertOrderIsEditable(order.status);

    const menuItem = await this.prisma.menuItem.findUnique({
      where: { id: dto.menuItemId },
      include: MENU_ITEM_WITH_OPTIONS,
    });
    if (!menuItem?.isAvailable) {
      throw new BadRequestException('เมนูนี้ไม่พร้อมขายหรือไม่มีอยู่จริง');
    }

    await this.prisma.orderItem.create({
      data: {
        orderId,
        menuItemId: dto.menuItemId,
        quantity: dto.quantity,
        unitPrice: menuItem.price,
        note: dto.note,
        selectedOptions: { create: this.resolveSelectedOptions(dto, menuItem) },
      },
    });

    const updated = await this.findOne(orderId);
    this.emitOrderEvent('order.updated', updated);
    return updated;
  }

  async removeItem(orderId: string, orderItemId: string) {
    const order = await this.findOne(orderId);
    this.assertOrderIsEditable(order.status);

    const hasItem = order.items.some((i: { id: string }) => i.id === orderItemId);
    if (!hasItem) {
      throw new NotFoundException(`ไม่พบรายการ id: ${orderItemId} ในออเดอร์นี้`);
    }

    await this.prisma.orderItem.delete({ where: { id: orderItemId } });
    const updated = await this.findOne(orderId);
    this.emitOrderEvent('order.updated', updated);
    return updated;
  }

  async updateStatus(id: string, status: OrderStatus) {
    const order = await this.findOne(id);
    this.assertValidTransition(order.status, status);

    let sessionClosed = false;
    const updated = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // เปลี่ยนเฉพาะถ้าสถานะยังเป็นค่าที่เพิ่งอ่านมา — กันกรณีแคชเชียร์เก็บเงินไปพอดี
      // แล้วครัวกดยกเลิกทับ ได้ออเดอร์ CANCELLED ที่มี payment ผูกอยู่
      const changed = await tx.order.updateMany({
        where: { id, status: order.status, paymentId: null },
        data: { status },
      });
      if (changed.count === 0) {
        throw new ConflictException(
          'ออเดอร์นี้เพิ่งถูกเปลี่ยนสถานะหรือเก็บเงินไปแล้ว กรุณารีเฟรชแล้วลองใหม่',
        );
      }

      // การจ่ายเงินใช้ PaymentsService; ตรงนี้ดูแลแค่กรณียกเลิก
      if (status === OrderStatus.CANCELLED) {
        if (order.tableSessionId) {
          // ยกเลิกใบสุดท้ายที่ค้างจ่าย หลังจากแยกบิลจ่ายใบอื่นไปแล้ว = โต๊ะนี้จบแล้ว
          sessionClosed = await closeSessionIfSettled(tx, order.tableSessionId, {
            requirePaidOrder: true,
          });
        }
        await this.releaseTableIfIdle(tx, order.tableId);
      }

      return tx.order.findUniqueOrThrow({ where: { id }, include: ORDER_INCLUDE });
    });

    this.emitOrderEvent('order.updated', updated);
    if (sessionClosed) {
      this.events.emitToStaffAndSession(updated.tableSessionId, 'table-session.closed', {
        id: updated.tableSessionId,
        status: TableSessionStatus.CLOSED,
        tableId: updated.tableId,
      });
    }
    return updated;
  }

  /** แจ้งครัว/POS และลูกค้าโต๊ะนั้นว่าออเดอร์เปลี่ยน — ส่งแค่ id/สถานะ ให้ client refetch เอง */
  private emitOrderEvent(
    event: 'order.created' | 'order.updated',
    order: { id: string; status: OrderStatus; tableId: string; tableSessionId: string | null },
  ) {
    this.events.emitToStaffAndSession(order.tableSessionId, event, {
      id: order.id,
      status: order.status,
      tableId: order.tableId,
      tableSessionId: order.tableSessionId,
    });
  }

  /**
   * คืนโต๊ะให้ว่างหลังยกเลิกออเดอร์ — เฉพาะเมื่อโต๊ะไม่มีอะไรค้างจริง ๆ
   * ถ้ายังมี QR session เปิดอยู่ ลูกค้ายังนั่งอยู่ (สั่งเพิ่มได้) ห้ามปล่อยโต๊ะ
   * ถ้าเป็นออเดอร์ walk-in ต้องไม่เหลือออเดอร์อื่นที่ยังไม่จบบนโต๊ะนี้
   */
  private async releaseTableIfIdle(tx: Prisma.TransactionClient, tableId: string) {
    const openSession = await tx.tableSession.findFirst({
      where: { tableId, status: TableSessionStatus.OPEN },
      select: { id: true },
    });
    if (openSession) return;

    const activeOrderCount = await tx.order.count({
      where: {
        tableId,
        status: { notIn: [OrderStatus.PAID, OrderStatus.CANCELLED] },
      },
    });
    if (activeOrderCount > 0) return;

    await tx.restaurantTable.update({
      where: { id: tableId },
      data: { status: TableStatus.AVAILABLE },
    });
  }

  /**
   * ครัวกด "ทำเสร็จเรียบร้อย" = ยกให้ลูกค้าแล้ว เอาออกจากบอร์ดถาวร
   * แยกจาก status เพราะออเดอร์ยังต้องอยู่ในบิลรอเก็บเงิน (ยังเป็น SERVED)
   */
  async markCleared(id: string) {
    const order = await this.findOne(id);
    if (order.status !== OrderStatus.SERVED) {
      throw new BadRequestException(
        'เคลียร์ออกจากบอร์ดได้เฉพาะออเดอร์ที่เสิร์ฟแล้ว',
      );
    }
    if (order.clearedAt) return order;

    const updated = await this.prisma.order.update({
      where: { id },
      data: { clearedAt: new Date() },
      include: ORDER_INCLUDE,
    });

    this.emitOrderEvent('order.updated', updated);
    return updated;
  }

  private assertAllMenuItemsExistAndAvailable(
    requested: OrderItemInputDto[],
    found: { id: string; isAvailable: boolean }[],
  ) {
    for (const item of requested) {
      const menuItem = found.find((m) => m.id === item.menuItemId);
      if (!menuItem) {
        throw new BadRequestException(`ไม่พบเมนู id: ${item.menuItemId}`);
      }
      if (!menuItem.isAvailable) {
        throw new BadRequestException(`เมนู id: ${item.menuItemId} ไม่พร้อมขายตอนนี้`);
      }
    }
  }

  /** ตรวจว่าตัวเลือกเป็นของเมนูนี้และยังพร้อมขาย */
  private resolveSelectedOptions(
    requested: OrderItemInputDto,
    menuItem: Prisma.MenuItemGetPayload<{
      include: typeof MENU_ITEM_WITH_OPTIONS;
    }>,
  ) {
    const selectedIds = requested.optionIds ?? [];
    const selected = selectedIds.map((id) => {
      const option = menuItem.options.find((candidate) => candidate.id === id);
      if (!option?.isAvailable) {
        throw new BadRequestException(`ตัวเลือก id: ${id} ไม่ถูกต้องหรือไม่พร้อมขาย`);
      }
      // วัตถุดิบหมด = สั่งไม่ได้ ถึงตัวเลือกจะยังเปิดอยู่ก็ตาม
      if (option.ingredient && !option.ingredient.isAvailable) {
        throw new BadRequestException(
          `"${option.name}" หมดชั่วคราว (วัตถุดิบ: ${option.ingredient.name})`,
        );
      }
      return option;
    });

    return selected.map((option) => ({
      menuOptionId: option.id,
      name: option.name,
      price: option.price,
    }));
  }

  private buildOrderItems(
    items: OrderItemInputDto[],
    menuItems: Prisma.MenuItemGetPayload<{
      include: typeof MENU_ITEM_WITH_OPTIONS;
    }>[],
  ) {
    return items.map((item) => {
      const menuItem = menuItems.find(
        (m: MenuItem) => m.id === item.menuItemId,
      )!;
      const selectedOptions = this.resolveSelectedOptions(item, menuItem);
      return {
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        unitPrice: menuItem.price,
        note: item.note,
        selectedOptions: { create: selectedOptions },
      };
    });
  }

  private calculateLineTotal(item: {
    unitPrice: Prisma.Decimal;
    quantity: number;
    selectedOptions: { price: Prisma.Decimal }[];
  }) {
    const optionTotal = item.selectedOptions.reduce(
      (sum, option) => sum + Number(option.price),
      0,
    );
    return (Number(item.unitPrice) + optionTotal) * item.quantity;
  }

  private assertOrderIsEditable(status: OrderStatus) {
    if (status === OrderStatus.PAID || status === OrderStatus.CANCELLED) {
      throw new BadRequestException('ออเดอร์นี้ปิดแล้ว ไม่สามารถแก้ไขรายการได้');
    }
  }

  /** กำหนดลำดับสถานะที่ถูกต้อง กัน bug เปลี่ยนสถานะข้ามขั้นหรือย้อนกลับมั่ว ๆ */
  private assertValidTransition(current: OrderStatus, next: OrderStatus) {
    const allowed: Record<OrderStatus, OrderStatus[]> = {
      PENDING: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
      PREPARING: [OrderStatus.SERVED, OrderStatus.CANCELLED],
      SERVED: [OrderStatus.CANCELLED],
      PAID: [],
      CANCELLED: [],
    };

    if (!allowed[current].includes(next)) {
      throw new BadRequestException(
        `ไม่สามารถเปลี่ยนสถานะจาก ${current} ไปเป็น ${next} ได้`,
      );
    }
  }
}
