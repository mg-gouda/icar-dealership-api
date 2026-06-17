import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  findAll(companyId: string, query: {
    type?: string; status?: string; partnerId?: string;
    dateFrom?: string; dateTo?: string; page?: number; limit?: number;
  }) {
    const { type, status, partnerId, dateFrom, dateTo, page = 1, limit = 20 } = query;
    return this.prisma.payment.findMany({
      where: {
        // Payment has no companyId → filter via journal.companyId
        journal: { companyId },
        ...(type && { type: type as any }),
        ...(status && { status: status as any }),
        ...(partnerId && { partnerId }),
        ...(dateFrom || dateTo ? {
          date: {
            ...(dateFrom && { gte: new Date(dateFrom) }),
            ...(dateTo && { lte: new Date(dateTo) }),
          },
        } : {}),
      },
      include: {
        partner: { select: { id: true, name: true } },
        journal: { select: { id: true, code: true, name: true } },
        allocations: {
          include: { invoice: { select: { id: true, status: true, amountTotal: true } } },
        },
      },
      orderBy: { date: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  async findById(id: string) {
    const p = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        partner: true,
        journal: true,
        allocations: {
          include: { invoice: { include: { lines: true } } },
        },
      },
    });
    if (!p) throw new NotFoundException(`Payment ${id} not found`);
    return p;
  }

  async create(data: {
    type: string; partnerId: string; journalId: string;
    amount: number; date?: string; method: string;
    memo?: string; dealId?: string; invoiceIds?: string[];
  }, userId: string) {
    const payment = await this.prisma.$transaction(async (tx) => {
      const p = await tx.payment.create({
        data: {
          type: data.type as any,
          partnerId: data.partnerId,
          journalId: data.journalId,
          amount: data.amount,
          date: data.date ? new Date(data.date) : new Date(),
          method: data.method as any,
          status: 'DRAFT',
          memo: data.memo,
          dealId: data.dealId,
        },
      });

      // auto-allocate to invoices if provided
      if (data.invoiceIds?.length) {
        let remaining = data.amount;
        for (const invoiceId of data.invoiceIds) {
          if (remaining <= 0) break;
          const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
          const allocAmt = Math.min(remaining, Number(inv.amountResidual));
          await tx.paymentAllocation.create({
            data: { paymentId: p.id, invoiceId, amount: allocAmt },
          });
          const newResidual = Number(inv.amountResidual) - allocAmt;
          await tx.invoice.update({
            where: { id: invoiceId },
            data: {
              amountResidual: newResidual,
              paymentStatus: newResidual <= 0 ? 'PAID' : 'PARTIAL',
            },
          });
          remaining -= allocAmt;
        }
      }
      return p;
    });

    await this.audit.log({ entity: 'Payment', entityId: payment.id, action: 'CREATE', userId, newValue: payment });
    return payment;
  }

  async postPayment(id: string, userId: string) {
    const p = await this.prisma.payment.findUniqueOrThrow({ where: { id } });
    if (p.status !== 'DRAFT') throw new BadRequestException('Payment not in DRAFT state');

    const updated = await this.prisma.payment.update({
      where: { id },
      data: { status: 'POSTED' },
    });
    await this.audit.log({ entity: 'Payment', entityId: id, action: 'POST', userId });
    return updated;
  }

  async cancel(id: string, userId: string) {
    const p = await this.prisma.payment.findUniqueOrThrow({
      where: { id },
      include: { allocations: true },
    });
    if (p.status === 'POSTED') throw new BadRequestException('Posted payments must be reversed via a debit note');

    await this.prisma.$transaction(async (tx) => {
      // unallocate invoices
      for (const alloc of p.allocations) {
        await tx.invoice.update({
          where: { id: alloc.invoiceId },
          data: {
            amountResidual: { increment: Number(alloc.amount) },
            paymentStatus: 'NOT_PAID',
          },
        });
        await tx.paymentAllocation.delete({ where: { id: alloc.id } });
      }
      await tx.payment.update({ where: { id }, data: { status: 'CANCELLED' } });
    });
    await this.audit.log({ entity: 'Payment', entityId: id, action: 'CANCEL', userId });
  }
}
