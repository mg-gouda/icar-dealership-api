import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class ServiceCenterService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // ponytail: generate SO-YYYYMM-NNNN order number
  private generateOrderNumber(): string {
    const now = new Date();
    const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const rand = String(Math.floor(1000 + Math.random() * 9000));
    return `SO-${ym}-${rand}`;
  }

  async findAll(query: {
    locationId?: string;
    status?: string;
    vehicleId?: string;
    technicianId?: string;
    page?: number;
    limit?: number;
  }) {
    const { locationId, status, vehicleId, technicianId, page = 1, limit = 20 } = query;
    const where = {
      ...(locationId && { locationId }),
      ...(status && { status: status as any }),
      ...(vehicleId && { vehicleId }),
      ...(technicianId && { technicianId }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.serviceOrder.findMany({
        where,
        include: {
          vehicle: { select: { id: true, make: true, model: true, year: true } },
          customer: { select: { id: true, name: true, phone: true } },
          technician: { select: { id: true, name: true } },
          location: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      this.prisma.serviceOrder.count({ where }),
    ]);
    return { data, total, page: Number(page), limit: Number(limit) };
  }

  async findById(id: string) {
    const order = await this.prisma.serviceOrder.findUnique({
      where: { id },
      include: {
        vehicle: true,
        customer: true,
        technician: { select: { id: true, name: true } },
        location: true,
        invoice: { select: { id: true, status: true, amountTotal: true } },
        lines: {
          include: { part: { select: { id: true, name: true, partNumber: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!order) throw new NotFoundException(`ServiceOrder ${id} not found`);
    return order;
  }

  async create(
    data: {
      vehicleId: string;
      customerId?: string;
      locationId: string;
      technicianId?: string;
      type?: string;
      mileageIn?: number;
      description?: string;
      internalNotes?: string;
      companyId: string;
    },
    userId: string,
  ) {
    const order = await this.prisma.serviceOrder.create({
      data: {
        orderNumber: this.generateOrderNumber(),
        vehicleId: data.vehicleId,
        customerId: data.customerId,
        locationId: data.locationId,
        technicianId: data.technicianId,
        type: (data.type as any) ?? 'MAINTENANCE',
        mileageIn: data.mileageIn,
        description: data.description,
        internalNotes: data.internalNotes,
        companyId: data.companyId,
        status: 'INTAKE',
      },
    });
    await this.audit.log({
      entity: 'ServiceOrder',
      entityId: order.id,
      action: 'SERVICE_ORDER_CREATED',
      userId,
      newValue: order,
    });
    return order;
  }

  async update(
    id: string,
    data: Partial<{
      status: string;
      technicianId: string;
      internalNotes: string;
      description: string;
      mileageOut: number;
    }>,
    userId: string,
  ) {
    const order = await this.prisma.serviceOrder.findUniqueOrThrow({ where: { id } });
    if (order.status === 'INVOICED') {
      throw new BadRequestException('Cannot update an invoiced service order');
    }
    const updated = await this.prisma.serviceOrder.update({
      where: { id },
      data: {
        ...(data.status && { status: data.status as any }),
        ...(data.technicianId !== undefined && { technicianId: data.technicianId }),
        ...(data.internalNotes !== undefined && { internalNotes: data.internalNotes }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.mileageOut !== undefined && { mileageOut: data.mileageOut }),
      },
    });
    await this.audit.log({
      entity: 'ServiceOrder',
      entityId: id,
      action: 'UPDATE',
      userId,
      newValue: data,
    });
    return updated;
  }

  async addLine(
    orderId: string,
    lineData: {
      type: string;
      description: string;
      quantity?: number;
      unitPrice?: number;
      partId?: string;
    },
    userId: string,
  ) {
    const order = await this.prisma.serviceOrder.findUniqueOrThrow({ where: { id: orderId } });
    if (order.status === 'INVOICED') {
      throw new BadRequestException('Cannot add lines to an invoiced order');
    }

    let unitPrice = lineData.unitPrice ?? 0;

    // ponytail: auto-resolve price from Part if type=PART and partId supplied
    if (lineData.type === 'PART' && lineData.partId && !lineData.unitPrice) {
      const part = await this.prisma.part.findUniqueOrThrow({ where: { id: lineData.partId } });
      unitPrice = Number(part.salePrice);
    }

    const qty = lineData.quantity ?? 1;
    const total = qty * unitPrice;

    const result = await this.prisma.$transaction(async (tx) => {
      const line = await tx.serviceOrderLine.create({
        data: {
          serviceOrderId: orderId,
          type: lineData.type as any,
          description: lineData.description,
          quantity: qty,
          unitPrice,
          total,
          partId: lineData.partId,
        },
      });

      // Recompute parent totals
      const allLines = await tx.serviceOrderLine.findMany({ where: { serviceOrderId: orderId } });
      let laborTotal = new Decimal(0);
      let partsTotal = new Decimal(0);
      for (const l of allLines) {
        if (l.type === 'LABOR') {
          laborTotal = laborTotal.add(l.total);
        } else {
          partsTotal = partsTotal.add(l.total);
        }
      }
      const totalAmount = laborTotal.add(partsTotal);

      await tx.serviceOrder.update({
        where: { id: orderId },
        data: { laborTotal, partsTotal, totalAmount },
      });

      return line;
    });

    await this.audit.log({
      entity: 'ServiceOrderLine',
      entityId: result.id,
      action: 'LINE_ADDED',
      userId,
      newValue: result,
    });
    return result;
  }

  async removeLine(orderId: string, lineId: string, userId: string) {
    const line = await this.prisma.serviceOrderLine.findUniqueOrThrow({ where: { id: lineId } });
    if (line.serviceOrderId !== orderId) {
      throw new BadRequestException('Line does not belong to this order');
    }
    const order = await this.prisma.serviceOrder.findUniqueOrThrow({ where: { id: orderId } });
    if (order.status === 'INVOICED') {
      throw new BadRequestException('Cannot remove lines from an invoiced order');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.serviceOrderLine.delete({ where: { id: lineId } });

      const remaining = await tx.serviceOrderLine.findMany({ where: { serviceOrderId: orderId } });
      let laborTotal = new Decimal(0);
      let partsTotal = new Decimal(0);
      for (const l of remaining) {
        if (l.type === 'LABOR') {
          laborTotal = laborTotal.add(l.total);
        } else {
          partsTotal = partsTotal.add(l.total);
        }
      }
      const totalAmount = laborTotal.add(partsTotal);

      await tx.serviceOrder.update({
        where: { id: orderId },
        data: { laborTotal, partsTotal, totalAmount },
      });
    });

    await this.audit.log({
      entity: 'ServiceOrderLine',
      entityId: lineId,
      action: 'LINE_REMOVED',
      userId,
    });
    return { deleted: true };
  }

  async complete(orderId: string, userId: string) {
    const order = await this.prisma.serviceOrder.findUniqueOrThrow({ where: { id: orderId } });
    if (order.status === 'COMPLETED' || order.status === 'INVOICED') {
      throw new BadRequestException(`Order already ${order.status}`);
    }
    if (order.status === 'CANCELLED') {
      throw new BadRequestException('Cannot complete a cancelled order');
    }

    const updated = await this.prisma.serviceOrder.update({
      where: { id: orderId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    await this.audit.log({
      entity: 'ServiceOrder',
      entityId: orderId,
      action: 'COMPLETED',
      userId,
    });
    return updated;
  }

  async createInvoice(orderId: string, userId: string) {
    const order = await this.prisma.serviceOrder.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        lines: true,
        location: { include: { journals: true } },
      },
    });

    if (order.status !== 'COMPLETED') {
      throw new BadRequestException('Order must be COMPLETED before invoicing');
    }
    if (order.invoiceId) {
      throw new BadRequestException('Order already has an invoice');
    }
    if (!order.customerId) {
      throw new BadRequestException('Order has no customer — cannot create invoice');
    }

    const saleJournal = order.location.journals.find((j) => j.type === 'SALE');
    if (!saleJournal) {
      throw new BadRequestException('Location has no SALE journal. Run seed first.');
    }

    // ponytail: resolve default service revenue account (4100 = Sales Income)
    const revenueAccount = await this.prisma.account.findFirst({
      where: { code: '4100', companyId: saleJournal.companyId },
    });
    if (!revenueAccount) {
      throw new BadRequestException('Revenue account 4100 not found. Run seed first.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const subtotal = order.lines.reduce((s, l) => s.add(l.total), new Decimal(0));

      const invoice = await tx.invoice.create({
        data: {
          type: 'CUSTOMER_INVOICE',
          status: 'DRAFT',
          partnerId: order.customerId!,
          journalId: saleJournal.id,
          date: new Date(),
          amountUntaxed: subtotal,
          amountTax: 0,
          amountTotal: subtotal,
          amountResidual: subtotal,
          lines: {
            create: order.lines.map((l) => ({
              description: l.description,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              subtotal: l.total,
              accountId: revenueAccount.id,
              category: l.type === 'LABOR' ? 'SERVICE' : 'PARTS',
            })),
          },
        },
        include: { lines: true },
      });

      await tx.serviceOrder.update({
        where: { id: orderId },
        data: { status: 'INVOICED', invoiceId: invoice.id },
      });

      return invoice;
    });

    await this.audit.log({
      entity: 'ServiceOrder',
      entityId: orderId,
      action: 'INVOICED',
      userId,
      newValue: { invoiceId: result.id },
    });
    return result;
  }
}
