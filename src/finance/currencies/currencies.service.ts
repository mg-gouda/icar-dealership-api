import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class CurrenciesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // ── Base Currency ──

  async getBaseCurrency(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { baseCurrency: { select: { id: true, code: true, symbol: true } } },
    });
    return company?.baseCurrency ?? null;
  }

  // ── Currencies ──

  async list(query: { activeOnly?: string }) {
    const activeOnly = query.activeOnly !== 'false';
    return this.prisma.currency.findMany({
      where: activeOnly ? { active: true } : {},
      select: { id: true, code: true, symbol: true, decimalPlaces: true, active: true },
      orderBy: { code: 'asc' },
    });
  }

  async getById(id: string) {
    const currency = await this.prisma.currency.findUnique({
      where: { id },
      select: { id: true, code: true, symbol: true, decimalPlaces: true, active: true },
    });
    if (!currency) throw new NotFoundException('Currency not found');
    return currency;
  }

  async toggleActive(id: string, active: boolean, userId: string) {
    const currency = await this.prisma.currency.findUnique({ where: { id } });
    if (!currency) throw new NotFoundException('Currency not found');

    const updated = await this.prisma.currency.update({
      where: { id },
      data: { active },
    });
    await this.audit.log({
      userId, action: 'UPDATE', entity: 'Currency', entityId: id,
      changes: { active: { before: currency.active, after: active } },
    });
    return updated;
  }

  // ── Exchange Rates ──

  async listRates(currencyId: string, query: {
    dateFrom?: string; dateTo?: string; page?: number; limit?: number;
  }) {
    const { dateFrom, dateTo, page = 1, limit = 20 } = query;
    const where: any = { currencyId };

    if (dateFrom || dateTo) {
      where.date = {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo && { lte: new Date(dateTo) }),
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.currencyRate.findMany({
        where,
        include: { currency: { select: { code: true, symbol: true } } },
        orderBy: { date: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      this.prisma.currencyRate.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async getRate(currencyId: string, date: string) {
    return this.prisma.currencyRate.findFirst({
      where: {
        currencyId,
        date: { lte: new Date(date) },
      },
      orderBy: { date: 'desc' },
      include: { currency: { select: { code: true, symbol: true } } },
    });
  }

  async upsertRate(data: {
    currencyId: string; date: string; rate: number;
  }, userId: string) {
    const dateObj = new Date(data.date);

    const result = await this.prisma.currencyRate.upsert({
      where: {
        currencyId_date: {
          currencyId: data.currencyId,
          date: dateObj,
        },
      },
      create: {
        currencyId: data.currencyId,
        date: dateObj,
        rate: data.rate,
      },
      update: { rate: data.rate },
    });

    await this.audit.log({
      userId, action: 'UPSERT', entity: 'CurrencyRate', entityId: result.id,
    });
    return result;
  }

  async deleteRate(id: string, userId: string) {
    const rate = await this.prisma.currencyRate.findUnique({ where: { id } });
    if (!rate) throw new NotFoundException('Rate not found');

    await this.prisma.currencyRate.delete({ where: { id } });
    await this.audit.log({
      userId, action: 'DELETE', entity: 'CurrencyRate', entityId: id,
    });
    return { deleted: true };
  }

  async revaluate(companyId: string, userId: string) {
    // Find open foreign-currency GL lines with amountCurrency set
    const openLines = await this.prisma.journalEntryLine.findMany({
      where: {
        currencyId: { not: null },
        amountCurrency: { not: null },
        reconciled: false,
        journalEntry: { status: 'POSTED', journal: { companyId } },
      },
      include: { journalEntry: { include: { journal: true } } },
    });

    if (openLines.length === 0) return { revaluedCount: 0, totalVariance: 0 };

    // Resolve 8100 (Unrealized Exchange Gain/Loss)
    const fxAccount = await this.prisma.account.findFirst({ where: { companyId, code: '8100' } });
    if (!fxAccount) throw new Error('COA account 8100 (Unrealized Exchange Gain/Loss) not found. Run seed first.');

    // Get a GENERAL journal for the company
    const generalJournal = await this.prisma.journal.findFirst({ where: { companyId, type: 'GENERAL' } });
    if (!generalJournal) throw new Error('No GENERAL journal found for company. Run seed first.');

    const today = new Date();
    let revaluedCount = 0;
    let totalVariance = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const line of openLines) {
        if (!line.currencyId || !line.amountCurrency) continue;

        const latestRate = await tx.currencyRate.findFirst({
          where: { currencyId: line.currencyId, date: { lte: today } },
          orderBy: { date: 'desc' },
        });
        if (!latestRate) continue;

        const fxAmount = Number(line.amountCurrency) * Number(latestRate.rate);
        const bookValue = Number(line.debit) > 0 ? Number(line.debit) : -Number(line.credit);
        const variance = fxAmount - bookValue;
        if (Math.abs(variance) < 0.01) continue;

        await tx.journalEntry.create({
          data: {
            journalId: generalJournal.id,
            date: today,
            ref: `REVAL-${today.toISOString().slice(0, 10)}`,
            status: 'POSTED',
            lines: {
              create: [
                { accountId: line.accountId, debit: variance > 0 ? variance : 0, credit: variance < 0 ? -variance : 0, label: 'FX Revaluation adjustment' },
                { accountId: fxAccount.id, debit: variance < 0 ? -variance : 0, credit: variance > 0 ? variance : 0, label: 'Unrealized Exchange Gain/Loss' },
              ],
            },
          },
        });
        revaluedCount++;
        totalVariance += variance;
      }
    });

    await this.audit.log({ userId, action: 'REVALUATE', entity: 'Currency', entityId: companyId, changes: { revaluedCount, totalVariance } });
    return { revaluedCount, totalVariance: Math.round(totalVariance * 100) / 100 };
  }

  async importRates(data: {
    currencyId: string;
    rates: Array<{ date: string; rate: number }>;
  }, userId: string) {
    const ops = data.rates.map((r) =>
      this.prisma.currencyRate.upsert({
        where: {
          currencyId_date: {
            currencyId: data.currencyId,
            date: new Date(r.date),
          },
        },
        create: {
          currencyId: data.currencyId,
          date: new Date(r.date),
          rate: r.rate,
        },
        update: { rate: r.rate },
      }),
    );

    const results = await this.prisma.$transaction(ops);
    await this.audit.log({
      userId, action: 'IMPORT', entity: 'CurrencyRate',
      entityId: data.currencyId,
      changes: { count: results.length },
    });
    return { imported: results.length };
  }
}
