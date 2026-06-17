import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class CommissionPlansService {
  constructor(private prisma: PrismaService) {}

  list(active?: boolean) {
    return this.prisma.commissionPlan.findMany({
      where: active !== undefined ? { active } : {},
      include: { tiers: { orderBy: { minValue: 'asc' } }, location: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  findOne(id: string) {
    return this.prisma.commissionPlan.findUniqueOrThrow({
      where: { id },
      include: { tiers: { orderBy: { minValue: 'asc' } }, location: { select: { name: true } } },
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

  update(id: string, data: any) {
    const { tiers, ...rest } = data;
    return this.prisma.commissionPlan.update({
      where: { id },
      data: rest,
      include: { tiers: true },
    });
  }
}
