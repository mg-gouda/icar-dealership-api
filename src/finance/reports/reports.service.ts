import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { COA } from '../coa.constants';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async trialBalance(companyId: string, dateFrom: Date, dateTo: Date, locationId?: string) {
    const journalWhere = { companyId, ...(locationId && { locationId }) };
    const entryWhere = { status: 'POSTED' as const, journal: journalWhere };

    const [openingRows, periodRows] = await Promise.all([
      this.prisma.journalEntryLine.groupBy({
        by: ['accountId'],
        where: { journalEntry: { ...entryWhere, date: { lt: dateFrom } } },
        _sum: { debit: true, credit: true },
      }),
      this.prisma.journalEntryLine.groupBy({
        by: ['accountId'],
        where: { journalEntry: { ...entryWhere, date: { gte: dateFrom, lte: dateTo } } },
        _sum: { debit: true, credit: true },
      }),
    ]);

    const allAccountIds = [...new Set([...openingRows.map((r) => r.accountId), ...periodRows.map((r) => r.accountId)])];
    const accounts = await this.prisma.account.findMany({
      where: { id: { in: allAccountIds } },
      select: { id: true, code: true, name: true, type: true },
    });
    const accMap = new Map(accounts.map((a) => [a.id, a]));

    const toDecimal = (val: any) => new Decimal(val?.toString() ?? '0');
    const openMap = new Map(openingRows.map((r) => [r.accountId, r._sum]));
    const periodMap = new Map(periodRows.map((r) => [r.accountId, r._sum]));

    return allAccountIds
      .map((accountId) => {
        const acc = accMap.get(accountId);
        const op = openMap.get(accountId);
        const pr = periodMap.get(accountId);
        const openDebit = toDecimal(op?.debit);
        const openCredit = toDecimal(op?.credit);
        const openingBalance = openDebit.minus(openCredit);
        const periodDebit = toDecimal(pr?.debit);
        const periodCredit = toDecimal(pr?.credit);
        const closingBalance = openingBalance.plus(periodDebit).minus(periodCredit);
        return {
          accountId,
          code: acc?.code ?? '',
          name: acc?.name ?? '',
          type: acc?.type ?? '',
          openingBalance,
          periodDebit,
          periodCredit,
          closingBalance,
        };
      })
      .sort((a, b) => a.code.localeCompare(b.code));
  }

  async incomeStatement(companyId: string, dateFrom: Date, dateTo: Date, locationId?: string) {
    const incomeTypes = ['INCOME'];
    const expenseTypes = ['EXPENSE', 'COST_OF_REVENUE'];
    const journalWhere = { companyId, ...(locationId && { locationId }) };

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
          journal: journalWhere,
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

  async revenueByMonth(companyId: string, months = 6, locationId?: string) {
    // ponytail: single raw query replaces 2*N loop
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    // ponytail: conditional fragment — no SQL duplication
    const locFilter = locationId ? Prisma.sql`AND j."locationId" = ${locationId}` : Prisma.sql``;

    const rows = await this.prisma.$queryRaw<
      Array<{ month: string; revenue: string; expenses: string }>
    >`
      SELECT
        TO_CHAR(je.date, 'YYYY-MM') AS month,
        SUM(CASE WHEN a.type = 'INCOME' THEN jel.credit - jel.debit ELSE 0 END) AS revenue,
        SUM(CASE WHEN a.type IN ('EXPENSE', 'COST_OF_REVENUE') THEN jel.debit - jel.credit ELSE 0 END) AS expenses
      FROM "JournalEntryLine" jel
      JOIN "JournalEntry" je ON je.id = jel."journalEntryId"
      JOIN "Journal" j ON j.id = je."journalId"
      JOIN "Account" a ON a.id = jel."accountId"
      WHERE j."companyId" = ${companyId}
        AND je.status = 'POSTED'
        AND je.date >= ${startDate}
        AND je.date <= ${endDate}
        AND a.type IN ('INCOME', 'EXPENSE', 'COST_OF_REVENUE')
        ${locFilter}
      GROUP BY TO_CHAR(je.date, 'YYYY-MM')
      ORDER BY month
    `;

    // Build full month list so months with zero activity still appear
    const monthMap = new Map<string, { revenue: number; expenses: number }>();
    for (const r of rows) {
      monthMap.set(r.month, {
        revenue: Number(r.revenue),
        expenses: Number(r.expenses),
      });
    }

    const result: { month: string; revenue: number; expenses: number }[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('en', { month: 'short' });
      const data = monthMap.get(key) ?? { revenue: 0, expenses: 0 };
      result.push({ month: label, ...data });
    }
    return { months: result };
  }

  async branchProfit(companyId: string, locationId?: string) {
    // ponytail: single raw query replaces 2*N loop
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    // ponytail: conditional fragment — no SQL duplication
    const locFilter = locationId ? Prisma.sql`AND j."locationId" = ${locationId}` : Prisma.sql``;

    const rows = await this.prisma.$queryRaw<
      Array<{ locationId: string; revenue: string; expenses: string }>
    >`
      SELECT
        j."locationId",
        SUM(CASE WHEN a.type = 'INCOME' THEN jel.credit - jel.debit ELSE 0 END) AS revenue,
        SUM(CASE WHEN a.type IN ('EXPENSE', 'COST_OF_REVENUE') THEN jel.debit - jel.credit ELSE 0 END) AS expenses
      FROM "JournalEntryLine" jel
      JOIN "JournalEntry" je ON je.id = jel."journalEntryId"
      JOIN "Journal" j ON j.id = je."journalId"
      JOIN "Account" a ON a.id = jel."accountId"
      WHERE j."companyId" = ${companyId}
        AND je.status = 'POSTED'
        AND je.date >= ${from}
        AND j."locationId" IS NOT NULL
        AND a.type IN ('INCOME', 'EXPENSE', 'COST_OF_REVENUE')
        ${locFilter}
      GROUP BY j."locationId"
    `;

    // Resolve location names
    const locationIds = rows.map((r) => r.locationId);
    const locations = locationIds.length
      ? await this.prisma.location.findMany({
          where: { id: { in: locationIds } },
          select: { id: true, name: true },
        })
      : [];
    const locMap = new Map(locations.map((l) => [l.id, l.name]));

    const result = rows.map((r) => ({
      branch: locMap.get(r.locationId) ?? r.locationId,
      gross: Number(r.revenue) - Number(r.expenses),
    }));
    return { branches: result.sort((a, b) => b.gross - a.gross) };
  }

  async balanceSheet(companyId: string, asOf: Date, fiscalYearStart?: Date, locationId?: string) {
    const assetTypes = ['ASSET'];
    const liabilityTypes = ['LIABILITY'];
    const equityTypes = ['EQUITY'];
    // Default fiscal year start: Jan 1 of asOf's year
    const fyStart = fiscalYearStart ?? new Date(asOf.getFullYear(), 0, 1);
    const journalWhere = { companyId, ...(locationId && { locationId }) };

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
          journal: journalWhere,
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

    // Inject current-period net income into equity so totalAssets == totalLiabilitiesAndEquity
    const is = await this.incomeStatement(companyId, fyStart, asOf, locationId);
    if (!is.netProfit.isZero()) {
      equity.push({
        accountId: null,
        code: '',
        name: 'Current Period Net Income',
        type: 'EQUITY',
        balance: is.netProfit,
        synthetic: true,
      });
      totalEquity = totalEquity.plus(is.netProfit);
    }

    return {
      assets: assets.sort((a, b) => a.code.localeCompare(b.code)),
      liabilities: liabilities.sort((a, b) => a.code.localeCompare(b.code)),
      equity: equity.sort((a, b) => a.code.localeCompare(b.code)),
      totalAssets,
      totalLiabilities,
      totalEquity,
      totalLiabilitiesAndEquity: totalLiabilities.plus(totalEquity),
      currentPeriodNetIncome: is.netProfit,
    };
  }

  async agedReceivables(companyId: string, asOf: Date, locationId?: string) {
    return this.agedReport(companyId, asOf, 'CUSTOMER_INVOICE', locationId);
  }

  async agedPayables(companyId: string, asOf: Date, locationId?: string) {
    return this.agedReport(companyId, asOf, 'VENDOR_BILL', locationId);
  }

  private async agedReport(companyId: string, asOf: Date, invoiceType: string, locationId?: string) {
    const journalWhere = { companyId, ...(locationId && { locationId }) };
    const invoices = await this.prisma.invoice.findMany({
      where: {
        type: invoiceType as any,
        status: 'POSTED',
        paymentStatus: { not: 'PAID' },
        journal: journalWhere,
        date: { lte: asOf },
      },
      include: {
        partner: { select: { id: true, name: true } },
      },
    });

    const partnerMap = new Map<
      string,
      {
        partnerId: string;
        partnerName: string;
        current: Decimal;
        b30: Decimal;
        b60: Decimal;
        b90: Decimal;
        b90plus: Decimal;
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
          b90plus: new Decimal(0),
          total: new Decimal(0),
        });
      }

      const entry = partnerMap.get(pid)!;
      entry.total = entry.total.plus(residual);

      if (daysOverdue <= 0) entry.current = entry.current.plus(residual);
      else if (daysOverdue <= 30) entry.b30 = entry.b30.plus(residual);
      else if (daysOverdue <= 60) entry.b60 = entry.b60.plus(residual);
      else if (daysOverdue <= 90) entry.b90 = entry.b90.plus(residual);
      else entry.b90plus = entry.b90plus.plus(residual);
    }

    return Array.from(partnerMap.values()).sort((a, b) =>
      a.partnerName.localeCompare(b.partnerName),
    );
  }

  async cashFlow(companyId: string, dateFrom: Date, dateTo: Date, locationId?: string) {
    // ponytail: simplified indirect method
    const is = await this.incomeStatement(companyId, dateFrom, dateTo, locationId);
    const netProfit = is.netProfit;
    const journalWhere = { companyId, ...(locationId && { locationId }) };

    // Depreciation: sum JEL on accounts with code '6500' (depreciation expense) in period
    const depRows = await this.prisma.journalEntryLine.aggregate({
      where: {
        account: { companyId, code: COA.DEPRECIATION_EXPENSE },
        journalEntry: {
          status: 'POSTED',
          date: { gte: dateFrom, lte: dateTo },
          journal: journalWhere,
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
        account: { companyId, code: COA.ACCOUNTS_RECEIVABLE },
        journalEntry: {
          status: 'POSTED',
          date: { gte: dateFrom, lte: dateTo },
          journal: journalWhere,
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
        account: { companyId, code: COA.ACCOUNTS_PAYABLE },
        journalEntry: {
          status: 'POSTED',
          date: { gte: dateFrom, lte: dateTo },
          journal: journalWhere,
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

  async taxReport(companyId: string, dateFrom: Date, dateTo: Date, locationId?: string) {
    // ponytail: single query replaces 3*N loop
    const taxGroups = await this.prisma.taxGroup.findMany({
      include: {
        taxes: {
          select: {
            amount: true,
            accountId: true,
            account: { select: { id: true, type: true } },
          },
        },
      },
    });

    // Collect all tax account IDs across all groups for one bulk query
    const allAccountIds = [
      ...new Set(taxGroups.flatMap((tg) => tg.taxes.map((t) => t.accountId))),
    ];
    if (!allAccountIds.length) return [];

    // Single raw query: sum debits/credits per accountId in the period
    const locFilter = locationId ? Prisma.sql`AND j."locationId" = ${locationId}` : Prisma.sql``;
    const rows = await this.prisma.$queryRaw<
      Array<{ accountId: string; totalDebit: string; totalCredit: string }>
    >`
      SELECT
        jel."accountId",
        SUM(jel.debit)  AS "totalDebit",
        SUM(jel.credit) AS "totalCredit"
      FROM "JournalEntryLine" jel
      JOIN "JournalEntry" je ON je.id = jel."journalEntryId"
      JOIN "Journal" j ON j.id = je."journalId"
      WHERE j."companyId" = ${companyId}
        AND je.status = 'POSTED'
        AND je.date >= ${dateFrom}
        AND je.date <= ${dateTo}
        ${locFilter}
        AND jel."accountId" IN (SELECT unnest(${allAccountIds}::text[]))
      GROUP BY jel."accountId"
    `;

    const sumMap = new Map(
      rows.map((r) => [r.accountId, { debit: new Decimal(r.totalDebit), credit: new Decimal(r.totalCredit) }]),
    );

    const results: {
      taxGroupId: string;
      taxGroupName: string;
      rate: Decimal;
      taxCollected: Decimal;
      taxPaid: Decimal;
      netPayable: Decimal;
    }[] = [];

    for (const tg of taxGroups) {
      if (!tg.taxes.length) continue;

      const avgRate = tg.taxes
        .reduce((sum, t) => sum.plus(new Decimal(t.amount.toString())), new Decimal(0))
        .div(tg.taxes.length);

      let taxCollected = new Decimal(0);
      let taxPaid = new Decimal(0);

      for (const tax of tg.taxes) {
        const sums = sumMap.get(tax.accountId);
        if (!sums) continue;
        // LIABILITY accounts = output VAT (collected), ASSET accounts = input VAT (reclaimable)
        if (tax.account.type === 'LIABILITY') {
          taxCollected = taxCollected.plus(sums.credit.minus(sums.debit));
        } else if (tax.account.type === 'ASSET') {
          taxPaid = taxPaid.plus(sums.debit.minus(sums.credit));
        }
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

  async vatReturnEta(companyId: string, dateFrom: Date, dateTo: Date, locationId?: string) {
    // ETA VAT return — boxes 1-13 per Egyptian Tax Authority format
    const journalWhere = { companyId, ...(locationId && { locationId }) };
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
          journalEntry: { status: 'POSTED', date: { gte: dateFrom, lte: dateTo }, journal: journalWhere },
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
      where: { companyId, code: COA.OUTPUT_VAT },
      select: { id: true },
    });
    const inputVatAccount = await this.prisma.account.findFirst({
      where: { companyId, code: COA.INPUT_VAT },
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
    locationId?: string,
  ) {
    const journalWhere = { companyId, ...(locationId && { locationId }) };
    const where: any = {
      accountId,
      journalEntry: {
        status: 'POSTED',
        journal: journalWhere,
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
    // Opening balance: sum of (debit - credit) for all posted lines on this
    // account before the dateFrom boundary. Zero when no dateFrom is supplied.
    let openingBalance = new Decimal(0);
    if (dateFrom) {
      const openingAgg = await this.prisma.journalEntryLine.aggregate({
        where: {
          accountId,
          journalEntry: {
            status: 'POSTED',
            journal: journalWhere,
            date: { lt: dateFrom },
          },
        },
        _sum: { debit: true, credit: true },
      });
      const obDebit = new Decimal(openingAgg._sum?.debit?.toString() ?? '0');
      const obCredit = new Decimal(openingAgg._sum?.credit?.toString() ?? '0');
      openingBalance = obDebit.minus(obCredit);
    }

    const [rawItems, total] = await Promise.all([
      this.prisma.journalEntryLine.findMany({
        where,
        include: {
          account: { select: { code: true, name: true } },
          journalEntry: {
            select: { id: true, ref: true, date: true, status: true },
          },
        },
        orderBy: { journalEntry: { date: 'asc' } },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.journalEntryLine.count({ where }),
    ]);

    // Accumulate running balance per line in the page
    let running = openingBalance;
    const items = rawItems.map((item) => {
      running = running
        .plus(new Decimal(item.debit.toString()))
        .minus(new Decimal(item.credit.toString()));
      return { ...item, runningBalance: running.toFixed(2) };
    });

    return { items, total, page, limit, openingBalance: openingBalance.toFixed(2) };
  }
}
