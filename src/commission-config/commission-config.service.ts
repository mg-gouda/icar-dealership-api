import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class CommissionConfigService {
  constructor(private prisma: PrismaService) {}

  async getConfig(companyId: string) {
    return this.prisma.commissionConfig.findUnique({
      where: { companyId },
      include: { tiers: { orderBy: { minTargetPct: 'asc' } } },
    });
  }

  async upsertConfig(
    companyId: string,
    data: {
      baseAmount: number;
      tiers: { minTargetPct: number; amount: number; label?: string }[];
    },
  ) {
    const existing = await this.prisma.commissionConfig.findUnique({
      where: { companyId },
      select: { id: true },
    });

    if (existing) {
      await this.prisma.commissionConfigTier.deleteMany({
        where: { configId: existing.id },
      });
      return this.prisma.commissionConfig.update({
        where: { companyId },
        data: {
          baseAmount: data.baseAmount,
          tiers: data.tiers.length
            ? { create: data.tiers.map((t) => ({ minTargetPct: t.minTargetPct, amount: t.amount, label: t.label })) }
            : undefined,
        },
        include: { tiers: { orderBy: { minTargetPct: 'asc' } } },
      });
    }

    return this.prisma.commissionConfig.create({
      data: {
        companyId,
        baseAmount: data.baseAmount,
        tiers: data.tiers.length
          ? { create: data.tiers.map((t) => ({ minTargetPct: t.minTargetPct, amount: t.amount, label: t.label })) }
          : undefined,
      },
      include: { tiers: { orderBy: { minTargetPct: 'asc' } } },
    });
  }

  async resolveAmount(opts: {
    companyId: string;
    salesRepUserId: string;
    accreditedDealerId?: string | null;
    periodStr: string;
  }): Promise<{ amount: number; tierPctApplied: number | null }> {
    const config = await this.getConfig(opts.companyId);
    let baseAmount = config ? Number(config.baseAmount) : 0;

    if (opts.accreditedDealerId) {
      const dealer = await this.prisma.accreditedDealer.findUnique({
        where: { id: opts.accreditedDealerId },
        select: { agentCommissionOverride: true },
      });
      if (dealer?.agentCommissionOverride != null) {
        baseAmount = Number(dealer.agentCommissionOverride);
      }
    }

    if (!config?.tiers.length) return { amount: baseAmount, tierPctApplied: null };

    const target = await this.prisma.salesTarget.findFirst({
      where: { userId: opts.salesRepUserId, period: opts.periodStr },
      select: { targetUnits: true },
    });
    if (!target || target.targetUnits <= 0) return { amount: baseAmount, tierPctApplied: null };

    const [year, month] = opts.periodStr.split('-').map(Number);
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0, 23, 59, 59);

    const dealCount = await this.prisma.dealCommission.count({
      where: {
        userId: opts.salesRepUserId,
        status: { not: 'CANCELLED' },
        deal: { status: 'FINALIZED', updatedAt: { gte: periodStart, lte: periodEnd } },
      },
    });

    const totalCount = dealCount + 1;
    const pct = (totalCount / target.targetUnits) * 100;

    const applicableTier = [...config.tiers]
      .sort((a, b) => Number(b.minTargetPct) - Number(a.minTargetPct))
      .find((t) => pct >= Number(t.minTargetPct));

    if (applicableTier) {
      return { amount: Number(applicableTier.amount), tierPctApplied: Number(applicableTier.minTargetPct) };
    }

    return { amount: baseAmount, tierPctApplied: null };
  }
}
