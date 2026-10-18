import { Injectable, NotFoundException } from '@nestjs/common';
import { ExpenseCategory } from '@prisma/client';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { resolveDateRange } from '../common/date-range.util';
import { CreateDrawerExpenseDto } from './dto/create-drawer-expense.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { FindExpensesQueryDto } from './dto/find-expenses-query.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateExpenseDto, user: AuthenticatedUser) {
    return this.prisma.expense.create({
      data: {
        title: dto.title,
        amount: dto.amount,
        category: dto.category,
        note: dto.note,
        paidFromDrawer: dto.paidFromDrawer,
        spentAt: dto.spentAt ? new Date(dto.spentAt) : undefined,
        createdById: user.id,
        createdByName: user.name,
      },
    });
  }

  createFromDrawer(dto: CreateDrawerExpenseDto, user: AuthenticatedUser) {
    return this.prisma.expense.create({
      data: {
        title: dto.title,
        amount: dto.amount,
        category: dto.category ?? ExpenseCategory.INGREDIENTS,
        paidFromDrawer: true,
        createdById: user.id,
        createdByName: user.name,
      },
    });
  }

  findAll(query: FindExpensesQueryDto) {
    return this.prisma.expense.findMany({
      where: {
        category: query.category,
        spentAt: resolveDateRange(query),
      },
      orderBy: { spentAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const expense = await this.prisma.expense.findUnique({ where: { id } });
    if (!expense) {
      throw new NotFoundException(`ไม่พบรายจ่าย id: ${id}`);
    }
    return expense;
  }

  async update(id: string, dto: UpdateExpenseDto) {
    await this.findOne(id);
    return this.prisma.expense.update({
      where: { id },
      data: {
        title: dto.title,
        amount: dto.amount,
        category: dto.category,
        note: dto.note,
        paidFromDrawer: dto.paidFromDrawer,
        spentAt: dto.spentAt ? new Date(dto.spentAt) : undefined,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.expense.delete({ where: { id } });
  }
}
