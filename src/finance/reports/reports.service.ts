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
    const incomeTypes = ['INCOME'];
    const expenseTypes = ['EXPENSE', 'COST_OF_REVENUE'];

    const rows = await this.prisma.journalEntryLine.groupBy({
      by: ['accountId'],
      where: {
        account: {
          companyId,
          type: { in: [...incomeTypes, ...expenseTypes] as any[] },
        },
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

      const line = {
        accountId: r.accountId,
        code: acc.code,
        name: acc.name,
        type: acc.type,
        net,
      };

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

  async revenueByMonth(companyId: string, months = 6) {
    const result: { month: string; revenue: number; expenses: number }[] = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const from = new Date(d.getFullYear(), d.getMonth(), 1);
      const to = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      const monthLabel = from.toLocaleString('en', { month: 'short' });

      const rows = await this.prisma.journalEntryLine.groupBy({
        by: ['accountId'],
        where: {
          account: { companyId, type: { in: ['INCOME', 'EXPENSE', 'COST_OF_REVENUE'] as any[] } },
          journalEntry: { status: 'POSTED', date: { gte: from, lte: to }, journal: { companyId } },
        },
        _sum: { debit: true, credit: true },
      });

      const accountIds = rows.map((r) => r.accountId);
      const accs = await this.prisma.account.findMany({
        where: { id: { in: accountIds } },
        select: { id: true, type: true },
      });
      const accMap = new Map(accs.map((a) => [a.id, a]));

      let revenue = new Decimal(0);
      let expenses = new Decimal(0);
      for (const r of rows) {
        const acc = accMap.get(r.accountId);
        if (!acc) continue;
        const credit = new Decimal(r._sum?.credit?.toString() ?? '0');
        const debit = new Decimal(r._sum?.debit?.toString() ?? '0');
        if (acc.type === 'INCOME') revenue = revenue.plus(credit.minus(debit));
        else expenses = expenses.plus(debit.minus(credit));
      }
      result.push({ month: monthLabel, revenue: revenue.toNumber(), expenses: expenses.toNumber() });
    }
    return { months: result };
  }

  async branchProfit(companyId: string) {
    const locations = await this.prisma.location.findMany({
      where: { companyId },
      select: { id: true, name: true },
    });

    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);

    const result: { branch: string; gross: number }[] = [];
    for (const loc of locations) {
      const rows = await this.prisma.journalEntryLine.groupBy({
        by: ['accountId'],
        where: {
          account: { companyId, type: { in: ['INCOME', 'COST_OF_REVENUE', 'EXPENSE'] as any[] } },
          journalEntry: {
            status: 'POSTED',
            date: { gte: from },
            journal: { companyId, locationId: loc.id },
          },
        },
        _sum: { debit: true, credit: true },
      });

      const accountIds = rows.map((r) => r.accountId);
      const accs = await this.prisma.account.findMany({
        where: { id: { in: accountIds } },
        select: { id: true, type: true },
      });
      const accMap = new Map(accs.map((a) => [a.id, a]));

      let gross = new Decimal(0);
      for (const r of rows) {
        const acc = accMap.get(r.accountId);
        if (!acc) continue;
        const credit = new Decimal(r._sum?.credit?.toString() ?? '0');
        const debit = new Decimal(r._sum?.debit?.toString() ?? '0');
        if (acc.type === 'INCOME') gross = gross.plus(credit.minus(debit));
        else gross = gross.minus(debit.minus(credit));
      }
      result.push({ branch: loc.name, gross: gross.toNumber() });
    }
    return { branches: result.sort((a, b) => b.gross - a.gross) };
  }

  async balanceSheet(companyId: string, asOf: Date) {
    const assetTypes = ['ASSET'];
    const liabilityTypes = ['LIABILITY'];
    const equityTypes = ['EQUITY'];

    const rows = await this.prisma.journalEntryLine.groupBy({
      by: ['accountId'],
      where: {
        account: {
          companyId,
          type: {
            in: [...assetTypes, ...liabilityTypes, ...equityTypes] as any[],
          },
        },
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
      const line = {
        accountId: r.accountId,
        code: acc.code,
        name: acc.name,
        type: acc.type,
        balance,
      };

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
    const partnerMap = new Map<
      string,
      {
        partnerId: string;
        partnerName: string;
        current: Decimal;
        b30: Decimal;
        b60: Decimal;
        b90: Decimal;
        b120: Decimal;
        older: Decimal;
        total: Decimal;
      }
    >();

    for (const inv of invoices) {
      const daysOverdue = Math.floor(
        (asOf.getTime() - (inv.dueDate ?? inv.date).getTime()) / 86400000,
      );
      const residual = new Decimal(inv.amountResidual.toString());
      const pid = inv.partnerId;

      if (!partnerMap.has(pid)) {
        partnerMap.set(pid, {
          partnerId: pid,
          partnerName: inv.partner.name,
          current: new Decimal(0),
          b30: new Decimal(0),
          b60: new Decimal(0),
          b90: new Decimal(0),
          b120: new Decimal(0),
          older: new Decimal(0),
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

    return Array.from(partnerMap.values()).sort((a, b) =>
      a.partnerName.localeCompare(b.partnerName),
    );
  }

  async cashFlow(companyId: string, dateFrom: Date, dateTo: Date) {
    // ponytail: simplified indirect method
    const is = await this.incomeStatement(companyId, dateFrom, dateTo);
    const netProfit = is.netProfit;

    // Depreciation: sum JEL on accounts with code '6500' (depreciation expense) in period
    const depRows = await this.prisma.journalEntryLine.aggregate({
      where: {
        account: { companyId, code: '6500' },
        journalEntry: {
          status: 'POSTED',
          date: { gte: dateFrom, lte: dateTo },
          journal: { companyId },
        },
      },
      _sum: { debit: true, credit: true },
    });
    const depreciation = new Decimal(
      depRows._sum?.debit?.toString() ?? '0',
    ).minus(new Decimal(depRows._sum?.credit?.toString() ?? '0'));

    // AR change: sum of AR account lines (code '1300') -- increase in AR = cash outflow
    const arRows = await this.prisma.journalEntryLine.aggregate({
      where: {
        account: { companyId, code: '1300' },
        journalEntry: {
          status: 'POSTED',
          date: { gte: dateFrom, lte: dateTo },
          journal: { companyId },
        },
      },
      _sum: { debit: true, credit: true },
    });
    const arChange = new Decimal(arRows._sum?.debit?.toString() ?? '0').minus(
      new Decimal(arRows._sum?.credit?.toString() ?? '0'),
    );

    // AP change: sum of AP account lines (code '2100') -- increase in AP = cash inflow
    const apRows = await this.prisma.journalEntryLine.aggregate({
      where: {
        account: { companyId, code: '2100' },
        journalEntry: {
          status: 'POSTED',
          date: { gte: dateFrom, lte: dateTo },
          journal: { companyId },
        },
      },
      _sum: { debit: true, credit: true },
    });
    const apChange = new Decimal(apRows._sum?.credit?.toString() ?? '0').minus(
      new Decimal(apRows._sum?.debit?.toString() ?? '0'),
    );

    const operatingCashFlow = netProfit
      .plus(depreciation)
      .minus(arChange)
      .plus(apChange);

    return {
      netProfit,
      depreciation,
      arChange,
      apChange,
      operatingCashFlow,
      note: 'Simplified indirect method',
    };
  }

  async taxReport(companyId: string, dateFrom: Date, dateTo: Date) {
    const taxGroups = await this.prisma.taxGroup.findMany({
      include: { taxes: { select: { amount: true, accountId: true } } },
    });

    const results: {
      taxGroupId: string;
      taxGroupName: string;
      rate: Decimal;
      taxCollected: Decimal;
      taxPaid: Decimal;
      netPayable: Decimal;
    }[] = [];

    for (const tg of taxGroups) {
      const accountIds = [...new Set(tg.taxes.map((t) => t.accountId))];
      if (!accountIds.length) continue;

      const avgRate = tg.taxes
        .reduce(
          (sum, t) => sum.plus(new Decimal(t.amount.toString())),
          new Decimal(0),
        )
        .div(tg.taxes.length);

      // F-15: Split by account type — LIABILITY = output VAT (collected), ASSET = input VAT (reclaimable)
      const taxAccounts = await this.prisma.account.findMany({
        where: { id: { in: accountIds } },
        select: { id: true, type: true },
      });
      const liabilityIds = taxAccounts.filter((a) => a.type === 'LIABILITY').map((a) => a.id);
      const assetIds = taxAccounts.filter((a) => a.type === 'ASSET').map((a) => a.id);
      const periodWhere = {
        journalEntry: {
          status: 'POSTED' as const,
          date: { gte: dateFrom, lte: dateTo },
          journal: { companyId },
        },
      };

      let taxCollected = new Decimal(0);
      if (liabilityIds.length) {
        const r = await this.prisma.journalEntryLine.aggregate({
          where: { accountId: { in: liabilityIds }, ...periodWhere },
          _sum: { credit: true, debit: true },
        });
        taxCollected = new Decimal(r._sum?.credit?.toString() ?? '0').minus(
          new Decimal(r._sum?.debit?.toString() ?? '0'),
        );
      }

      let taxPaid = new Decimal(0);
      if (assetIds.length) {
        const r = await this.prisma.journalEntryLine.aggregate({
          where: { accountId: { in: assetIds }, ...periodWhere },
          _sum: { debit: true, credit: true },
        });
        taxPaid = new Decimal(r._sum?.debit?.toString() ?? '0').minus(
          new Decimal(r._sum?.credit?.toString() ?? '0'),
        );
      }

      results.push({
        taxGroupId: tg.id,
        taxGroupName: tg.name,
        rate: avgRate,
        taxCollected,
        taxPaid,
        netPayable: taxCollected.minus(taxPaid),
      });
    }

    return results;
  }

  async vatReturnEta(companyId: string, dateFrom: Date, dateTo: Date) {
    // ETA VAT return — boxes 1-13 per Egyptian Tax Authority format
    const incomeAccounts = await this.prisma.account.findMany({
      where: { companyId, type: 'INCOME' },
      select: { id: true },
    });
    const expenseAccounts = await this.prisma.account.findMany({
      where: { companyId, type: { in: ['EXPENSE', 'COST_OF_REVENUE'] as any[] } },
      select: { id: true },
    });

    const sumLines = async (accountIds: string[], sign: 1 | -1 = 1) => {
      if (!accountIds.length) return new Decimal(0);
      const r = await this.prisma.journalEntryLine.aggregate({
        where: {
          accountId: { in: accountIds },
          journalEntry: { status: 'POSTED', date: { gte: dateFrom, lte: dateTo }, journal: { companyId } },
        },
        _sum: { credit: true, debit: true },
      });
      const credit = new Decimal(r._sum?.credit?.toString() ?? '0');
      const debit = new Decimal(r._sum?.debit?.toString() ?? '0');
      return sign === 1 ? credit.minus(debit) : debit.minus(credit);
    };

    const incomeIds = incomeAccounts.map((a) => a.id);
    const expenseIds = expenseAccounts.map((a) => a.id);

    const totalSales = await sumLines(incomeIds, 1);
    const totalPurchases = await sumLines(expenseIds, -1);

    // F-17: Query actual posted VAT amounts instead of multiplying totals
    const outputVatAccount = await this.prisma.account.findFirst({
      where: { companyId, code: '2200' },
      select: { id: true },
    });
    const inputVatAccount = await this.prisma.account.findFirst({
      where: { companyId, code: '1350' },
      select: { id: true },
    });
    const vatOnSales = outputVatAccount
      ? await sumLines([outputVatAccount.id], 1)
      : new Decimal(0);
    const vatOnPurchases = inputVatAccount
      ? await sumLines([inputVatAccount.id], -1)
      : new Decimal(0);
    const netVatPayable = vatOnSales.minus(vatOnPurchases);

    // ETA Box mapping (simplified standard-rate only — no exempt/zero-rated split without invoice-level tax codes)
    const boxes = {
      box1_standardRatedSales: totalSales.toFixed(2),
      box2_zeroRatedSales: '0.00',
      box3_exemptSales: '0.00',
      box4_totalSales: totalSales.toFixed(2),
      box5_vatOnSales: vatOnSales.toFixed(2),
      box6_standardRatedPurchases: totalPurchases.toFixed(2),
      box7_zeroRatedPurchases: '0.00',
      box8_exemptPurchases: '0.00',
      box9_totalPurchases: totalPurchases.toFixed(2),
      box10_vatOnPurchases: vatOnPurchases.toFixed(2),
      box11_netVatPayable: netVatPayable.toFixed(2),
      box12_vatCreditsCarriedForward: '0.00',
      box13_vatPayable: netVatPayable.gt(0) ? netVatPayable.toFixed(2) : '0.00',
    };

    return {
      period: { from: dateFrom.toISOString().split('T')[0], to: dateTo.toISOString().split('T')[0] },
      companyId,
      boxes,
      summary: {
        netVatPayable: netVatPayable.toFixed(2),
        isRefundDue: netVatPayable.lt(0),
        refundAmount: netVatPayable.lt(0) ? netVatPayable.abs().toFixed(2) : '0.00',
      },
      // JSON structured for ETA API submission
      etaPayload: {
        header: { taxType: 'VAT', periodType: 'MONTHLY', periodYear: dateFrom.getFullYear(), periodMonth: dateFrom.getMonth() + 1 },
        transactions: Object.entries(boxes).map(([box, value]) => ({ boxCode: box, value })),
      },
    };
  }

  async glByAccount(
    companyId: string,
    accountId: string,
    dateFrom?: Date,
    dateTo?: Date,
    page = 1,
    limit = 50,
  ) {
    const where: any = {
      accountId,
      journalEntry: {
        status: 'POSTED',
        journal: { companyId },
        ...(dateFrom || dateTo
          ? {
              date: {
                ...(dateFrom && { gte: dateFrom }),
                ...(dateTo && { lte: dateTo }),
              },
            }
          : {}),
      },
    };
    const [items, total] = await Promise.all([
      this.prisma.journalEntryLine.findMany({
        where,
        include: {
          account: { select: { code: true, name: true } },
          journalEntry: {
            select: { id: true, ref: true, date: true, status: true },
          },
        },
        orderBy: { journalEntry: { date: 'desc' } },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.journalEntryLine.count({ where }),
    ]);
    return { items, total, page, limit };
  }
}
