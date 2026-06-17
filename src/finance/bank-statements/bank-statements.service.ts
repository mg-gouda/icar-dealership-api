import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class BankStatementsService {
  constructor(private prisma: PrismaService) {}

  async list(query: { bankAccountId?: string; page?: number; limit?: number }) {
    const { bankAccountId, page = 1, limit = 20 } = query;
    const where: any = {};
    if (bankAccountId) where.bankAccountId = bankAccountId;

    const [items, total] = await Promise.all([
      this.prisma.bankStatement.findMany({
        where,
        include: {
          bankAccount: { select: { id: true, name: true, bankName: true } },
          _count: { select: { lines: true } },
        },
        orderBy: { endDate: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      this.prisma.bankStatement.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async getById(id: string) {
    const stmt = await this.prisma.bankStatement.findUnique({
      where: { id },
      include: {
        bankAccount: true,
        lines: { orderBy: { date: 'asc' } },
      },
    });
    if (!stmt) throw new NotFoundException('Bank statement not found');
    return stmt;
  }

  async create(data: {
    bankAccountId: string;
    startDate: Date;
    endDate: Date;
    startingBalance: number;
    endingBalance: number;
    lines?: { date: Date; description: string; amount: number; reference?: string }[];
  }) {
    const { lines, ...header } = data;
    return this.prisma.bankStatement.create({
      data: {
        ...header,
        lines: lines ? { create: lines } : undefined,
      },
      include: { lines: true },
    });
  }

  async addLine(statementId: string, data: {
    date: Date;
    description: string;
    amount: number;
    reference?: string;
  }) {
    const stmt = await this.prisma.bankStatement.findUnique({ where: { id: statementId } });
    if (!stmt) throw new NotFoundException('Bank statement not found');
    return this.prisma.bankStatementLine.create({ data: { ...data, bankStatementId: statementId } });
  }

  async listBankAccounts() {
    return this.prisma.bankAccount.findMany({
      include: { currency: true },
      orderBy: { name: 'asc' },
    });
  }

  async createBankAccount(data: {
    name: string;
    accountNumber?: string;
    bankName?: string;
    currencyId?: string;
  }) {
    return this.prisma.bankAccount.create({ data });
  }
}
