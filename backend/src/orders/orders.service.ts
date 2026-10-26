import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  OrderStatus,
  TableStatus,
  MenuItem,
  MenuOptionGroup,
  Prisma,
  TableSessionStatus,
} from '@prisma/client';
import { startOfDay } from '../common/date-range.util';
import { EventsGateway } from '../events/events.gateway';
import {
  deductStock,
  mergeUsage,
  restoreStock,
  stockUsageOf,
  toStockUsage,
} from '../ingredients/ingredient-stock';
import { PrismaService } from '../prisma/prisma.service';
import { closeSessionIfSettled } from '../table-sessions/session-settlement';
import { TableSessionsService } from '../table-sessions/table-sessions.service';
import { randomBytes } from 'node:crypto';
import { CreateOrderDto } from './dto/create-order.dto';
import { CustomItemInputDto } from './dto/custom-item-input.dto';
import { CreateTakeawayOrderDto } from './dto/create-takeaway-order.dto';
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
      isTakeaway: true,
      takeawayNo: true,
      customerName: true,
    },
  },
  items: { include: { menuItem: true, selectedOptions: { include: { menuOption: true } } } },
} as const;

/** เมนูและตัวเลือกพร้อมวัตถุดิบ — ต้องรู้ว่าวัตถุดิบหมดหรือยังก่อนรับออเดอร์ */
const MENU_ITEM_WITH_OPTIONS = {
  options: { include: { ingredient: true } },
  ingredients: { include: { ingredient: true } },
} as const;

/**
 * ค่า default ของ GET /orders — ห้ามคืนประวัติทั้งหมด (หน้า Check/ครัว poll ทุก 3 วิ ทุกเครื่อง
 * ยิ่งเปิดร้านนานยิ่งช้า) เอาเฉพาะที่จอพนักงานใช้จริง:
 * - ออเดอร์ของโต๊ะที่เปิดอยู่ (หน้า Check ต้องเห็นทั้งที่จ่าย/ยกเลิกไปแล้วในรอบนี้)
 * - ออเดอร์ที่ยังไม่จบ (บอร์ดครัว)
 * - ออเดอร์ของวันนี้ (หน้ารายการออเดอร์)
 */
const ACTIVE_ORDERS_WHERE = (): Prisma.OrderWhereInput => ({
  OR: [
    { tableSession: { status: TableSessionStatus.OPEN } },
    {
      status: {
        in: [OrderStatus.PENDING, OrderStatus.PREPARING, OrderStatus.SERVED],
      },
    },
    { createdAt: { gte: startOfDay() } },
  ],
});

/** key ของ pg_advisory_xact_lock ตอนเปิดบิลกลับบ้าน (ไม่ชนกับ RECEIPT_NUMBER_LOCK ของ payments) */
const TAKEAWAY_LOCK = 7_420_002;

