import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { PostingService } from '../finance/posting/posting.service';

@Injectable()
export class CommissionsService {
  constructor(
    private prisma: PrismaService,
    private posting: PostingService,
  ) {}

  async list(filters: {
    status?: string; userId?: string; dealId?: string;
    page: number; limit: number;
  }) {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.userId) where.userId = filters.userId;
    if (filters.dealId) where.dealId = filters.dealId;

    const [items, total] = await Promise.all([
      this.prisma.dealCommission.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, email: true } },
          deal: {
            select: {
              id: true, status: true, salePrice: true,
              vehicle: { select: { make: true, model: true, year: true } },
              location: { select: { name: true } },
            },
          },
          commissionPlan: { select: { name: true } },
        },
      }),
      this.prisma.dealCommission.count({ where }),
    ]);
    return { items, total, page: filters.page, limit: filters.limit };
  }

  async summary(userId?: string) {
    const where: any = userId ? { userId } : {};
    const rows = await this.prisma.dealCommission.groupBy({
      by: ['status'],
      where,
      _sum: { calculatedAmount: true },
      _count: { id: true },
    });
    return rows.map((r) => ({
      status: r.status,
      count: r._count.id,
      total: Number(r._sum.calculatedAmount ?? 0),
    }));
  }

  async findOne(id: string) {
    return this.prisma.dealCommission.findUniqueOrThrow({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        deal: {
          include: {
            vehicle: { select: { make: true, model: true, year: true, vin: true } },
            location: { select: { name: true } },
            customer: { select: { name: true } },
          },
        },
        commissionPlan: true,
        accrualJournalEntry: { select: { id: true, ref: true, status: true } },
        payoutJournalEntry: { select: { id: true, ref: true, status: true } },
      },
    });
  }

  async markPayable(id: string) {
    const c = await this.prisma.dealCommission.findUniqueOrThrow({ where: { id } });
    if (c.status !== 'ACCRUED') throw new BadRequestException('Only ACCRUED commissions can be marked payable');
    return this.prisma.dealCommission.update({
      where: { id },
      data: { status: 'PAYABLE', payableAt: new Date() },
    });
  }

  async batchPay(commissionIds: string[], journalId: string, userId: string) {
    if (!commissionIds?.length) throw new BadRequestException('No commission IDs provided');

    const commissions = await this.prisma.dealCommission.findMany({
      where: { id: { in: commissionIds }, status: 'PAYABLE' },
    });

    if (commissions.length === 0)
      throw new BadRequestException('No PAYABLE commissions found in selection');

    await this.posting.payCommission(commissionIds, journalId, userId);
    const updated = await this.prisma.dealCommission.findMany({
      where: { id: { in: commissionIds } },
      select: { id: true, status: true, calculatedAmount: true, paidAt: true },
    });
    return { paid: updated.length, commissions: updated };
  }
}
