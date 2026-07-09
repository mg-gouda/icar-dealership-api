import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class ReconciliationService {
  constructor(private prisma: PrismaService) {}

  async getUnreconciledLines(
    companyId: string,
    query: {
      journalId?: string;
      accountId?: string;
      dateFrom?: Date;
      dateTo?: Date;
      page?: number;
      limit?: number;
    },
  ) {
    const {
      journalId,
      accountId,
      dateFrom,
      dateTo,
      page = 1,
      limit = 50,
    } = query;
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

  async reconcile(
    pairs: {
      bankStatementLineId: string;
      journalEntryLineId: string;
      amount: number;
    }[],
  ) {
    const results: { id: string }[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const pair of pairs) {
        const [bslCheck, jelCheck] = await Promise.all([
          tx.bankStatementLine.findUnique({
            where: { id: pair.bankStatementLineId },
            select: { reconciled: true },
          }),
          tx.journalEntryLine.findUnique({
            where: { id: pair.journalEntryLineId },
            select: { reconciled: true },
          }),
        ]);
        if (!bslCheck)
          throw new BadRequestException(
            `Bank statement line ${pair.bankStatementLineId} not found`,
          );
        if (!jelCheck)
          throw new BadRequestException(
            `Journal entry line ${pair.journalEntryLineId} not found`,
          );
        if (bslCheck.reconciled)
          throw new BadRequestException(
            `Bank statement line ${pair.bankStatementLineId} is already fully reconciled`,
          );
        if (jelCheck.reconciled)
          throw new BadRequestException(
            `Journal entry line ${pair.journalEntryLineId} is already reconciled`,
          );

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
      return (
        Math.abs(jelDebit - bsAmount) < 0.01 ||
        Math.abs(jelCredit - bsAmount) < 0.01
      );
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

    await this.prisma.$transaction(async (tx) => {
      await tx.journalEntryLine.update({
        where: { id: rec.journalEntryLineId },
        data: { reconciled: false, matchingNumber: null },
      });

      await tx.reconciliation.delete({ where: { id: reconciliationId } });

      // Re-aggregate remaining reconciliations after deletion to decide BSL status
      const [bsl, remaining] = await Promise.all([
        tx.bankStatementLine.findUnique({
          where: { id: rec.bankStatementLineId },
          select: { amount: true },
        }),
        tx.reconciliation.aggregate({
          where: { bankStatementLineId: rec.bankStatementLineId },
          _sum: { amount: true },
        }),
      ]);
      const remainingAmt = Number(remaining._sum.amount ?? 0);
      const bslAmt = Math.abs(Number(bsl?.amount ?? 0));
      // Only flip BSL to unreconciled if remaining sum no longer covers full amount
      if (remainingAmt < bslAmt - 0.01) {
        await tx.bankStatementLine.update({
          where: { id: rec.bankStatementLineId },
          data: { reconciled: false },
        });
      }
    });

    return { deleted: true };
  }

  async completeReconciliation(
    accountId: string,
    month: string,
    endingBalance: number,
    userId: string,
  ) {
    const [year, mon] = month.split('-').map(Number);
    const from = new Date(year, mon - 1, 1);
    const to = new Date(year, mon, 0, 23, 59, 59);

    const statements = await this.prisma.bankStatement.findMany({
      where: { bankAccountId: accountId, endDate: { gte: from, lte: to } },
      include: { lines: { select: { reconciled: true } } },
    });

    const allReconciled = statements.every((s) =>
      s.lines.every((l) => l.reconciled),
    );
    const result = await this.prisma.bankStatement.updateMany({
      where: { bankAccountId: accountId, endDate: { gte: from, lte: to } },
      data: { endingBalance, status: 'CLOSED' },
    });

    return {
      completed: true,
      statements: result.count,
      allLinesReconciled: allReconciled,
      endingBalance,
    };
  }

  // ponytail: bulk-match unreconciled statement lines by amount + date proximity
  async autoReconcile(bankStatementId: string, companyId: string) {
    const statementLines = await this.prisma.bankStatementLine.findMany({
      where: { bankStatementId, reconciled: false },
    });

    const created: { bankStatementLineId: string; reconciliationId: string }[] =
      [];
    const threeDays = 3 * 24 * 60 * 60 * 1000;

    await this.prisma.$transaction(async (tx) => {
      for (const bsl of statementLines) {
        const candidates = await this.suggestMatches(bsl.id, companyId);
        const bsAmount = Math.abs(Number(bsl.amount));

        const confident = candidates.filter((jel) => {
          const dateDiff = Math.abs(
            jel.journalEntry.date.getTime() - bsl.date.getTime(),
          );
          const jelDebit = Number(jel.debit);
          const jelCredit = Number(jel.credit);
          return (
            (Math.abs(jelDebit - bsAmount) < 0.01 ||
              Math.abs(jelCredit - bsAmount) < 0.01) &&
            dateDiff <= threeDays
          );
        });

        if (confident.length === 0) continue;

        const best = confident[0];
        const jelCheck = await tx.journalEntryLine.findUnique({
          where: { id: best.id },
          select: { reconciled: true },
        });
        if (!jelCheck || jelCheck.reconciled) continue;

        const matchAmount = Math.max(Number(best.debit), Number(best.credit));

        const rec = await tx.reconciliation.create({
          data: {
            bankStatementLineId: bsl.id,
            journalEntryLineId: best.id,
            amount: matchAmount,
          },
        });

        await tx.journalEntryLine.update({
          where: { id: best.id },
          data: { reconciled: true, matchingNumber: rec.id },
        });

        const reconciledSum = await tx.reconciliation.aggregate({
          where: { bankStatementLineId: bsl.id },
          _sum: { amount: true },
        });
        const reconciledAmt = Number(reconciledSum._sum.amount ?? 0);
        if (Math.abs(reconciledAmt - bsAmount) < 0.01) {
          await tx.bankStatementLine.update({
            where: { id: bsl.id },
            data: { reconciled: true },
          });
        }

        created.push({ bankStatementLineId: bsl.id, reconciliationId: rec.id });
      }
    });

    return { matched: created.length, reconciliations: created };
  }

  // ponytail: inline "Create Entry" for unmatched bank lines (fees, interest)
  async createAndReconcileUnmatched(dto: {
    bankStatementLineId: string;
    accountId: string;
    bankAccountId: string; // GL account for the bank side
    description: string;
    amount: number; // positive = debit expense, negative = credit income
    journalId: string;
    date: string;
    userId: string;
  }) {
    const bsl = await this.prisma.bankStatementLine.findUniqueOrThrow({
      where: { id: dto.bankStatementLineId },
    });
    if (bsl.reconciled)
      throw new BadRequestException('Line already reconciled');

    const result = await this.prisma.$transaction(async (tx) => {
      const je = await tx.journalEntry.create({
        data: {
          journalId: dto.journalId,
          date: new Date(dto.date),
          ref: `BANK-${dto.bankStatementLineId.slice(0, 8)}`,
          status: 'POSTED',
        },
      });

      const expenseLine = await tx.journalEntryLine.create({
        data: {
          journalEntryId: je.id,
          accountId: dto.accountId,
          debit: dto.amount > 0 ? dto.amount : 0,
          credit: dto.amount < 0 ? -dto.amount : 0,
          label: dto.description,
        },
      });

      await tx.journalEntryLine.create({
        data: {
          journalEntryId: je.id,
          accountId: dto.bankAccountId,
          debit: dto.amount < 0 ? -dto.amount : 0,
          credit: dto.amount > 0 ? dto.amount : 0,
          label: 'Bank',
        },
      });

      const rec = await tx.reconciliation.create({
        data: {
          bankStatementLineId: dto.bankStatementLineId,
          journalEntryLineId: expenseLine.id,
          amount: Math.abs(dto.amount),
        },
      });
      await tx.bankStatementLine.update({
        where: { id: dto.bankStatementLineId },
        data: { reconciled: true },
      });
      await tx.journalEntryLine.update({
        where: { id: expenseLine.id },
        data: { reconciled: true, matchingNumber: rec.id },
      });
      return { journalEntryId: je.id, reconciliationId: rec.id };
    });

    return result;
  }
}
