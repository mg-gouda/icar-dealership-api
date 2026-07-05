import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { PostingService } from '../posting/posting.service';
import { EtaService } from '../eta/eta.service';

@Injectable()
export class InvoicesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private posting: PostingService,
    private eta: EtaService,
  ) {}

  findAll(
    companyId: string,
    query: {
      type?: string;
      status?: string;
      partnerId?: string;
      dealId?: string;
      dateFrom?: string;
      dateTo?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const {
      type,
      status,
      partnerId,
      dealId,
      dateFrom,
      dateTo,
      page = 1,
      limit = 20,
    } = query;
    return this.prisma.invoice.findMany({
      where: {
        journal: { companyId },
        ...(type && { type: type as any }),
        ...(status && { status: status as any }),
        ...(partnerId && { partnerId }),
        ...(dealId && { dealId }),
        ...(dateFrom || dateTo
          ? {
              date: {
                ...(dateFrom && { gte: new Date(dateFrom) }),
                ...(dateTo && { lte: new Date(dateTo) }),
              },
            }
          : {}),
      },
      include: {
        partner: { select: { id: true, name: true } },
        deal: { select: { id: true } },
        lines: {
          include: {
            account: { select: { id: true, code: true, name: true } },
          },
        },
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

  async create(
    data: {
      journalId: string;
      type: string;
      partnerId: string;
      dealId?: string;
      date?: string;
      dueDate?: string;
      currencyId?: string;
      lines: Array<{
        description: string;
        quantity: number;
        unitPrice: number;
        accountId: string;
        taxId?: string;
        category?: string;
      }>;
    },
    userId: string,
  ) {
    const subtotal = data.lines.reduce(
      (s, l) => s + l.quantity * l.unitPrice,
      0,
    );

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
    await this.audit.log({
      entity: 'Invoice',
      entityId: inv.id,
      action: 'CREATE',
      userId,
      newValue: inv,
    });
    return inv;
  }

  async post(id: string, userId: string) {
    await this.posting.postInvoice(id);
    await this.audit.log({
      entity: 'Invoice',
      entityId: id,
      action: 'POST',
      userId,
    });

    // ponytail: fire-and-forget ETA submission -- don't block invoice posting on ETA response
    this.eta.submitInvoice(id, userId).catch(() => undefined);

    return this.findById(id);
  }

  async cancel(id: string, userId: string) {
    const inv = await this.prisma.invoice.findUniqueOrThrow({ where: { id } });
    if (inv.status === 'POSTED')
      throw new BadRequestException(
        'Posted invoice must be reversed, not cancelled',
      );

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
    await this.audit.log({
      entity: 'Invoice',
      entityId: id,
      action: 'CANCEL',
      userId,
    });
    return updated;
  }

  async reverse(id: string, userId: string) {
    const inv = await this.prisma.invoice.findUniqueOrThrow({ where: { id } });
    if (inv.status !== 'POSTED')
      throw new BadRequestException('Only POSTED invoices can be reversed');
    await this.posting.reverseInvoice(id);
    await this.audit.log({ entity: 'Invoice', entityId: id, action: 'REVERSE', userId });
    return this.findById(id);
  }

  async addLine(
    invoiceId: string,
    dto: {
      description: string;
      quantity: number;
      unitPrice: number;
      accountId: string;
      taxId?: string;
    },
    userId: string,
  ) {
    const inv = await this.prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    if (inv.status !== 'DRAFT')
      throw new BadRequestException('Can only add lines to DRAFT invoices');

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
    const allLines = await this.prisma.invoiceLine.findMany({
      where: { invoiceId },
    });
    const newSubtotal = allLines.reduce((s, l) => s + Number(l.subtotal), 0);
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        amountUntaxed: newSubtotal,
        amountTotal: newSubtotal,
        amountResidual: newSubtotal,
      },
    });

    await this.audit.log({
      entity: 'Invoice',
      entityId: invoiceId,
      action: 'ADD_LINE',
      userId,
      newValue: line,
    });
    return line;
  }

  // ponytail: batch AP payment run — mark POSTED vendor bills as PAID + create payments + GL
  async apPaymentRun(
    invoiceIds: string[],
    paymentDate: Date,
    journalId: string | undefined,
    userId: string,
  ) {
    if (!invoiceIds?.length)
      throw new BadRequestException('invoiceIds required');

    const results: { invoiceId: string; ok: boolean; error?: string }[] = [];
    let totalAmount = 0;

    for (const invoiceId of invoiceIds) {
      try {
        const inv = await this.prisma.invoice.findUniqueOrThrow({
          where: { id: invoiceId },
          include: { journal: true },
        });

        if (inv.status !== 'POSTED') {
          throw new BadRequestException(`Invoice ${invoiceId} is not POSTED (status: ${inv.status})`);
        }
        if (inv.type !== 'VENDOR_BILL') {
          throw new BadRequestException(`Invoice ${invoiceId} is not a VENDOR_BILL (type: ${inv.type})`);
        }

        const amount = Number(inv.amountResidual);
        if (amount <= 0) {
          throw new BadRequestException(`Invoice ${invoiceId} has no residual amount`);
        }

        const payJournalId = journalId ?? inv.journalId;

        await this.prisma.$transaction(async (tx) => {
          // 1. Create payment record
          const payment = await tx.payment.create({
            data: {
              type: 'VENDOR_PAYMENT',
              partnerId: inv.partnerId,
              journalId: payJournalId,
              amount,
              date: paymentDate,
              method: 'BANK_TRANSFER',
              status: 'POSTED',
              memo: `AP Payment Run — Invoice ${invoiceId.slice(-8).toUpperCase()}`,
            },
          });

          // 2. Allocate payment to invoice
          await tx.paymentAllocation.create({
            data: { paymentId: payment.id, invoiceId, amount },
          });

          // 3. Mark invoice PAID
          await tx.invoice.update({
            where: { id: invoiceId },
            data: { amountResidual: 0, paymentStatus: 'PAID' },
          });

          // 4. GL entry: DR AP (2100) / CR Bank (journal default credit account)
          const journal = await tx.journal.findUniqueOrThrow({
            where: { id: payJournalId },
          });
          const bankAccountId = journal.defaultCreditAccountId;
          if (!bankAccountId) {
            throw new BadRequestException(
              `Journal ${payJournalId} has no default credit account — configure it first`,
            );
          }
          const accounts = await this.resolveAccounts(journal.companyId, ['2100']);

          await tx.journalEntry.create({
            data: {
              journalId: payJournalId,
              date: paymentDate,
              ref: `APRUN-${invoiceId.slice(-8).toUpperCase()}`,
              status: 'POSTED',
              paymentId: payment.id,
              lines: {
                create: [
                  {
                    accountId: accounts['2100'],
                    debit: amount,
                    credit: 0,
                    partnerId: inv.partnerId,
                    label: 'AP Payment Run — Clear AP',
                  },
                  {
                    accountId: bankAccountId,
                    debit: 0,
                    credit: amount,
                    label: 'AP Payment Run — Bank',
                  },
                ],
              },
            },
          });
        });

        await this.audit.log({
          entity: 'Invoice',
          entityId: invoiceId,
          action: 'AP_PAYMENT_RUN',
          userId,
          newValue: { amount },
        });

        totalAmount += amount;
        results.push({ invoiceId, ok: true });
      } catch (e: any) {
        results.push({ invoiceId, ok: false, error: e?.message ?? 'unknown' });
      }
    }

    return {
      processed: results.filter((r) => r.ok).length,
      totalAmount,
      results,
    };
  }

  // ponytail: resolve account codes → IDs
  private async resolveAccounts(
    companyId: string,
    codes: string[],
  ): Promise<Record<string, string>> {
    const rows = await this.prisma.account.findMany({
      where: { companyId, code: { in: codes } },
      select: { id: true, code: true },
    });
    const map: Record<string, string> = {};
    for (const r of rows) map[r.code] = r.id;
    const missing = codes.filter((c) => !map[c]);
    if (missing.length) {
      throw new BadRequestException(
        `GL accounts not found: ${missing.join(', ')}. Run prisma:seed first.`,
      );
    }
    return map;
  }

  async threeWayMatch(invoiceId: string) {
    // Fetch invoice + lines + receipt via receiptId
    const invoice = await this.prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    const lines = await this.prisma.invoiceLine.findMany({
      where: { invoiceId },
      include: { vehicle: { select: { vin: true } } },
    });

    if (!invoice.receiptId) {
      return {
        hasMatch: false,
        message: 'No receipt linked to this bill',
        lines: [],
      };
    }

    const receipt = await this.prisma.receipt.findUniqueOrThrow({
      where: { id: invoice.receiptId },
      include: {
        lines: {
          include: {
            purchaseOrderLine: {
              include: { purchaseOrder: { select: { id: true } } },
            },
            vehicle: { select: { vin: true } },
          },
        },
        purchaseOrder: { select: { id: true } },
      },
    });

    const matchLines = receipt.lines.map((rl) => {
      const poLine = rl.purchaseOrderLine;
      const billLine = lines.find(
        (il) => il.vehicleId && il.vehicleId === rl.vehicleId,
      );
      const poQty = Number(poLine.quantity);
      const receivedQty = Number(rl.quantityReceived);
      const billQty = billLine ? Number(billLine.quantity) : 0;
      const poUnitCost = Number(poLine.unitCost);
      const billUnitPrice = billLine ? Number(billLine.unitPrice) : 0;
      const qtyVariance = receivedQty - billQty;
      const priceVariance = billUnitPrice - poUnitCost;
      return {
        description: poLine.description,
        vehicleVin: rl.vehicle?.vin,
        po: { id: poLine.purchaseOrder.id, qty: poQty, unitCost: poUnitCost },
        receipt: { qty: receivedQty },
        bill: { qty: billQty, unitPrice: billUnitPrice },
        qtyVariance,
        priceVariance,
        hasVariance:
          Math.abs(qtyVariance) > 0.001 || Math.abs(priceVariance) > 0.01,
      };
    });

    const hasVariance = matchLines.some((l) => l.hasVariance);
    return {
      hasMatch: true,
      hasVariance,
      canPost: !hasVariance,
      purchaseOrderId: receipt.purchaseOrder?.id,
      lines: matchLines,
    };
  }
}
