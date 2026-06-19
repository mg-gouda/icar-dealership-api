import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class ReconciliationService {
  constructor(private prisma: PrismaService) {}

  async getUnreconciledLines(companyId: string, query: {
    journalId?: string;
    accountId?: string;
    dateFrom?: Date;
    dateTo?: Date;
    page?: number;
    limit?: number;
  }) {
    const { journalId, accountId, dateFrom, dateTo, page = 1, limit = 50 } = query;
    const where: any = {
      reconciled: false,
      journalEntry: {
        status: 'POSTED',
        journal: { companyId },
      },
    };
    if (journalId) where.journalEntry = { ...where.journalEntry, journalId };
    if (accountId) where.accountId = accountId;
    if (dateFrom || dateTo) {
      where.journalEntry = {
        ...where.journalEntry,
        date: {
          ...(dateFrom ? { gte: dateFrom } : {}),
          ...(dateTo ? { lte: dateTo } : {}),
        },
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.journalEntryLine.findMany({
        where,
        include: {
          account: { select: { code: true, name: true } },
          journalEntry: { select: { id: true, date: true, ref: true } },
        },
        orderBy: { journalEntry: { date: 'asc' } },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      this.prisma.journalEntryLine.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async reconcile(pairs: { bankStatementLineId: string; journalEntryLineId: string; amount: number }[]) {
    const results: { id: string }[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const pair of pairs) {
        const rec = await tx.reconciliation.create({
          data: {
            bankStatementLineId: pair.bankStatementLineId,
            journalEntryLineId: pair.journalEntryLineId,
            amount: pair.amount,
          },
        });
        results.push(rec);

        await tx.journalEntryLine.update({
          where: { id: pair.journalEntryLineId },
          data: { reconciled: true, matchingNumber: rec.id },
        });

        // Check if all lines on the bank statement line are reconciled
        const bsl = await tx.bankStatementLine.findUnique({
          where: { id: pair.bankStatementLineId },
          select: { amount: true },
        });
        if (bsl) {
          const reconciled = await tx.reconciliation.aggregate({
            where: { bankStatementLineId: pair.bankStatementLineId },
            _sum: { amount: true },
          });
          const reconciledAmt = Number(reconciled._sum.amount ?? 0);
          if (Math.abs(reconciledAmt - Math.abs(Number(bsl.amount))) < 0.01) {
            await tx.bankStatementLine.update({
              where: { id: pair.bankStatementLineId },
              data: { reconciled: true },
            });
          }
        }
      }
    });

    return results;
  }

  async suggestMatches(bankStatementLineId: string, companyId: string) {
    const bsLine = await this.prisma.bankStatementLine.findUnique({
      where: { id: bankStatementLineId },
    });
    if (!bsLine) throw new BadRequestException('Bank statement line not found');

    const bsAmount = Math.abs(Number(bsLine.amount));
    const bsDate = bsLine.date;
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    const candidates = await this.prisma.journalEntryLine.findMany({
      where: {
        reconciled: false,
        journalEntry: {
          status: 'POSTED',
          journal: { companyId },
          date: {
            gte: new Date(bsDate.getTime() - sevenDays),
            lte: new Date(bsDate.getTime() + sevenDays),
          },
        },
      },
      include: {
        account: { select: { code: true, name: true } },
        journalEntry: { select: { id: true, date: true, ref: true } },
      },
      take: 200,
    });

    // Filter by amount match within 0.01
    const matches = candidates.filter((jel) => {
      const jelDebit = Number(jel.debit);
      const jelCredit = Number(jel.credit);
      return Math.abs(jelDebit - bsAmount) < 0.01 || Math.abs(jelCredit - bsAmount) < 0.01;
    });

    // Sort by date proximity, take top 5
    matches.sort((a, b) => {
      const aDiff = Math.abs(a.journalEntry.date.getTime() - bsDate.getTime());
      const bDiff = Math.abs(b.journalEntry.date.getTime() - bsDate.getTime());
      return aDiff - bDiff;
    });

    return matches.slice(0, 5);
  }

  async unreconcile(reconciliationId: string) {
    const rec = await this.prisma.reconciliation.findUnique({
      where: { id: reconciliationId },
    });
    if (!rec) throw new BadRequestException('Reconciliation not found');

    await this.prisma.$transaction([
      this.prisma.journalEntryLine.update({
        where: { id: rec.journalEntryLineId },
        data: { reconciled: false, matchingNumber: null },
      }),
      this.prisma.bankStatementLine.update({
        where: { id: rec.bankStatementLineId },
        data: { reconciled: false },
      }),
      this.prisma.reconciliation.delete({ where: { id: reconciliationId } }),
    ]);

    return { deleted: true };
  }
}
