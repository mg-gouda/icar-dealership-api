import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateChequeDto, UpdateChequeStatusDto, ListChequesQuery } from './dto/cheque.dto';

@Injectable()
export class ChequesService {
  constructor(private prisma: PrismaService) {}

  async list(companyId: string, q: ListChequesQuery) {
    const page = Number(q.page ?? 1);
    const limit = Number(q.limit ?? 50);
    const where: any = { companyId };
    if (q.locationId) where.locationId = q.locationId;
    if (q.direction) where.direction = q.direction;
    if (q.status) where.status = q.status;
    if (q.partnerId) where.partnerId = q.partnerId;
    if (q.q) where.OR = [
      { chequeNumber: { contains: q.q, mode: 'insensitive' } },
      { payeePayor: { contains: q.q, mode: 'insensitive' } },
      { memo: { contains: q.q, mode: 'insensitive' } },
    ];

    const [items, total] = await Promise.all([
      this.prisma.cheque.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { issueDate: 'desc' },
        include: {
          partner: { select: { id: true, name: true } },
          location: { select: { id: true, name: true } },
          bankAccount: { select: { id: true, name: true, bankName: true } },
          _count: { select: { allocations: true } },
          allocations: {
            include: {
              purchaseOrder: { select: { id: true, orderDate: true, partner: { select: { name: true } } } },
              invoice: { select: { id: true, number: true } },
            },
          },
        },
      }),
      this.prisma.cheque.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  findOne(id: string) {
    return this.prisma.cheque.findUniqueOrThrow({
      where: { id },
      include: {
        partner: true,
        location: { select: { id: true, name: true } },
        bankAccount: { select: { id: true, name: true, bankName: true, accountNumber: true } },
        allocations: {
          include: {
            purchaseOrder: {
              select: {
                id: true, orderDate: true, total: true, depositRequired: true,
                partner: { select: { name: true } },
                lines: { select: { description: true, quantity: true, unitCost: true, vehicleId: true } },
              },
            },
            invoice: { select: { id: true, number: true, amountTotal: true, status: true } },
          },
        },
      },
    });
  }

  async create(companyId: string, dto: CreateChequeDto) {
    const { allocations, issueDate, dueDate, ...rest } = dto;

    // validate allocation total doesn't exceed cheque amount
    if (allocations?.length) {
      const allocSum = allocations.reduce((s, a) => s + a.amount, 0);
      if (allocSum > rest.amount + 0.001)
        throw new BadRequestException(`Allocations (${allocSum}) exceed cheque amount (${rest.amount})`);
    }

    return this.prisma.cheque.create({
      data: {
        ...rest,
        companyId,
        issueDate: new Date(issueDate),
        dueDate: dueDate ? new Date(dueDate) : undefined,
        allocations: allocations?.length
          ? { create: allocations.map(a => ({ ...a })) }
          : undefined,
      },
      include: {
        partner: { select: { id: true, name: true } },
        allocations: true,
      },
    });
  }

  async updateStatus(id: string, dto: UpdateChequeStatusDto) {
    const cheque = await this.prisma.cheque.findUniqueOrThrow({ where: { id } });
    const allowed: Record<string, string[]> = {
      ISSUED: ['CLEARED', 'BOUNCED', 'CANCELLED'],
      BOUNCED: ['CANCELLED'],
    };
    if (!allowed[cheque.status]?.includes(dto.status))
      throw new BadRequestException(`Cannot transition from ${cheque.status} to ${dto.status}`);

    return this.prisma.cheque.update({
      where: { id },
      data: {
        status: dto.status as any,
        clearedDate: dto.clearedDate ? new Date(dto.clearedDate) : undefined,
      },
    });
  }

  async addAllocation(chequeId: string, data: { amount: number; purchaseOrderId?: string; invoiceId?: string; memo?: string }) {
    const cheque = await this.prisma.cheque.findUniqueOrThrow({
      where: { id: chequeId },
      include: { _count: { select: { allocations: true } }, allocations: { select: { amount: true } } },
    });
    const allocated = cheque.allocations.reduce((s, a) => s + Number(a.amount), 0);
    if (allocated + data.amount > Number(cheque.amount) + 0.001)
      throw new BadRequestException(`Allocation would exceed cheque amount. Available: ${Number(cheque.amount) - allocated}`);

    return this.prisma.chequeAllocation.create({ data: { chequeId, ...data } });
  }

  deleteAllocation(id: string) {
    return this.prisma.chequeAllocation.delete({ where: { id } });
  }
}
