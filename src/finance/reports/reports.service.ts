import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async trialBalance(companyId: string, dateFrom: Date, dateTo: Date) {
    const rows = await this.prisma.journalEntryLine.groupBy({
      by: ['accountId'],
      where: {
        journalEntry: {
          status: 'POSTED',
          date: { gte: dateFrom, lte: dateTo },
          journal: { companyId },
        },
      },
      _sum: { debit: true, credit: true },
    });

    const accountIds = rows.map((r) => r.accountId);
    const accounts = await this.prisma.account.findMany({
      where: { id: { in: accountIds } },
      select: { id: true, code: true, name: true, type: true },
    });
    const accMap = new Map(accounts.map((a) => [a.id, a]));

    return rows
      .map((r) => {
        const acc = accMap.get(r.accountId);
        const debit = new Decimal(r._sum?.debit?.toString() ?? '0');
        const credit = new Decimal(r._sum?.credit?.toString() ?? '0');
        return {
          accountId: r.accountId,
          code: acc?.code ?? '',
          name: acc?.name ?? '',
          type: acc?.type ?? '',
          debit,
          credit,
          balance: debit.minus(credit),
        };
      })
      .sort((a, b) => a.code.localeCompare(b.code));
  }

  async incomeStatement(companyId: string, dateFrom: Date, dateTo: Date) {
    const incomeTypes = ['INCOME', 'OTHER_INCOME'];
    const expenseTypes = ['EXPENSE', 'DEPRECIATION', 'COGS'];

    const rows = await this.prisma.journalEntryLine.groupBy({
      by: ['accountId'],
      where: {
        account: { companyId, type: { in: [...incomeTypes, ...expenseTypes] as any[] } },
        journalEntry: {
          status: 'POSTED',
          date: { gte: dateFrom, lte: dateTo },
          journal: { companyId },
        },
      },
      _sum: { debit: true, credit: true },
    });

    const accountIds = rows.map((r) => r.accountId);
    const accounts = await this.prisma.account.findMany({
      where: { id: { in: accountIds } },
      select: { id: true, code: true, name: true, type: true },
    });
    const accMap = new Map(accounts.map((a) => [a.id, a]));

    let totalIncome = new Decimal(0);
    let totalExpense = new Decimal(0);
    const incomeLines: any[] = [];
    const expenseLines: any[] = [];

    for (const r of rows) {
      const acc = accMap.get(r.accountId);
      if (!acc) continue;
      const debit = new Decimal(r._sum?.debit?.toString() ?? '0');
      const credit = new Decimal(r._sum?.credit?.toString() ?? '0');
      const net = credit.minus(debit); // income: credit > debit

      const line = { accountId: r.accountId, code: acc.code, name: acc.name, type: acc.type, net };

      if (incomeTypes.includes(acc.type)) {
        incomeLines.push(line);
        totalIncome = totalIncome.plus(net);
      } else {
        expenseLines.push({ ...line, net: net.negated() });
        totalExpense = totalExpense.plus(net.negated());
      }
    }

    return {
      income: incomeLines.sort((a, b) => a.code.localeCompare(b.code)),
      expenses: expenseLines.sort((a, b) => a.code.localeCompare(b.code)),
      totalIncome,
      totalExpense,
      netProfit: totalIncome.minus(totalExpense),
    };
  }

  async balanceSheet(companyId: string, asOf: Date) {
    const assetTypes = ['ASSET', 'CURRENT_ASSET', 'FIXED_ASSET', 'BANK', 'CASH'];
    const liabilityTypes = ['LIABILITY', 'CURRENT_LIABILITY', 'LONG_TERM_LIABILITY', 'PAYABLE'];
    const equityTypes = ['EQUITY', 'RETAINED_EARNINGS'];

    const rows = await this.prisma.journalEntryLine.groupBy({
      by: ['accountId'],
      where: {
        account: { companyId, type: { in: [...assetTypes, ...liabilityTypes, ...equityTypes] as any[] } },
        journalEntry: {
          status: 'POSTED',
          date: { lte: asOf },
          journal: { companyId },
        },
      },
      _sum: { debit: true, credit: true },
    });

    const accountIds = rows.map((r) => r.accountId);
    const accounts = await this.prisma.account.findMany({
      where: { id: { in: accountIds } },
      select: { id: true, code: true, name: true, type: true },
    });
    const accMap = new Map(accounts.map((a) => [a.id, a]));

    const assets: any[] = [];
    const liabilities: any[] = [];
    const equity: any[] = [];
    let totalAssets = new Decimal(0);
    let totalLiabilities = new Decimal(0);
    let totalEquity = new Decimal(0);

    for (const r of rows) {
      const acc = accMap.get(r.accountId);
      if (!acc) continue;
      const debit = new Decimal(r._sum?.debit?.toString() ?? '0');
      const credit = new Decimal(r._sum?.credit?.toString() ?? '0');
      const balance = debit.minus(credit);
      const line = { accountId: r.accountId, code: acc.code, name: acc.name, type: acc.type, balance };

      if (assetTypes.includes(acc.type)) {
        assets.push(line);
        totalAssets = totalAssets.plus(balance);
      } else if (liabilityTypes.includes(acc.type)) {
        liabilities.push({ ...line, balance: balance.negated() });
        totalLiabilities = totalLiabilities.plus(balance.negated());
      } else {
        equity.push({ ...line, balance: balance.negated() });
        totalEquity = totalEquity.plus(balance.negated());
      }
    }

    return {
      assets: assets.sort((a, b) => a.code.localeCompare(b.code)),
      liabilities: liabilities.sort((a, b) => a.code.localeCompare(b.code)),
      equity: equity.sort((a, b) => a.code.localeCompare(b.code)),
      totalAssets,
      totalLiabilities,
      totalEquity,
      totalLiabilitiesAndEquity: totalLiabilities.plus(totalEquity),
    };
  }

  async agedReceivables(companyId: string, asOf: Date) {
    return this.agedReport(companyId, asOf, 'CUSTOMER_INVOICE');
  }

  async agedPayables(companyId: string, asOf: Date) {
    return this.agedReport(companyId, asOf, 'VENDOR_BILL');
  }

  private async agedReport(companyId: string, asOf: Date, invoiceType: string) {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        type: invoiceType as any,
        status: 'POSTED',
        paymentStatus: { not: 'PAID' },
        journal: { companyId },
        date: { lte: asOf },
      },
      include: {
        partner: { select: { id: true, name: true } },
      },
    });

    const buckets = [0, 30, 60, 90, 120];
    const partnerMap = new Map<string, {
      partnerId: string;
      partnerName: string;
      current: Decimal;
      b30: Decimal;
      b60: Decimal;
      b90: Decimal;
      b120: Decimal;
      older: Decimal;
      total: Decimal;
    }>();

    for (const inv of invoices) {
      const daysOverdue = Math.floor((asOf.getTime() - (inv.dueDate ?? inv.date).getTime()) / 86400000);
      const residual = new Decimal(inv.amountResidual.toString());
      const pid = inv.partnerId;

      if (!partnerMap.has(pid)) {
        partnerMap.set(pid, {
          partnerId: pid,
          partnerName: inv.partner.name,
          current: new Decimal(0), b30: new Decimal(0), b60: new Decimal(0),
          b90: new Decimal(0), b120: new Decimal(0), older: new Decimal(0),
          total: new Decimal(0),
        });
      }

      const entry = partnerMap.get(pid)!;
      entry.total = entry.total.plus(residual);

      if (daysOverdue <= 0) entry.current = entry.current.plus(residual);
      else if (daysOverdue <= 30) entry.b30 = entry.b30.plus(residual);
      else if (daysOverdue <= 60) entry.b60 = entry.b60.plus(residual);
      else if (daysOverdue <= 90) entry.b90 = entry.b90.plus(residual);
      else if (daysOverdue <= 120) entry.b120 = entry.b120.plus(residual);
      else entry.older = entry.older.plus(residual);
    }

    return Array.from(partnerMap.values()).sort((a, b) => a.partnerName.localeCompare(b.partnerName));
  }
}
