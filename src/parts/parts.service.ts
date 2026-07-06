import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Decimal } from '@prisma/client/runtime/library';

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
}