/** เท่ากับ BILLING_TX_OPTIONS ของ payments — รอคิว connection ได้ 10 วิ, รันได้ 15 วิ */
const ORDER_TX_OPTIONS = { maxWait: 10_000, timeout: 15_000 } as const;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    private readonly tableSessions: TableSessionsService,
  ) {}

  /**
   * transaction ของออเดอร์ (สร้าง/เพิ่ม/ลบรายการ/เปลี่ยนสถานะ ตัด-คืนสต็อก) — ค่า default ของ Prisma (รอ 2 วิ)
   * สั้นไปตอนช่วงเที่ยงหลายโต๊ะสั่งพร้อมกัน connection pool เต็ม แล้วลูกค้าได้ 500 เปล่า ๆ
   * รอได้นานขึ้นแบบเดียวกับงานเงิน และถ้ายังเริ่มไม่ทัน (P2028) ทุกอย่าง rollback แล้ว บอกให้กดส่งใหม่ได้เลย
   */
  private async runOrderTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(fn, ORDER_TX_OPTIONS);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2028') {
        throw new ServiceUnavailableException('ระบบตอบช้าชั่วคราว ยังไม่ได้บันทึกรายการนี้ กรุณากดส่งใหม่อีกครั้ง');
      }
      throw e;
    }
  }

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
    const { items: menuItemsData, usage } = this.buildOrderItems(dto.items, menuItems);
    const itemsData = [...menuItemsData, ...this.buildCustomItems(dto.customItems)];
    this.assertHasItems(itemsData);

    // ใช้ transaction: สร้าง order + item ทั้งหมด ตัดสต็อก และอัปเดตสถานะโต๊ะ
    // ต้องสำเร็จพร้อมกันทั้งหมด ถ้าล้มเหลวจุดใดจุดหนึ่งให้ rollback ทั้งหมด
    let ingredientClosed = false;
    const order = await this.runOrderTransaction(async (tx) => {
      // ออเดอร์ต้องผูกกับ session ที่เปิดอยู่เสมอ — POST /payments เก็บเงินได้เฉพาะออเดอร์ที่มี session
      // ออเดอร์ที่ไม่มี session จะค้างตลอดไป (เก็บเงินไม่ได้ / โต๊ะ OCCUPIED ค้าง)
      // โต๊ะกลับบ้านมีบิลเปิดพร้อมกันหลายใบ — ต้องระบุบิลมาเสมอ ไม่งั้นออเดอร์จะไปเข้าบิลของคนอื่น
      if (table.isTakeaway && !dto.tableSessionId) {
        throw new BadRequestException('สั่งเพิ่มให้บิลกลับบ้านต้องระบุบิล (tableSessionId)');
      }
      const openSession = await tx.tableSession.findFirst({
        where: {
          tableId: dto.tableId,
          status: TableSessionStatus.OPEN,
          ...(table.isTakeaway ? { id: dto.tableSessionId } : {}),
        },
        select: { id: true },
      });

      if (table.isTakeaway && !openSession) {
        throw new ConflictException('บิลกลับบ้านนี้ปิดไปแล้ว — เปิดบิลใหม่ที่หน้า POS');
      }
      if (!openSession) {
        throw new BadRequestException(
          'โต๊ะนี้ยังไม่ได้เปิด หรือเพิ่งปิดบิลไปแล้ว — เปิดโต๊ะก่อนรับออเดอร์',
        );
      }
      if (dto.tableSessionId && dto.tableSessionId !== openSession.id) {
        throw new ConflictException(
          'บิลรอบที่เปิดหน้านี้ไว้ถูกปิดไปแล้ว — ปิดหน้านี้แล้วเปิดรับออเดอร์ใหม่',
        );
      }

      ingredientClosed = await deductStock(tx, usage);

      const order = await tx.order.create({
        data: {
          tableId: dto.tableId,
          tableSessionId: openSession.id,
          items: { create: itemsData },
        },
        include: ORDER_INCLUDE,
      });

      return order;
    });

    this.emitOrderEvent('order.created', order);
    if (ingredientClosed) this.notifyMenuChanged();
    return order;
  }

  /**
   * สั่งกลับบ้าน (หน้า POS) — เปิดบิลกลับบ้านใบใหม่ + ออเดอร์แรก ในทรานแซกชันเดียว
   * บิลอยู่บนโต๊ะเสมือน (isTakeaway) จึงใช้หน้าเก็บเงิน/แยกบิล/ใบเสร็จ/ยกเลิกบิลชุดเดียวกับโต๊ะจริง
   */
  async createTakeaway(dto: CreateTakeawayOrderDto) {
    const menuItems = await this.prisma.menuItem.findMany({
      where: { id: { in: dto.items.map((i) => i.menuItemId) } },
      include: MENU_ITEM_WITH_OPTIONS,
    });
    this.assertAllMenuItemsExistAndAvailable(dto.items, menuItems);
    const { items: menuItemsData, usage } = this.buildOrderItems(dto.items, menuItems);
    const itemsData = [...menuItemsData, ...this.buildCustomItems(dto.customItems)];
    this.assertHasItems(itemsData);

    let ingredientClosed = false;
    const order = await this.runOrderTransaction(async (tx) => {
      // ออกเลขคิวทีละใบ (นับแล้ว +1 สองเครื่องกดพร้อมกันจะได้เลขซ้ำ) — กันสร้างโต๊ะเสมือนซ้อนด้วย
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${TAKEAWAY_LOCK})`;
      const table = await this.ensureTakeawayTable(tx);
      const todayCount = await tx.tableSession.count({
        where: { isTakeaway: true, openedAt: { gte: startOfDay() } },
      });

      const session = await tx.tableSession.create({
        data: {
          tableId: table.id,
          // ไม่มี QR ให้ลูกค้า แต่ token เป็นคอลัมน์บังคับ — สุ่มไว้เหมือนโต๊ะจริง
          token: randomBytes(24).toString('hex'),
          isTakeaway: true,
          takeawayNo: todayCount + 1,
          customerName: dto.customerName || null,
          // ไม่หมดอายุ — บิลปิดเองตอนเก็บเงินครบ
          expiresAt: null,
        },
      });

      ingredientClosed = await deductStock(tx, usage);

      return tx.order.create({
        data: {
          tableId: table.id,
          tableSessionId: session.id,
          items: { create: itemsData },
        },
        include: ORDER_INCLUDE,
      });
    });

    this.events.emitToStaff('table-session.created', {
      id: order.tableSessionId,
      status: TableSessionStatus.OPEN,
      tableId: order.tableId,
    });
    this.emitOrderEvent('order.created', order);
    if (ingredientClosed) this.notifyMenuChanged();
    return order;
  }

  /** โต๊ะเสมือนของกลับบ้าน — มีแถวเดียว สร้างให้ตอนสั่งกลับบ้านครั้งแรก (เรียกภายใต้ TAKEAWAY_LOCK) */
  private async ensureTakeawayTable(tx: Prisma.TransactionClient) {
    const existing = await tx.restaurantTable.findFirst({ where: { isTakeaway: true } });
    if (existing) return existing;

    // เลขโต๊ะเป็น unique — ใช้ 0 (โต๊ะจริงเริ่มที่ 1) ถ้ามีคนใช้ไปแล้วถอยลงไปเรื่อย ๆ
    const lowest = await tx.restaurantTable.findFirst({
      where: { number: { lte: 0 } },
      orderBy: { number: 'asc' },
      select: { number: true },
    });
    return tx.restaurantTable.create({
      data: { number: lowest ? lowest.number - 1 : 0, seats: 0, isTakeaway: true },
    });
  }

  async createFromTableSession(sessionToken: string, items: OrderItemInputDto[]) {
    // ใช้กติกาหมดอายุชุดเดียวกับหน้าลูกค้า (ยังมียอดค้างจ่าย = ยังไม่หมดอายุ)
    const session = await this.tableSessions.resolveOpenSessionByToken(sessionToken);

    const menuItems = await this.prisma.menuItem.findMany({
      where: { id: { in: items.map((i) => i.menuItemId) } },
      include: MENU_ITEM_WITH_OPTIONS,
    });
    this.assertAllMenuItemsExistAndAvailable(items, menuItems);
    const { items: itemsData, usage } = this.buildOrderItems(items, menuItems);

    let ingredientClosed = false;
    const order = await this.runOrderTransaction(async (tx) => {
      ingredientClosed = await deductStock(tx, usage);

      await tx.restaurantTable.update({
        where: { id: session.tableId },
        data: { status: TableStatus.OCCUPIED },
      });

      return tx.order.create({
        data: {
          tableId: session.tableId,
          tableSessionId: session.id,
          items: { create: itemsData },
        },
        include: ORDER_INCLUDE,
      });
    });

    this.emitOrderEvent('order.created', order);
    if (ingredientClosed) this.notifyMenuChanged();
    return order;
  }

  findAll(query: FindOrdersQueryDto) {
    const hasFilter = Boolean(query.status || query.tableId || query.tableSessionId);
    return this.prisma.order.findMany({
      where: hasFilter
        ? {
            status: query.status,
            tableId: query.tableId,
            tableSessionId: query.tableSessionId,
          }
        : ACTIVE_ORDERS_WHERE(),
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
    this.assertOrderIsEditable(order);
    // เสิร์ฟแล้ว = ครัวเอาออกจากคิวไปแล้ว ของชิ้นใหม่จะเข้าบิลโดยไม่มีใครทำ
    if (order.status === OrderStatus.SERVED) {
      throw new BadRequestException('ออเดอร์นี้เสิร์ฟแล้ว — สั่งเพิ่มเป็นออเดอร์ใหม่แทน');
    }

    const menuItem = await this.prisma.menuItem.findUnique({
      where: { id: dto.menuItemId },
      include: MENU_ITEM_WITH_OPTIONS,
    });
    if (!menuItem?.isAvailable) {
      throw new BadRequestException('เมนูนี้ไม่พร้อมขายหรือไม่มีอยู่จริง');
    }
    this.assertMenuIngredientsAvailable(menuItem);
    const { items: itemsData, usage } = this.buildOrderItems([dto], [menuItem]);

    const ingredientClosed = await this.runOrderTransaction(async (tx) => {
      const closed = await deductStock(tx, usage);
      await tx.orderItem.create({ data: { orderId, ...itemsData[0] } });
      return closed;
    });

    const updated = await this.findOne(orderId);
    this.emitOrderEvent('order.updated', updated);
    if (ingredientClosed) this.notifyMenuChanged();
    return updated;
  }

  async removeItem(orderId: string, orderItemId: string) {
    const order = await this.findOne(orderId);
    this.assertOrderIsEditable(order);

    const item = order.items.find((i) => i.id === orderItemId);
    if (!item) {
      throw new NotFoundException(`ไม่พบรายการ id: ${orderItemId} ในออเดอร์นี้`);
    }
    // ออเดอร์เปล่าจะค้างในบิล 0 บาทและบนบอร์ดครัว — ให้ยกเลิกทั้งออเดอร์แทน
    if (order.items.length === 1) {
      throw new BadRequestException('ลบรายการสุดท้ายไม่ได้ — ยกเลิกทั้งออเดอร์แทน');
    }

    const ingredientReopened = await this.runOrderTransaction(async (tx) => {
      await tx.orderItem.delete({ where: { id: orderItemId } });
      // ครัวยังไม่เริ่มทำ ของยังไม่ถูกใช้ — คืนสต็อก (เริ่มทำแล้วถือว่าใช้ไปแล้ว)
      return order.status === OrderStatus.PENDING
        ? restoreStock(tx, toStockUsage(item.stockUsed))
        : false;
    });
    const updated = await this.findOne(orderId);
    this.emitOrderEvent('order.updated', updated);
    if (ingredientReopened) this.notifyMenuChanged();
    return updated;
  }

  async updateStatus(id: string, status: OrderStatus) {
    const order = await this.findOne(id);
    this.assertValidTransition(order.status, status);
    // บิลกลับบ้านที่จ่ายก่อนทำ — ครัวทำ/เสิร์ฟต่อได้ แต่ยกเลิกเฉย ๆ ไม่ได้ (เงินลูกค้าค้างอยู่ในบิล)
    if (status === OrderStatus.CANCELLED && order.paymentId) {
      throw new BadRequestException(
        'ออเดอร์นี้ลูกค้าจ่ายเงินแล้ว — ยกเลิกบิลที่หน้า Check (คืนเงิน) ก่อน แล้วค่อยยกเลิกออเดอร์',
      );
    }

    let sessionClosed = false;
    let ingredientReopened = false;
    const updated = await this.runOrderTransaction(async (tx) => {
      // เปลี่ยนเฉพาะถ้าสถานะยังเป็นค่าที่เพิ่งอ่านมา — กันกรณีแคชเชียร์เก็บเงินไปพอดี
      // แล้วครัวกดยกเลิกทับ ได้ออเดอร์ CANCELLED ที่มี payment ผูกอยู่
      const changed = await tx.order.updateMany({
        where: {
          id,
          status: order.status,
          // ยกเลิกต้องยังไม่จ่าย · ทำ/เสิร์ฟต้องตรงกับตอนอ่าน (จ่ายก่อนได้เฉพาะกลับบ้าน — ดู PaymentsService)
          paymentId: status === OrderStatus.CANCELLED ? null : order.paymentId,
        },
        data: {
          status,
          // เวลาเข้าแต่ละขั้น — ไว้คิดว่าครัวช้าตรงไหน (รอคิว vs ปรุง)
          ...(status === OrderStatus.PREPARING && { startedAt: new Date() }),
          ...(status === OrderStatus.SERVED && { servedAt: new Date() }),
        },
      });
      if (changed.count === 0) {
        throw new ConflictException(
          'ออเดอร์นี้เพิ่งถูกเปลี่ยนสถานะหรือเก็บเงินไปแล้ว กรุณารีเฟรชแล้วลองใหม่',
        );
      }

      // การจ่ายเงินใช้ PaymentsService; ตรงนี้ดูแลแค่กรณียกเลิก
      if (status === OrderStatus.CANCELLED) {
        // ยกเลิกก่อนครัวเริ่มทำ = ของยังไม่ถูกใช้ คืนสต็อก
        // PREPARING/SERVED ถือว่าวัตถุดิบถูกใช้ไปแล้ว ไม่คืน
        if (order.status === OrderStatus.PENDING) {
          ingredientReopened = await restoreStock(
            tx,
            mergeUsage(order.items.map((item) => toStockUsage(item.stockUsed))),
          );
        }
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
    if (ingredientReopened) this.notifyMenuChanged();
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

  /** วัตถุดิบถูกปิด/เปิดเองจากสต็อก — ทุกจอ (รวมลูกค้า) ต้องดึงเมนูใหม่ */
  private notifyMenuChanged() {
    this.events.emitToEveryone('menu.updated', { at: new Date().toISOString() });
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
    found: Prisma.MenuItemGetPayload<{ include: typeof MENU_ITEM_WITH_OPTIONS }>[],
  ) {
    for (const item of requested) {
      const menuItem = found.find((m) => m.id === item.menuItemId);
      if (!menuItem) {
        throw new BadRequestException(`ไม่พบเมนู id: ${item.menuItemId}`);
      }
      if (!menuItem.isAvailable) {
        // ลูกค้าเห็นข้อความนี้ตรง ๆ — ต้องเป็นชื่อเมนู ไม่ใช่ uuid
        throw new BadRequestException(`"${menuItem.name}" ปิดขายชั่วคราว — ลบออกจากตะกร้าก่อนสั่ง`);
      }
      this.assertMenuIngredientsAvailable(menuItem);
    }
  }

  /** วัตถุดิบหลักของเมนูหมด (ข้าวไข่เจียว แต่ไข่หมด) = ทั้งเมนูสั่งไม่ได้ */
  private assertMenuIngredientsAvailable(
    menuItem: Prisma.MenuItemGetPayload<{ include: typeof MENU_ITEM_WITH_OPTIONS }>,
  ) {
    const outOfStock = menuItem.ingredients.find((link) => !link.ingredient.isAvailable);
    if (outOfStock) {
      throw new BadRequestException(
        `"${menuItem.name}" หมดชั่วคราว (วัตถุดิบ: ${outOfStock.ingredient.name})`,
      );
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

    // กติกาเดียวกับหน้าลูกค้า/พนักงาน (frontend lib/map.ts): เนื้อสัตว์เลือกได้อย่างเดียว
    // และต้องเลือกถ้ายังมีเนื้อสัตว์ที่สั่งได้ — ถ้าหมดทุกตัว กลุ่มนี้หายจากหน้าจอ ไม่บังคับ
    const proteins = selected.filter((o) => o.group === MenuOptionGroup.PROTEIN);
    if (proteins.length > 1) {
      throw new BadRequestException(`"${menuItem.name}" เลือกเนื้อสัตว์ได้อย่างเดียว`);
    }
    const proteinOrderable = menuItem.options.some(
      (o) =>
        o.group === MenuOptionGroup.PROTEIN &&
        o.isAvailable &&
        (!o.ingredient || o.ingredient.isAvailable),
    );
    // เมนูที่ตั้ง "ไม่บังคับเลือกเนื้อสัตว์" (ข้าวไข่เจียว) สั่งเปล่า ๆ ได้ — ยังเลือกได้แค่อย่างเดียวเหมือนเดิม
    if (menuItem.proteinRequired && proteinOrderable && proteins.length === 0) {
      throw new BadRequestException(`"${menuItem.name}" ต้องเลือกเนื้อสัตว์ 1 อย่าง`);
    }

    // คืนตัวเลือกดิบ — buildOrderItems ต้องใช้ usageQty/วัตถุดิบไปคิดยอดตัดสต็อกด้วย
    return selected;
  }

  /** ข้อมูลสร้าง order item พร้อมยอดวัตถุดิบที่ต้องตัด (แยกต่อรายการ ไว้คืนทีละรายการได้) */
  /** รายการราคาเปิด — ไม่ผูกเมนู ไม่ตัดสต็อก ราคาตามที่พนักงานพิมพ์ */
  private buildCustomItems(custom: CustomItemInputDto[] = []) {
    return custom.map((item) => ({
      customName: item.name,
      quantity: item.quantity,
      unitPrice: new Prisma.Decimal(item.price),
      note: item.note,
    }));
  }

  private assertHasItems(items: unknown[]) {
    if (items.length === 0) {
      throw new BadRequestException('ต้องมีอย่างน้อย 1 รายการ');
    }
  }

  private buildOrderItems(
    items: OrderItemInputDto[],
    menuItems: Prisma.MenuItemGetPayload<{
      include: typeof MENU_ITEM_WITH_OPTIONS;
    }>[],
  ) {
    const built = items.map((item) => {
      const menuItem = menuItems.find(
        (m: MenuItem) => m.id === item.menuItemId,
      )!;
      const selectedOptions = this.resolveSelectedOptions(item, menuItem);
      const stockUsed = stockUsageOf(
        item.quantity,
        menuItem.ingredients.map((link) => link.ingredient),
        selectedOptions,
      );
      return {
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        unitPrice: menuItem.price,
        note: item.note,
        ...(Object.keys(stockUsed).length ? { stockUsed } : {}),
        selectedOptions: {
          create: selectedOptions.map((option) => ({
            menuOptionId: option.id,
            name: option.name,
            price: option.price,
          })),
        },
      };
    });
    return {
      items: built,
      usage: mergeUsage(built.map((item) => item.stockUsed)),
    };
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

  private assertOrderIsEditable(order: { status: OrderStatus; paymentId: string | null }) {
    if (order.status === OrderStatus.PAID || order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('ออเดอร์นี้ปิดแล้ว ไม่สามารถแก้ไขรายการได้');
    }
    // กลับบ้านจ่ายก่อนทำ — แก้รายการแล้วยอดจะไม่ตรงกับเงินที่รับไป
    if (order.paymentId) {
      throw new BadRequestException('ออเดอร์นี้จ่ายเงินแล้ว แก้รายการไม่ได้ — สั่งเพิ่มเป็นบิลใหม่แทน');
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
