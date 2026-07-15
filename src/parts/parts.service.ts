import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Decimal } from '@prisma/client/runtime/library';
import type { CreatePartReturnDto } from './dto/part-return.dto';
import type { CreateRMADto, ResolveRMADto } from './dto/rma.dto';
import type { ApplyCreditDto } from './dto/supplier-credit.dto';

@Injectable()
export class PartsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async findAll(query: {
    locationId?: string;
    category?: string;
    supplierId?: string;
    lowStock?: string;
    page?: number;
    limit?: number;
  }) {
    const { locationId, category, supplierId, lowStock, page = 1, limit = 20 } = query;
    const where: any = {
      isActive: true,
      ...(locationId && { locationId }),
      ...(category && { category }),
      ...(supplierId && { supplierId }),
    };

    if (lowStock === 'true') {
      // ponytail: field-to-field comparison not supported in Prisma where → fetch + filter
      const all = await this.prisma.part.findMany({
        where,
        include: { supplier: { select: { id: true, name: true } }, location: { select: { id: true, name: true } } },
        orderBy: { name: 'asc' },
      });
      const filtered = all.filter((p) => p.onHand.lte(p.reorderLevel));
      const start = (Number(page) - 1) * Number(limit);
      return {
        data: filtered.slice(start, start + Number(limit)),
        total: filtered.length,
        page: Number(page),
        limit: Number(limit),
      };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.part.findMany({
        where,
        include: { supplier: { select: { id: true, name: true } }, location: { select: { id: true, name: true } } },
        orderBy: { name: 'asc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      this.prisma.part.count({ where }),
    ]);
    return { data, total, page: Number(page), limit: Number(limit) };
  }

  async findById(id: string) {
    const part = await this.prisma.part.findUnique({
      where: { id },
      include: {
        supplier: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
      },
    });
    if (!part) throw new NotFoundException(`Part ${id} not found`);
    return part;
  }

  async create(
    data: {
      partNumber: string;
      oemNumber?: string;
      name: string;
      description?: string;
      category?: string;
      unitOfMeasure?: string;
      costPrice: number;
      salePrice: number;
      onHand?: number;
      reorderLevel?: number;
      locationId: string;
      supplierId?: string;
      companyId: string;
    },
    userId: string,
  ) {
    const part = await this.prisma.part.create({
      data: {
        partNumber: data.partNumber,
        oemNumber: data.oemNumber,
        name: data.name,
        description: data.description,
        category: data.category,
        unitOfMeasure: data.unitOfMeasure ?? 'PCS',
        costPrice: data.costPrice,
        salePrice: data.salePrice,
        onHand: data.onHand ?? 0,
        reorderLevel: data.reorderLevel ?? 0,
        locationId: data.locationId,
        supplierId: data.supplierId,
        companyId: data.companyId,
      },
    });
    await this.audit.log({
      entity: 'Part',
      entityId: part.id,
      action: 'CREATE',
      userId,
      newValue: part,
    });
    return part;
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      description: string;
      category: string;
      unitOfMeasure: string;
      costPrice: number;
      salePrice: number;
      reorderLevel: number;
      supplierId: string;
      oemNumber: string;
    }>,
    userId: string,
  ) {
    await this.prisma.part.findUniqueOrThrow({ where: { id } });
    const updated = await this.prisma.part.update({
      where: { id },
      data: data as any,
    });
    await this.audit.log({
      entity: 'Part',
      entityId: id,
      action: 'UPDATE',
      userId,
      newValue: data,
    });
    return updated;
  }

  async adjust(id: string, qty: number, reason: string, userId: string) {
    if (!reason) throw new BadRequestException('Reason required for stock adjustment');

    const part = await this.prisma.part.findUniqueOrThrow({ where: { id } });
    const newOnHand = new Decimal(part.onHand).add(new Decimal(qty));

    if (newOnHand.isNegative()) {
      throw new BadRequestException(
        `Adjustment would result in negative stock (current: ${part.onHand}, adjustment: ${qty})`,
      );
    }

    const updated = await this.prisma.part.update({
      where: { id },
      data: { onHand: newOnHand },
    });

    await this.audit.log({
      entity: 'Part',
      entityId: id,
      action: 'STOCK_ADJUSTMENT',
      userId,
      newValue: { qty, reason, newOnHand: updated.onHand },
    });
    return updated;
  }

  async findByBarcode(code: string) {
    // Search partNumber, barcodeValue, then oemNumber — first match wins
    const part = await this.prisma.part.findFirst({
      where: {
        isActive: true,
        OR: [
          { partNumber: code },
          { barcodeValue: code },
          { oemNumber: code },
        ],
      },
      include: {
        supplier: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
      },
    });
    return part ?? null;
  }

  async softDelete(id: string, userId: string) {
    await this.prisma.part.findUniqueOrThrow({ where: { id } });
    const updated = await this.prisma.part.update({
      where: { id },
      data: { isActive: false },
    });
    await this.audit.log({
      entity: 'Part',
      entityId: id,
      action: 'SOFT_DELETE',
      userId,
    });
    return updated;
  }

  // ---------------------------------------------------------------------------
  // Part Returns
  // ---------------------------------------------------------------------------

  private async generateSequence(prefix: string, model: 'partReturn' | 'manufacturerRMA' | 'supplierCreditNote'): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 86_400_000);

    // ponytail: count today's records for sequence
    let count: number;
    if (model === 'partReturn') {
      count = await this.prisma.partReturn.count({
        where: { createdAt: { gte: startOfDay, lt: endOfDay } },
      });
    } else if (model === 'manufacturerRMA') {
      count = await this.prisma.manufacturerRMA.count({
        where: { createdAt: { gte: startOfDay, lt: endOfDay } },
      });
    } else {
      count = await this.prisma.supplierCreditNote.count({
        where: { createdAt: { gte: startOfDay, lt: endOfDay } },
      });
    }
    return `${prefix}-${dateStr}-${String(count + 1).padStart(3, '0')}`;
  }

  async listReturns(companyId: string, query: {
    status?: string;
    inventoryStatus?: string;
    locationId?: string;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, inventoryStatus, locationId, q, page = 1, limit = 20 } = query;
    const where: any = {
      companyId,
      ...(status && { status }),
      ...(inventoryStatus && { inventoryStatus }),
      ...(locationId && { locationId }),
      ...(q && {
        OR: [
          { returnNumber: { contains: q, mode: 'insensitive' } },
          { customerName: { contains: q, mode: 'insensitive' } },
          { part: { name: { contains: q, mode: 'insensitive' } } },
          { part: { partNumber: { contains: q, mode: 'insensitive' } } },
        ],
      }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.partReturn.findMany({
        where,
        include: {
          part: { select: { id: true, name: true, partNumber: true } },
          approvedBy: { select: { id: true, name: true } },
          location: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      this.prisma.partReturn.count({ where }),
    ]);
    return { data, total, page: Number(page), limit: Number(limit) };
  }

  async createReturn(companyId: string, dto: CreatePartReturnDto, userId: string) {
    await this.prisma.part.findUniqueOrThrow({ where: { id: dto.partId } });
    const returnNumber = await this.generateSequence('RETN', 'partReturn');

    const ret = await this.prisma.partReturn.create({
      data: {
        returnNumber,
        partId: dto.partId,
        qty: dto.qty,
        reason: dto.reason,
        refundMethod: dto.refundMethod,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        saleRef: dto.saleRef,
        originalAmount: dto.originalAmount,
        notes: dto.notes,
        locationId: dto.locationId,
        companyId,
      },
    });
    await this.audit.log({ entity: 'PartReturn', entityId: ret.id, action: 'CREATE', userId, newValue: ret });
    return ret;
  }

  async getReturn(companyId: string, id: string) {
    const ret = await this.prisma.partReturn.findFirst({
      where: { id, companyId },
      include: {
        part: { select: { id: true, name: true, partNumber: true, costPrice: true, salePrice: true } },
        approvedBy: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
      },
    });
    if (!ret) throw new NotFoundException(`PartReturn ${id} not found`);
    return ret;
  }

  async approveReturn(companyId: string, id: string, approverId: string) {
    const ret = await this.prisma.partReturn.findFirst({
      where: { id, companyId, status: 'PENDING_APPROVAL' },
    });
    if (!ret) throw new NotFoundException(`Pending PartReturn ${id} not found`);

    const inventoryStatus = ret.reason === 'DEFECTIVE' ? 'QUARANTINE' : 'RETURNED_TO_STOCK';

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.partReturn.update({
        where: { id },
        data: {
          status: 'APPROVED',
          inventoryStatus: inventoryStatus as any,
          approvedById: approverId,
          approvedAt: new Date(),
        },
      });

      // Restock if returned to stock
      if (inventoryStatus === 'RETURNED_TO_STOCK') {
        await tx.part.update({
          where: { id: ret.partId },
          data: { onHand: { increment: ret.qty } },
        });
      }

      return updated;
    }).then(async (updated) => {
      await this.audit.log({ entity: 'PartReturn', entityId: id, action: 'APPROVE', userId: approverId, newValue: { status: 'APPROVED', inventoryStatus } });
      return updated;
    });
  }

  async rejectReturn(companyId: string, id: string, rejectionReason: string, userId: string) {
    const ret = await this.prisma.partReturn.findFirst({
      where: { id, companyId, status: 'PENDING_APPROVAL' },
    });
    if (!ret) throw new NotFoundException(`Pending PartReturn ${id} not found`);

    const updated = await this.prisma.partReturn.update({
      where: { id },
      data: { status: 'REJECTED', rejectionReason },
    });
    await this.audit.log({ entity: 'PartReturn', entityId: id, action: 'REJECT', userId, newValue: { rejectionReason } });
    return updated;
  }

  async completeReturn(companyId: string, id: string, userId: string) {
    const ret = await this.prisma.partReturn.findFirst({
      where: { id, companyId, status: 'APPROVED' },
    });
    if (!ret) throw new NotFoundException(`Approved PartReturn ${id} not found`);

    const updated = await this.prisma.partReturn.update({
      where: { id },
      data: { status: 'COMPLETED' },
    });
    await this.audit.log({ entity: 'PartReturn', entityId: id, action: 'COMPLETE', userId, newValue: { status: 'COMPLETED' } });
    return updated;
  }

  // ---------------------------------------------------------------------------
  // Manufacturer RMAs
  // ---------------------------------------------------------------------------

  async listRMAs(companyId: string, query: {
    status?: string;
    supplierId?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, supplierId, page = 1, limit = 20 } = query;
    const where: any = {
      companyId,
      ...(status && { status }),
      ...(supplierId && { supplierId }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.manufacturerRMA.findMany({
        where,
        include: {
          supplier: { select: { id: true, name: true } },
          _count: { select: { lines: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      this.prisma.manufacturerRMA.count({ where }),
    ]);
    return { data, total, page: Number(page), limit: Number(limit) };
  }

  async createRMA(companyId: string, dto: CreateRMADto, userId: string) {
    // Validate all partReturns are APPROVED + in QUARANTINE (not yet in an RMA)
    const returns = await this.prisma.partReturn.findMany({
      where: {
        id: { in: dto.partReturnIds },
        companyId,
        status: 'APPROVED',
        inventoryStatus: 'QUARANTINE',
        rmaLines: { none: {} },
      },
      include: { part: { select: { id: true, costPrice: true } } },
    });

    if (returns.length !== dto.partReturnIds.length) {
      throw new BadRequestException(
        'All part returns must be APPROVED with QUARANTINE inventory status and not already assigned to an RMA',
      );
    }

    const rmaNumber = await this.generateSequence('RMA', 'manufacturerRMA');

    const rma = await this.prisma.$transaction(async (tx) => {
      const created = await tx.manufacturerRMA.create({
        data: {
          rmaNumber,
          supplierId: dto.supplierId,
          locationId: dto.locationId,
          companyId,
          notes: dto.notes,
          lines: {
            create: returns.map((r) => ({
              partReturnId: r.id,
              partId: r.partId,
              qty: r.qty,
              unitCost: r.part.costPrice,
            })),
          },
        },
        include: { lines: true },
      });

      // Mark included part returns as IN_RMA so they're excluded from future batches
      await tx.partReturn.updateMany({
        where: { id: { in: dto.partReturnIds } },
        data: { inventoryStatus: 'IN_RMA' },
      });

      return created;
    });

    await this.audit.log({ entity: 'ManufacturerRMA', entityId: rma.id, action: 'CREATE', userId, newValue: { rmaNumber, lineCount: returns.length } });
    return rma;
  }

  async getRMA(companyId: string, id: string) {
    const rma = await this.prisma.manufacturerRMA.findFirst({
      where: { id, companyId },
      include: {
        supplier: { select: { id: true, name: true } },
        lines: {
          include: {
            part: { select: { id: true, name: true, partNumber: true } },
            partReturn: { select: { id: true, returnNumber: true, reason: true } },
          },
        },
      },
    });
    if (!rma) throw new NotFoundException(`RMA ${id} not found`);
    return rma;
  }

  async submitRMA(companyId: string, id: string, userId: string) {
    const rma = await this.prisma.manufacturerRMA.findFirst({
      where: { id, companyId, status: 'DRAFT' },
    });
    if (!rma) throw new NotFoundException(`Draft RMA ${id} not found`);

    const updated = await this.prisma.manufacturerRMA.update({
      where: { id },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    });
    await this.audit.log({ entity: 'ManufacturerRMA', entityId: id, action: 'SUBMIT', userId, newValue: { status: 'SUBMITTED' } });
    return updated;
  }

  async markRMASent(companyId: string, id: string, userId: string) {
    const rma = await this.prisma.manufacturerRMA.findFirst({
      where: { id, companyId, status: 'SUBMITTED' },
    });
    if (!rma) throw new NotFoundException(`Submitted RMA ${id} not found`);

    const updated = await this.prisma.manufacturerRMA.update({
      where: { id },
      data: { status: 'SENT_WITH_ORDER', sentAt: new Date() },
    });
    await this.audit.log({ entity: 'ManufacturerRMA', entityId: id, action: 'MARK_SENT', userId, newValue: { status: 'SENT_WITH_ORDER' } });
    return updated;
  }

  async resolveRMA(companyId: string, id: string, dto: ResolveRMADto, userId: string) {
    const rma = await this.prisma.manufacturerRMA.findFirst({
      where: { id, companyId, status: 'SENT_WITH_ORDER' },
    });
    if (!rma) throw new NotFoundException(`Sent RMA ${id} not found`);

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.manufacturerRMA.update({
        where: { id },
        data: {
          status: 'RESOLVED',
          resolvedAt: new Date(),
          resolutionType: dto.resolutionType,
          resolutionAmount: dto.resolutionAmount,
          creditNoteRef: dto.creditNoteRef,
          notes: dto.notes ?? rma.notes,
        },
      });

      if (dto.resolutionType === 'CREDIT_NOTE') {
        const scnNumber = await this.generateSequence('SCN', 'supplierCreditNote');
        await tx.supplierCreditNote.create({
          data: {
            creditNoteNumber: scnNumber,
            supplierId: rma.supplierId,
            rmaId: id,
            totalAmount: dto.resolutionAmount,
            expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
            locationId: rma.locationId,
            companyId,
          },
        });
      }

      return updated;
    });

    await this.audit.log({ entity: 'ManufacturerRMA', entityId: id, action: 'RESOLVE', userId, newValue: { resolutionType: dto.resolutionType, resolutionAmount: dto.resolutionAmount } });
    return result;
  }

  // ---------------------------------------------------------------------------
  // Supplier Credit Notes
  // ---------------------------------------------------------------------------

  async listSupplierCredits(companyId: string, query: {
    supplierId?: string;
    page?: number;
    limit?: number;
  }) {
    const { supplierId, page = 1, limit = 20 } = query;
    const where: any = {
      companyId,
      ...(supplierId && { supplierId }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.supplierCreditNote.findMany({
        where,
        include: {
          supplier: { select: { id: true, name: true } },
          rma: { select: { id: true, rmaNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      this.prisma.supplierCreditNote.count({ where }),
    ]);
    return { data, total, page: Number(page), limit: Number(limit) };
  }

  async getSupplierCredit(companyId: string, id: string) {
    const cn = await this.prisma.supplierCreditNote.findFirst({
      where: { id, companyId },
      include: {
        supplier: { select: { id: true, name: true } },
        rma: { select: { id: true, rmaNumber: true } },
        usages: { orderBy: { usedAt: 'desc' } },
      },
    });
    if (!cn) throw new NotFoundException(`SupplierCreditNote ${id} not found`);
    return cn;
  }

  async applyCredit(companyId: string, id: string, dto: ApplyCreditDto, userId: string) {
    const cn = await this.prisma.supplierCreditNote.findFirst({
      where: { id, companyId },
    });
    if (!cn) throw new NotFoundException(`SupplierCreditNote ${id} not found`);

    if (cn.expiryDate && cn.expiryDate < new Date()) {
      throw new BadRequestException('Credit note has expired and cannot be applied');
    }

    const remaining = new Decimal(cn.totalAmount).minus(new Decimal(cn.usedAmount));
    if (new Decimal(dto.amountUsed).greaterThan(remaining)) {
      throw new BadRequestException(
        `Amount ${dto.amountUsed} exceeds remaining balance ${remaining.toFixed(2)}`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.creditNoteUsage.create({
        data: {
          creditNoteId: id,
          amountUsed: dto.amountUsed,
          purchaseOrderRef: dto.purchaseOrderRef,
          notes: dto.notes,
        },
      });

      return tx.supplierCreditNote.update({
        where: { id },
        data: { usedAmount: { increment: dto.amountUsed } },
      });
    });

    await this.audit.log({ entity: 'SupplierCreditNote', entityId: id, action: 'APPLY_CREDIT', userId, newValue: { amountUsed: dto.amountUsed, purchaseOrderRef: dto.purchaseOrderRef } });
    return updated;
  }
}
