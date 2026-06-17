import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class AssetsService {
  constructor(private prisma: PrismaService) {}

  async list(query: { state?: string; page?: number; limit?: number }) {
    const { state, page = 1, limit = 20 } = query;
    const where: any = {};
    if (state) where.state = state;

    const [items, total] = await Promise.all([
      this.prisma.asset.findMany({
        where,
        include: {
          assetAccount: { select: { code: true, name: true } },
          depreciationExpenseAccount: { select: { code: true, name: true } },
          _count: { select: { depreciationLines: true } },
        },
        orderBy: { startDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.asset.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async getById(id: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id },
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
    const asset = await this.prisma.asset.create({ data: data as any });
    const lines = this.computeDepreciationSchedule(asset as any);

    await this.prisma.assetDepreciationLine.createMany({
      data: lines.map((l, idx) => ({
        assetId: asset.id,
        sequence: idx + 1,
        date: l.date,
        amount: l.amount,
        accumulatedAmount: l.accumulated,
        remainingValue: l.remaining,
      })),
    });

    return this.getById(asset.id);
  }

  async postDepreciationLine(assetId: string, lineId: string, journalId: string) {
    const line = await this.prisma.assetDepreciationLine.findFirst({
      where: { id: lineId, assetId },
      include: { asset: true },
    });
    if (!line) throw new NotFoundException('Depreciation line not found');
    if (line.posted) throw new BadRequestException('Line already posted');

    const entry = await this.prisma.$transaction(async (tx) => {
      const je = await tx.journalEntry.create({
        data: {
          journalId,
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
    const lines: { date: Date; amount: Decimal; accumulated: Decimal; remaining: Decimal }[] = [];
    let accumulated = new Decimal(0);

    for (let i = 0; i < months; i++) {
      const date = new Date(asset.startDate);
      date.setMonth(date.getMonth() + i + 1);

      let amount: Decimal;
      if (asset.method === 'DECLINING' && asset.decliningRate) {
        const rate = new Decimal(asset.decliningRate.toString()).div(100).div(12);
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
}
