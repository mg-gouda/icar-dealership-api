import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma, AssetMethodType } from '@prisma/client';
import Decimal from 'decimal.js';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class AssetsService {
  constructor(private prisma: PrismaService) {}

  async list(companyId: string, query: { state?: string; page?: number; limit?: number }) {
    const { state, page = 1, limit = 20 } = query;
    // ponytail: Asset has no companyId field — filter via assetAccount relation
    const where: Prisma.AssetWhereInput = { assetAccount: { companyId } };
    if (state) where.state = state as Prisma.EnumAssetStateFilter['equals'];

    const [items, total] = await Promise.all([
      this.prisma.asset.findMany({
        where,
        include: {
          assetAccount: { select: { code: true, name: true } },
          depreciationExpenseAccount: { select: { code: true, name: true } },
          _count: { select: { depreciationLines: true } },
        },
        orderBy: { startDate: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      this.prisma.asset.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async getById(id: string, companyId?: string) {
    // ponytail: Asset has no companyId — scope via assetAccount relation when provided
    const where: Prisma.AssetWhereInput = companyId
      ? { id, assetAccount: { companyId } }
      : { id };
    const asset = await this.prisma.asset.findFirst({
      where,
      include: {
        assetAccount: true,
        depreciationExpenseAccount: true,
        accumulatedDepAccount: true,
        depreciationLines: { orderBy: { sequence: 'asc' } },
      },
    });
    if (!asset) throw new NotFoundException('Asset not found');
    return asset;
  }

  async create(data: {
    name: string;
    assetAccountId: string;
    depreciationExpenseAccountId: string;
    accumulatedDepAccountId: string;
    originalValue: number;
    salvageValue?: number;
    method?: string;
    decliningRate?: number;
    durationMonths: number;
    startDate: Date;
    vendorBillId?: string;
  }) {
    // B-24: Atomic create — asset + depreciation lines in single transaction
    const asset = await this.prisma.$transaction(async (tx) => {
      const createData: Prisma.AssetUncheckedCreateInput = {
        name: data.name,
        assetAccountId: data.assetAccountId,
        depreciationExpenseAccountId: data.depreciationExpenseAccountId,
        accumulatedDepAccountId: data.accumulatedDepAccountId,
        originalValue: data.originalValue,
        salvageValue: data.salvageValue ?? 0,
        method: (data.method as AssetMethodType) ?? 'LINEAR',
        decliningRate: data.decliningRate ?? null,
        durationMonths: data.durationMonths,
        startDate: data.startDate,
        vendorBillId: data.vendorBillId ?? null,
      };
      const a = await tx.asset.create({ data: createData });
      const lines = this.computeDepreciationSchedule(a);
      await tx.assetDepreciationLine.createMany({
        data: lines.map((l, idx) => ({
          assetId: a.id,
          sequence: idx + 1,
          date: l.date,
          amount: l.amount,
          accumulatedAmount: l.accumulated,
          remainingValue: l.remaining,
        })),
      });
      return a;
    });

    return this.getById(asset.id);
  }

  async update(id: string, data: Prisma.AssetUncheckedUpdateInput, userId: string, companyId: string) {
    // ponytail: verify cross-company ownership before mutating — mirrors getById pattern
    const existing = await this.prisma.asset.findFirst({
      where: { id, assetAccount: { companyId } },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Asset not found');
    const updated = await this.prisma.$transaction(async (tx) => {
      const a = await tx.asset.update({ where: { id }, data });
      // Regenerate unposted depreciation lines — posted lines are left untouched
      await tx.assetDepreciationLine.deleteMany({ where: { assetId: id, posted: false } });
      const lines = this.computeDepreciationSchedule(a);
      await tx.assetDepreciationLine.createMany({
        data: lines.map((l, idx) => ({
          assetId: a.id,
          sequence: idx + 1,
          date: l.date,
          amount: l.amount,
          accumulatedAmount: l.accumulated,
          remainingValue: l.remaining,
        })),
      });
      return a;
    });
    return this.getById(updated.id);
  }

  async createFromInvoiceLine(
    invoiceLineId: string,
    overrides: Record<string, unknown>,
    userId: string,
  ) {
    const line = await this.prisma.invoiceLine.findUniqueOrThrow({
      where: { id: invoiceLineId },
      include: { invoice: { select: { id: true, partnerId: true } } },
    });
    // ponytail: pre-fill asset from bill line values; caller can override any field
    if (!overrides.depreciationExpenseAccountId) {
      throw new BadRequestException('depreciationExpenseAccountId is required');
    }
    if (!overrides.accumulatedDepAccountId) {
      throw new BadRequestException('accumulatedDepAccountId is required');
    }
    return this.create({
      name: String(overrides.name ?? line.description ?? 'Asset'),
      assetAccountId: String(overrides.assetAccountId ?? line.accountId),
      depreciationExpenseAccountId: String(overrides.depreciationExpenseAccountId),
      accumulatedDepAccountId: String(overrides.accumulatedDepAccountId),
      originalValue: Number(overrides.originalValue ?? line.subtotal),
      salvageValue:
        overrides.salvageValue != null ? Number(overrides.salvageValue) : 0,
      method: String(overrides.method ?? 'LINEAR'),
      durationMonths: Number(overrides.durationMonths ?? 60),
      startDate: overrides.startDate
        ? new Date(String(overrides.startDate))
        : new Date(),
      vendorBillId: line.invoiceId,
    });
  }

  async postDepreciationLine(
    assetId: string,
    lineId: string,
    journalId: string,
  ) {
    const line = await this.prisma.assetDepreciationLine.findFirst({
      where: { id: lineId, assetId },
      include: { asset: true },
    });
    if (!line) throw new NotFoundException('Depreciation line not found');
    if (line.posted) throw new BadRequestException('Line already posted');

    const entry = await this.prisma.$transaction(async (tx) => {
      // B-8: Fiscal period check before posting depreciation
      const journal = await tx.journal.findUniqueOrThrow({ where: { id: journalId } });
      const fiscal = await tx.fiscalYear.findFirst({
        where: { companyId: journal.companyId, startDate: { lte: line.date }, endDate: { gte: line.date } },
      });
      if (!fiscal) throw new BadRequestException('No open fiscal year for the posting date.');
      if (fiscal.lockDate && line.date <= fiscal.lockDate)
        throw new BadRequestException('Fiscal period is locked.');

      const je = await tx.journalEntry.create({
        data: {
          journalId,
          assetDepreciationLineId: lineId,
          date: line.date,
          ref: `DEP/${line.assetId}/${line.sequence} – ${line.asset.name}`,
          status: 'POSTED',
          lines: {
            create: [
              {
                accountId: line.asset.depreciationExpenseAccountId,
                label: `Depreciation – ${line.asset.name}`,
                debit: line.amount,
                credit: 0,
              },
              {
                accountId: line.asset.accumulatedDepAccountId,
                label: `Accumulated Dep – ${line.asset.name}`,
                debit: 0,
                credit: line.amount,
              },
            ],
          },
        },
      });

      await tx.assetDepreciationLine.update({
        where: { id: lineId },
        data: { posted: true },
      });

      return je;
    });

    return entry;
  }

  private computeDepreciationSchedule(asset: {
    originalValue: Decimal | number;
    salvageValue: Decimal | number;
    durationMonths: number;
    startDate: Date;
    method: string;
    decliningRate?: Decimal | number | null;
  }) {
    const original = new Decimal(asset.originalValue.toString());
    const salvage = new Decimal(asset.salvageValue.toString());
    const depreciable = original.minus(salvage);
    const months = asset.durationMonths;
    const lines: {
      date: Date;
      amount: Decimal;
      accumulated: Decimal;
      remaining: Decimal;
    }[] = [];
    let accumulated = new Decimal(0);

    for (let i = 0; i < months; i++) {
      const date = new Date(asset.startDate);
      date.setMonth(date.getMonth() + i + 1);

      let amount: Decimal;
      if (asset.method === 'DECLINING' && asset.decliningRate) {
        const rate = new Decimal(asset.decliningRate.toString())
          .div(100)
          .div(12);
        const bookValue = original.minus(accumulated);
        amount = bookValue.times(rate).toDecimalPlaces(2);
      } else {
        amount = depreciable.div(months).toDecimalPlaces(2);
      }

      // Last line absorbs rounding
      if (i === months - 1) {
        amount = original.minus(salvage).minus(accumulated).toDecimalPlaces(2);
      }

      accumulated = accumulated.plus(amount);
      lines.push({
        date,
        amount,
        accumulated,
        remaining: original.minus(accumulated).toDecimalPlaces(2),
      });
    }

    return lines;
  }

  async depreciateByMonth(
    assetId: string,
    month: string,
    journalId: string | undefined,
    userId: string,
    companyId: string,
  ) {
    // Find the next unposted line whose date falls within `month` (YYYY-MM)
    const [year, mon] = month.split('-').map(Number);
    const from = new Date(year, mon - 1, 1);
    const to = new Date(year, mon, 0); // last day of month
    const line = await this.prisma.assetDepreciationLine.findFirst({
      where: { assetId, posted: false, date: { gte: from, lte: to } },
      orderBy: { sequence: 'asc' },
    });
    if (!line)
      throw new BadRequestException(
        `No unposted depreciation line for ${month}`,
      );

    const journal = journalId
      ? await this.prisma.journal.findUniqueOrThrow({
          where: { id: journalId },
        })
      : await this.prisma.journal.findFirstOrThrow({
          // ponytail: companyId scopes fallback — prevents cross-company journal pick
          where: { type: 'GENERAL', companyId },
        });

    return this.postDepreciationLine(assetId, line.id, journal.id);
  }

  async getSchedule(id: string, companyId?: string) {
    // ponytail: dedicated schedule fetch — includes journalEntry per line
    const where: Prisma.AssetWhereInput = companyId
      ? { id, assetAccount: { companyId } }
      : { id };
    const asset = await this.prisma.asset.findFirst({ where });
    if (!asset) throw new NotFoundException('Asset not found');
    return this.prisma.assetDepreciationLine.findMany({
      where: { assetId: id },
      include: { journalEntry: { select: { id: true, status: true, ref: true, date: true } } },
      orderBy: { sequence: 'asc' },
    });
  }

  async dispose(
    assetId: string,
    body: { date: string; proceedsAmount?: number; journalId?: string },
    userId: string,
  ) {
    const asset = await this.getById(assetId);
    if (asset.state === 'CLOSED')
      throw new BadRequestException('Asset already closed/disposed');

    // ponytail: enforce atomic disposal — silent no-GL retirement violates business rule #4
    if (!body.journalId)
      throw new BadRequestException('journalId required for disposal GL posting');

    const proceeds = new Decimal(body.proceedsAmount ?? 0);
    const postedLines = asset.depreciationLines.filter((l) => l.posted);
    const accumulated = postedLines.length
      ? new Decimal(postedLines[postedLines.length - 1].accumulatedAmount.toString())
      : new Decimal(0);
    const bookValue = new Decimal(asset.originalValue.toString()).minus(accumulated);
    const gainLoss = proceeds.minus(bookValue);
    const disposeDate = new Date(body.date);
    const journalId = body.journalId;

    await this.prisma.$transaction(async (tx) => {
      await tx.asset.update({ where: { id: assetId }, data: { state: 'CLOSED' } });

      // B-8: Fiscal period check before posting disposal
      const journal = await tx.journal.findUniqueOrThrow({ where: { id: journalId } });
      const fiscal = await tx.fiscalYear.findFirst({
        where: { companyId: journal.companyId, startDate: { lte: disposeDate }, endDate: { gte: disposeDate } },
      });
      if (!fiscal) throw new BadRequestException('No open fiscal year for the posting date.');
      if (fiscal.lockDate && disposeDate <= fiscal.lockDate)
        throw new BadRequestException('Fiscal period is locked.');

      interface GlLine { accountId: string; label: string; debit: number; credit: number }
      const glLines: GlLine[] = [
        // Remove asset at cost: CR Fixed Asset
        { accountId: asset.assetAccountId, label: `Disposal – ${asset.name}`, debit: 0, credit: Number(asset.originalValue) },
        // Remove accumulated depreciation: DR Acc Dep
        { accountId: asset.accumulatedDepAccountId, label: `Acc Dep – ${asset.name}`, debit: accumulated.toNumber(), credit: 0 },
      ];
      if (proceeds.gt(0)) {
        // F-7: Throw if proceeds account not found
        const bankAcc = await tx.account.findFirst({ where: { code: '1210', companyId: journal.companyId } });
        if (!bankAcc) throw new BadRequestException('GL account 1210 (disposal proceeds) not found in COA. Run seed first.');
        glLines.push({ accountId: bankAcc.id, label: 'Disposal proceeds', debit: proceeds.toNumber(), credit: 0 });
      }
      // Gain: CR Other Income (if gain > 0) / Loss: DR Expense (if loss > 0)
      if (!gainLoss.isZero()) {
        const glAccCode = gainLoss.gt(0) ? '4900' : '6700';
        const glAcc = await tx.account.findFirst({
          where: { code: glAccCode, companyId: journal.companyId },
        });
        // F-7: Throw if gain/loss account not found
        if (!glAcc) throw new BadRequestException(`GL account ${glAccCode} (${gainLoss.gt(0) ? 'gain' : 'loss'} on disposal) not found in COA. Run seed first.`);
        glLines.push(gainLoss.gt(0)
          ? { accountId: glAcc.id, label: 'Gain on disposal', debit: 0, credit: gainLoss.toNumber() }
          : { accountId: glAcc.id, label: 'Loss on disposal', debit: gainLoss.negated().toNumber(), credit: 0 });
      }
      // F-7: Assert balanced before posting
      const totalDebit = glLines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = glLines.reduce((s, l) => s + l.credit, 0);
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        throw new BadRequestException(`Disposal entry unbalanced: DR ${totalDebit} != CR ${totalCredit}`);
      }
      await tx.journalEntry.create({
        data: {
          journalId,
          date: disposeDate,
          ref: `DISP/${asset.name}`,
          status: 'POSTED',
          lines: { create: glLines },
        },
      });
    });

    return { asset: await this.getById(assetId), bookValue, proceeds, gainLoss };
  }
}
