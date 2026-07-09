import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class BankStatementsService {
  constructor(private prisma: PrismaService) {}

  async list(_companyId: string, query: { bankAccountId?: string; page?: number; limit?: number }) {
    const { bankAccountId, page = 1, limit = 20 } = query;
    // ponytail: BankStatement has no companyId — single-company schema, filter by bankAccountId only
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

  async getById(id: string, _companyId?: string) {
    const stmt = await this.prisma.bankStatement.findFirst({
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
    lines?: {
      date: Date;
      description: string;
      amount: number;
      reference?: string;
    }[];
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

  async addLine(
    statementId: string,
    data: {
      date: Date;
      description: string;
      amount: number;
      reference?: string;
    },
  ) {
    const stmt = await this.prisma.bankStatement.findUnique({
      where: { id: statementId },
    });
    if (!stmt) throw new NotFoundException('Bank statement not found');
    return this.prisma.bankStatementLine.create({
      data: { ...data, bankStatementId: statementId },
    });
  }

  async listBankAccounts() {
    return this.prisma.bankAccount.findMany({
      include: { currency: true },
      orderBy: { name: 'asc' },
    });
  }

  async importCsv(statementId: string, csvText: string) {
    const stmt = await this.prisma.bankStatement.findUnique({
      where: { id: statementId },
    });
    if (!stmt) throw new NotFoundException('Bank statement not found');

    const rawLines = csvText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    // Skip header row
    const dataLines = rawLines.slice(1);
    const errors: { row: number; error: string }[] = [];
    let imported = 0;

    for (let i = 0; i < dataLines.length; i++) {
      const row = i + 2; // 1-indexed, +1 for header
      const cols = dataLines[i].split(',').map((c) => c.trim());
      if (cols.length < 5) {
        errors.push({
          row,
          error: 'Expected 5 columns: date,description,debit,credit,balance',
        });
        continue;
      }

      const [dateStr, description, debitStr, creditStr] = cols;
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        errors.push({ row, error: `Invalid date: ${dateStr}` });
        continue;
      }

      const debit = parseFloat(debitStr) || 0;
      const credit = parseFloat(creditStr) || 0;
      // ponytail: amount = credit - debit (positive = inflow)
      const amount = credit - debit;

      await this.prisma.bankStatementLine.create({
        data: {
          bankStatementId: statementId,
          date,
          description,
          amount,
        },
      });
      imported++;
    }

    return { imported, errors };
  }

  async importOfx(statementId: string, ofxText: string) {
    // ponytail: regex-based OFX parser -- no external lib needed
    const stmt = await this.prisma.bankStatement.findUnique({
      where: { id: statementId },
    });
    if (!stmt) throw new NotFoundException('Bank statement not found');

    const txnBlocks = [...ofxText.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi)];
    const errors: { row: number; error: string }[] = [];
    let imported = 0;

    for (let i = 0; i < txnBlocks.length; i++) {
      const block = txnBlocks[i][1];
      const get = (tag: string) =>
        block.match(new RegExp(`<${tag}>([^<\\n]+)`, 'i'))?.[1]?.trim();

      const rawDate = get('DTPOSTED') ?? get('DTAVAIL') ?? '';
      const rawAmt = get('TRNAMT') ?? '0';
      const memo = get('MEMO') ?? get('NAME') ?? '';
      const fitid = get('FITID') ?? '';

      // DTPOSTED format: YYYYMMDD or YYYYMMDDHHMMSS
      const dateStr = rawDate.replace(/(\d{4})(\d{2})(\d{2}).*/, '$1-$2-$3');
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        errors.push({ row: i + 1, error: `Invalid date: ${rawDate}` });
        continue;
      }

      const amount = parseFloat(rawAmt);
      if (isNaN(amount)) {
        errors.push({ row: i + 1, error: `Invalid amount: ${rawAmt}` });
        continue;
      }

      try {
        await this.prisma.bankStatementLine.create({
          data: {
            bankStatementId: statementId,
            date,
            description: memo || fitid || `OFX line ${i + 1}`,
            amount,
            reference: fitid || undefined,
          },
        });
        imported++;
      } catch (e: unknown) {
        errors.push({
          row: i + 1,
          error: e instanceof Error ? e.message : 'Unknown error',
        });
      }
    }
    return { imported, errors };
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
