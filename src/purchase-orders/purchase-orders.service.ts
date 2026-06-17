import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class PurchaseOrdersService {
  constructor(private prisma: PrismaService) {}

  async list(filters: { locationId?: string; status?: string; page: number; limit: number }) {
    const where: any = {};
    if (filters.locationId) where.locationId = filters.locationId;
    if (filters.status) where.status = filters.status;
    const [items, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where, skip: (filters.page - 1) * filters.limit, take: filters.limit,
        orderBy: { orderDate: 'desc' },
        include: {
          partner: { select: { id: true, name: true } },
          location: { select: { id: true, name: true } },
          lines: true,
          _count: { select: { receipts: true } },
        },
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);
    return { items, total, page: filters.page, limit: filters.limit };
  }

  findOne(id: string) {
    return this.prisma.purchaseOrder.findUniqueOrThrow({
      where: { id },
      include: {
        partner: true,
        location: { select: { id: true, name: true } },
        lines: { include: { vehicle: { select: { id: true, make: true, model: true, year: true, vin: true } } } },
        receipts: { include: { lines: true } },
      },
    });
  }

  async create(data: { partnerId: string; locationId: string; expectedDate?: string; lines: { description: string; vehicleId?: string; quantity: number; unitCost: number }[] }) {
    const { lines, expectedDate, ...rest } = data;
    const total = lines.reduce((s, l) => s + l.quantity * l.unitCost, 0);
    return this.prisma.purchaseOrder.create({
      data: {
        ...rest,
        expectedDate: expectedDate ? new Date(expectedDate) : undefined,
        total,
        lines: { create: lines.map((l) => ({ ...l, quantity: l.quantity, unitCost: l.unitCost })) },
      },
      include: { lines: true, partner: { select: { name: true } } },
    });
  }

  async updateStatus(id: string, status: string) {
    const valid = ['SENT', 'CONFIRMED', 'CANCELLED'];
    if (!valid.includes(status)) throw new BadRequestException(`Invalid status transition to ${status}`);
    return this.prisma.purchaseOrder.update({ where: { id }, data: { status: status as any } });
  }

  async receive(poId: string, lines: { purchaseOrderLineId: string; quantityReceived: number }[]) {
    const po = await this.prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: poId },
      include: { lines: true },
    });
    if (po.status === 'CANCELLED') throw new BadRequestException('Cannot receive a cancelled PO');

    return this.prisma.$transaction(async (tx) => {
      const receipt = await tx.receipt.create({
        data: {
          purchaseOrderId: poId,
          locationId: po.locationId,
          lines: {
            create: lines.map((l) => ({
              purchaseOrderLineId: l.purchaseOrderLineId,
              quantityReceived: l.quantityReceived,
            })),
          },
        },
        include: { lines: true },
      });

      // Determine if fully received
      const allReceiptLines = await tx.receiptLine.findMany({
        where: { purchaseOrderLine: { purchaseOrderId: poId } },
        select: { purchaseOrderLineId: true, quantityReceived: true },
      });
      const received = allReceiptLines.reduce<Record<string, number>>((m, r) => {
        m[r.purchaseOrderLineId] = (m[r.purchaseOrderLineId] ?? 0) + Number(r.quantityReceived);
        return m;
      }, {});
      const fullyReceived = po.lines.every((l) => (received[l.id] ?? 0) >= Number(l.quantity));
      await tx.purchaseOrder.update({
        where: { id: poId },
        data: { status: fullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED' },
      });

      return receipt;
    });
  }
}
