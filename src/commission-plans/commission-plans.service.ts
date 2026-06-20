import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class CommissionPlansService {
  constructor(private prisma: PrismaService) {}

  list(active?: boolean) {
    return this.prisma.commissionPlan.findMany({
      where: active !== undefined ? { active } : {},
      include: {
        tiers: { orderBy: { minValue: 'asc' } },
        location: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  findOne(id: string) {
    return this.prisma.commissionPlan.findUniqueOrThrow({
      where: { id },
      include: {
        tiers: { orderBy: { minValue: 'asc' } },
        location: { select: { name: true } },
      },
    });
  }

  create(data: any) {
    const { tiers, ...rest } = data;
    return this.prisma.commissionPlan.create({
      data: {
        ...rest,
        tiers: tiers?.length ? { create: tiers } : undefined,
      },
      include: { tiers: true },
    });
  }

  /**
   * Resolve the best-matching active plan for a given deal context.
   * Resolution order (most specific wins):
   *   1. locationId + vehicleCategory + applicableRole
   *   2. locationId + vehicleCategory
   *   3. locationId + applicableRole
   *   4. vehicleCategory + applicableRole
   *   5. locationId only
   *   6. vehicleCategory only
   *   7. applicableRole only
   *   8. company-wide default (all nullable)
   */
  async resolve(opts: {
    locationId?: string;
    vehicleCategory?: string;
    applicableRole?: string;
  }) {
    const allActive = await this.prisma.commissionPlan.findMany({
      where: { active: true },
      include: { tiers: { orderBy: { minValue: 'asc' } } },
    });

    const score = (p: any) => {
      let s = 0;
      if (opts.locationId && p.locationId === opts.locationId) s += 4;
      else if (p.locationId) return -1; // wrong location — skip
      if (opts.vehicleCategory && p.vehicleCategory === opts.vehicleCategory)
        s += 2;
      else if (p.vehicleCategory) return -1; // wrong category — skip
      if (opts.applicableRole && p.applicableRole === opts.applicableRole)
        s += 1;
      else if (p.applicableRole && p.applicableRole !== opts.applicableRole)
        return -1;
      return s;
    };

    const candidates = allActive
      .map((p) => ({ plan: p, score: score(p) }))
      .filter((c) => c.score >= 0);
    if (!candidates.length) return null;
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].plan;
  }

  async update(id: string, data: any) {
    const { tiers, ...rest } = data;
    if (tiers !== undefined) {
      // Replace all tiers atomically
      await this.prisma.$transaction([
        this.prisma.commissionTier.deleteMany({
          where: { commissionPlanId: id },
        }),
        ...(tiers.length > 0
          ? [
              this.prisma.commissionTier.createMany({
                data: tiers.map((t: any) => ({ ...t, commissionPlanId: id })),
              }),
            ]
          : []),
      ]);
    }
    return this.prisma.commissionPlan.update({
      where: { id },
      data: rest,
      include: { tiers: { orderBy: { minValue: 'asc' } } },
    });
  }
}
