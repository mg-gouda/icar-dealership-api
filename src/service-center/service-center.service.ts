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

  // ── External Vehicle CRUD ──────────────────────────────────────────────────

  async searchExternalVehicle(companyId: string, licensePlate: string) {
    return this.prisma.externalVehicle.findUnique({
      where: { companyId_licensePlate: { companyId, licensePlate: licensePlate.trim().toUpperCase() } },
      include: { serviceOrders: { select: { id: true, orderNumber: true, status: true, type: true, createdAt: true, totalAmount: true }, orderBy: { createdAt: 'desc' } } },
    });
  }

  async listExternalVehicles(companyId: string, q?: string) {
    const where: any = { companyId };
    if (q) where.OR = [
      { licensePlate: { contains: q, mode: 'insensitive' } },
      { ownerName: { contains: q, mode: 'insensitive' } },
      { ownerPhone: { contains: q, mode: 'insensitive' } },
      { make: { contains: q, mode: 'insensitive' } },
    ];
    return this.prisma.externalVehicle.findMany({
      where,
      include: { _count: { select: { serviceOrders: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
  }

  async createExternalVehicle(companyId: string, data: {
    licensePlate: string; make: string; model: string;
    color?: string; year?: number; regNumber?: string;
    ownerName: string; ownerPhone: string;
  }) {
    return this.prisma.externalVehicle.create({
      data: { ...data, licensePlate: data.licensePlate.trim().toUpperCase(), companyId },
    });
  }

  async updateExternalVehicle(id: string, data: Partial<{
    make: string; model: string; color: string; year: number;
    regNumber: string; ownerName: string; ownerPhone: string;
  }>) {
    return this.prisma.externalVehicle.update({ where: { id }, data });
  }

  // ── Service Orders ─────────────────────────────────────────────────────────

  async findAll(query: {
    locationId?: string;
    status?: string;
    vehicleId?: string;
    technicianId?: string;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const { locationId, status, vehicleId, technicianId, q, page = 1, limit = 20 } = query;
    const where: any = {
      ...(locationId && { locationId }),
      ...(status && { status: status as any }),
      ...(vehicleId && { vehicleId }),
      ...(technicianId && { technicianId }),
    };
    if (q) where.OR = [
      { orderNumber: { contains: q, mode: 'insensitive' } },
      { vehicle: { make: { contains: q, mode: 'insensitive' } } },
      { externalVehicle: { licensePlate: { contains: q, mode: 'insensitive' } } },
      { externalVehicle: { ownerName: { contains: q, mode: 'insensitive' } } },
      { walkInCustomerName: { contains: q, mode: 'insensitive' } },
    ];
    const [data, total] = await this.prisma.$transaction([
      this.prisma.serviceOrder.findMany({
        where,
        include: {
          vehicle: { select: { id: true, make: true, model: true, year: true, regLicenseNumber: true } },
          externalVehicle: { select: { id: true, licensePlate: true, make: true, model: true, year: true, ownerName: true, ownerPhone: true } },
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
        externalVehicle: { include: { serviceOrders: { select: { id: true, orderNumber: true, status: true, createdAt: true, totalAmount: true }, orderBy: { createdAt: 'desc' }, take: 10 } } },
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
      // inventory vehicle OR external
      vehicleId?: string;
      externalVehicleId?: string;
      // CRM customer OR walk-in
      customerId?: string;
      walkInCustomerName?: string;
      walkInCustomerPhone?: string;
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
    if (!data.vehicleId && !data.externalVehicleId)
      throw new BadRequestException('Either vehicleId or externalVehicleId is required');

    const order = await this.prisma.serviceOrder.create({
      data: {
        orderNumber: this.generateOrderNumber(),
        vehicleId: data.vehicleId ?? null,
        externalVehicleId: data.externalVehicleId ?? null,
        customerId: data.customerId ?? null,
        walkInCustomerName: data.walkInCustomerName ?? null,
        walkInCustomerPhone: data.walkInCustomerPhone ?? null,
        locationId: data.locationId,
        technicianId: data.technicianId ?? null,
        type: (data.type as any) ?? 'MAINTENANCE',
        mileageIn: data.mileageIn ? Number(data.mileageIn) : null,
        description: data.description ?? null,
        internalNotes: data.internalNotes ?? null,
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
    let part: any = null;
    if (lineData.type === 'PART' && lineData.partId) {
      part = await this.prisma.part.findUniqueOrThrow({ where: { id: lineData.partId } });
      if (!lineData.unitPrice) unitPrice = Number(part.salePrice);
    }

    const qty = lineData.quantity ?? 1;
    const total = qty * unitPrice;

    // ponytail: stock check before creating PART line
    if (lineData.type === 'PART' && part) {
      if (new Decimal(part.onHand).lessThan(new Decimal(qty))) {
        throw new BadRequestException(
          `Insufficient stock: only ${part.onHand} units on hand`,
        );
      }
    }

    const isPart = lineData.type === 'PART' && lineData.partId;

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
          ...(isPart && { partPickStatus: 'PENDING' }),
        },
      });

      // ponytail: deduct onHand inside same tx
      if (isPart) {
        await tx.part.update({
          where: { id: lineData.partId },
          data: { onHand: { decrement: qty } },
        });
      }

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
      // ponytail: restore stock + cancel pick if PART line
      if (line.type === 'PART' && line.partId) {
        await tx.part.update({
          where: { id: line.partId },
          data: { onHand: { increment: Number(line.quantity) } },
        });
        await tx.serviceOrderLine.update({
          where: { id: lineId },
          data: { partPickStatus: 'CANCELLED' },
        });
      }

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
    if (!order.customerId && !order.walkInCustomerName) {
      throw new BadRequestException('Order has no customer — set a CRM customer or walk-in customer name before invoicing');
    }
    // Walk-in orders without a CRM customer cannot be formally invoiced yet
    if (!order.customerId) {
      throw new BadRequestException('Walk-in service orders must have a CRM customer linked before invoicing. Link or create a customer first.');
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

  // ── Part Pick Requests ─────────────────────────────────────────────────────

  async listPartPicks(query: { locationId?: string; status?: string }) {
    return this.prisma.serviceOrderLine.findMany({
      where: {
        type: 'PART',
        ...(query.status
          ? { partPickStatus: query.status as any }
          : { partPickStatus: 'PENDING' }),
        ...(query.locationId && {
          serviceOrder: { locationId: query.locationId },
        }),
      },
      include: {
        part: {
          select: { id: true, partNumber: true, name: true, onHand: true },
        },
        serviceOrder: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            locationId: true,
            location: { select: { name: true } },
            vehicle: {
              select: { make: true, model: true, year: true },
            },
            externalVehicle: {
              select: { make: true, model: true, licensePlate: true },
            },
            walkInCustomerName: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
  }

  async markPartPicked(lineId: string, userId: string) {
    const line = await this.prisma.serviceOrderLine.findUniqueOrThrow({
      where: { id: lineId },
    });
    if (line.type !== 'PART')
      throw new BadRequestException('Not a part line');
    if (line.partPickStatus !== 'PENDING')
      throw new BadRequestException(
        `Cannot mark as picked — current status: ${line.partPickStatus}`,
      );
    return this.prisma.serviceOrderLine.update({
      where: { id: lineId },
      data: {
        partPickStatus: 'PICKED',
        partPickedAt: new Date(),
        partPickedById: userId,
      },
    });
  }

  async countPendingPicks(locationId?: string) {
    const pending = await this.prisma.serviceOrderLine.count({
      where: {
        type: 'PART',
        partPickStatus: 'PENDING',
        ...(locationId && {
          serviceOrder: { locationId },
        }),
      },
    });
    return { pending };
  }
}
