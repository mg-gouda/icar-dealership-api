import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { PostingService } from '../posting/posting.service';

@Injectable()
export class InvoicesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private posting: PostingService,
  ) {}

  findAll(companyId: string, query: {
    type?: string; status?: string; partnerId?: string; dealId?: string;
    dateFrom?: string; dateTo?: string; page?: number; limit?: number;
  }) {
    const { type, status, partnerId, dealId, dateFrom, dateTo, page = 1, limit = 20 } = query;
    return this.prisma.invoice.findMany({
      where: {
        journal: { companyId },
        ...(type && { type: type as any }),
        ...(status && { status: status as any }),
        ...(partnerId && { partnerId }),
        ...(dealId && { dealId }),
        ...(dateFrom || dateTo ? {
          date: {
            ...(dateFrom && { gte: new Date(dateFrom) }),
            ...(dateTo && { lte: new Date(dateTo) }),
          },
        } : {}),
      },
      include: {
        partner: { select: { id: true, name: true } },
        deal: { select: { id: true } },
        lines: { include: { account: { select: { id: true, code: true, name: true } } } },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    });
  }

  async findById(id: string) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        partner: true,
        deal: true,
        lines: {
          include: { account: true, tax: true },
        },
        paymentAllocations: {
          include: { payment: true },
        },
        journalEntry: { include: { lines: { include: { account: true } } } },
      },
    });
    if (!inv) throw new NotFoundException(`Invoice ${id} not found`);
    return inv;
  }

  async create(data: {
    journalId: string; type: string; partnerId: string;
    dealId?: string; date?: string; dueDate?: string; currencyId?: string;
    lines: Array<{
      description: string; quantity: number; unitPrice: number;
      accountId: string; taxId?: string; category?: string;
    }>;
  }, userId: string) {
    const subtotal = data.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);

    const inv = await this.prisma.invoice.create({
      data: {
        journalId: data.journalId,
        type: data.type as any,
        partnerId: data.partnerId,
        dealId: data.dealId,
        date: data.date ? new Date(data.date) : new Date(),
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        currencyId: data.currencyId,
        status: 'DRAFT',
        amountUntaxed: subtotal,
        amountTax: 0, // computed on post
        amountTotal: subtotal,
        amountResidual: subtotal,
        lines: {
          create: data.lines.map((l) => ({
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            subtotal: l.quantity * l.unitPrice,
            accountId: l.accountId,
            taxId: l.taxId,
            category: l.category,
          })),
        },
      },
      include: { lines: true },
    });
    await this.audit.log({ entity: 'Invoice', entityId: inv.id, action: 'CREATE', userId, newValue: inv });
    return inv;
  }

  async post(id: string, userId: string) {
    await this.posting.postInvoice(id);
    await this.audit.log({ entity: 'Invoice', entityId: id, action: 'POST', userId });
    return this.findById(id);
  }

  async cancel(id: string, userId: string) {
    const inv = await this.prisma.invoice.findUniqueOrThrow({ where: { id } });
    if (inv.status === 'POSTED') throw new BadRequestException('Posted invoice must be reversed, not cancelled');

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
    await this.audit.log({ entity: 'Invoice', entityId: id, action: 'CANCEL', userId });
    return updated;
  }

  async addLine(invoiceId: string, dto: {
    description: string; quantity: number; unitPrice: number;
    accountId: string; taxId?: string;
  }, userId: string) {
    const inv = await this.prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    if (inv.status !== 'DRAFT') throw new BadRequestException('Can only add lines to DRAFT invoices');

    const lineSubtotal = Number(dto.quantity) * Number(dto.unitPrice);
    const line = await this.prisma.invoiceLine.create({
      data: {
        invoiceId,
        description: dto.description,
        quantity: dto.quantity,
        unitPrice: dto.unitPrice,
        subtotal: lineSubtotal,
        accountId: dto.accountId,
        taxId: dto.taxId || undefined,
      },
      include: { account: true, tax: true },
    });

    // recompute invoice totals
    const allLines = await this.prisma.invoiceLine.findMany({ where: { invoiceId } });
    const newSubtotal = allLines.reduce((s, l) => s + Number(l.subtotal), 0);
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { amountUntaxed: newSubtotal, amountTotal: newSubtotal, amountResidual: newSubtotal },
    });

    await this.audit.log({ entity: 'Invoice', entityId: invoiceId, action: 'ADD_LINE', userId, newValue: line });
    return line;
  }
}
