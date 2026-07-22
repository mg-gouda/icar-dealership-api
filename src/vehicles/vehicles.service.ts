import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { buildVehicleWhereClause, VehicleFilterParams } from '../common/helpers/vehicle-query.helper';

export interface VehicleFilters extends VehicleFilterParams {
  page?: number;
  limit?: number;
}

@Injectable()
export class VehiclesService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: VehicleFilters = {}) {
    // ponytail: clamp pagination to prevent negative skip / DoS via huge limit
    const page = Math.max(1, +(filters.page ?? 1) || 1);
    const limit = Math.min(100, Math.max(1, +(filters.limit ?? 20) || 20));
    const skip = (page - 1) * limit;

    const where = buildVehicleWhereClause(filters);

    const [data, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          images: { orderBy: { order: 'asc' }, take: 1 },
          location: { select: { id: true, name: true } },
          accreditedDealer: { select: { id: true, name: true } },
        },
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    return { items: data, total, page, limit };
  }

  async findById(id: string) {
    // ponytail: cost stripping moved to FieldPolicyInterceptor
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      include: {
        images: { orderBy: { order: 'asc' } },
        features: true,
        location: { select: { id: true, name: true, city: true } },
        accreditedDealer: { select: { id: true, name: true } },
      },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    return vehicle;
  }

  private prepareVehicleData(dto: any) {
    const { features, supplierId, licenseExpiryDate, ...rest } = dto;
    // Strip undefined so Prisma doesn't see explicit undefined for optional fields
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) data[k] = v;
    }
    return {
      data,
      features: (features as string[] | undefined) ?? [],
      supplierId: supplierId as string | undefined,
      licenseExpiryDate: licenseExpiryDate
        ? new Date(licenseExpiryDate)
        : undefined,
    };
  }

  async create(dto: any) {
    const { data, features, supplierId, licenseExpiryDate } =
      this.prepareVehicleData(dto);
    const createData: any = {
      ...data,
      ...(licenseExpiryDate ? { licenseExpiryDate } : {}),
      ...(features.length
        ? { features: { create: features.map((f: string) => ({ feature: f })) } }
        : {}),
    };
    const vehicle = await this.prisma.vehicle.create({
      data: createData,
      include: { images: true, features: true },
    });

    // ponytail: auto-create DRAFT vendor bill when cost + supplierId provided
    if (data.cost && Number(data.cost) > 0 && supplierId) {
      const location = await this.prisma.location.findUnique({
        where: { id: vehicle.locationId },
        include: {
          journals: { where: { code: { startsWith: 'PUR' } }, take: 1 },
        },
      });
      const purchJournal = location?.journals?.[0];
      const inventoryAccount = purchJournal
        ? await this.prisma.account.findFirst({
            where: { companyId: location.companyId, code: '1400' },
          })
        : null;
      if (purchJournal && inventoryAccount) {
        await this.prisma.invoice.create({
          data: {
            type: 'VENDOR_BILL',
            status: 'DRAFT',
            journalId: purchJournal.id,
            partnerId: supplierId,
            vendorBillSourceVehicleId: vehicle.id,
            date: new Date(),
            lines: {
              create: [
                {
                  accountId: inventoryAccount.id,
                  description: `Vehicle acquisition: ${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.vin ?? vehicle.id})`,
                  quantity: 1,
                  unitPrice: Number(data.cost),
                  subtotal: Number(data.cost),
                },
              ],
            },
          },
        });
      }
    }

    return vehicle;
  }

  async update(id: string, dto: any, changedByName?: string) {
    const existing = await this.findById(id);
    const { data, features, licenseExpiryDate } = this.prepareVehicleData(dto);

    const oldPrice = Number(existing.salePrice ?? existing.price);
    const rawNew = data.price !== undefined ? data.price : data.salePrice;
    const newPrice = rawNew !== undefined ? Number(rawNew) : null;
    const priceChanged = newPrice !== null && newPrice !== oldPrice;

    return this.prisma.vehicle.update({
      where: { id },
      data: {
        ...data,
        ...(licenseExpiryDate !== undefined ? { licenseExpiryDate } : {}),
        ...(dto.features !== undefined
          ? {
              features: {
                deleteMany: {},
                create: features.map((f: string) => ({ feature: f })),
              },
            }
          : {}),
        ...(priceChanged
          ? {
              priceLogs: {
                create: {
                  oldPrice,
                  newPrice: newPrice!,
                  note: dto.priceNote ?? null,
                  changedByName: changedByName ?? null,
                },
              },
            }
          : {}),
      },
      include: { images: true, features: true },
    });
  }

  async getPriceHistory(vehicleId: string) {
    await this.findById(vehicleId);
    return this.prisma.vehiclePriceLog.findMany({
      where: { vehicleId },
      orderBy: { changedAt: 'desc' },
    });
  }

  async addImage(vehicleId: string, data: { url: string; order?: number }) {
    return this.prisma.vehicleImage.create({
      data: { vehicleId, url: data.url, order: data.order ?? 0 },
    });
  }

  async updateImage(
    vehicleId: string,
    imageId: string,
    data: { order?: number },
  ) {
    return this.prisma.vehicleImage.update({
      where: { id: imageId, vehicleId },
      data,
    });
  }

  async deleteImage(vehicleId: string, imageId: string) {
    return this.prisma.vehicleImage.delete({
      where: { id: imageId, vehicleId },
    });
  }

  async deleteVehicle(id: string) {
    const vehicle = await this.findById(id);
    const dealsCount = await this.prisma.deal.count({ where: { vehicleId: id } });
    if (dealsCount > 0) {
      throw new Error(`Cannot delete vehicle with ${dealsCount} associated deal(s). Archive it instead.`);
    }
    await this.prisma.vehicleImage.deleteMany({ where: { vehicleId: id } });
    await this.prisma.vehicleFeature.deleteMany({ where: { vehicleId: id } });
    await this.prisma.vehiclePriceLog.deleteMany({ where: { vehicleId: id } });
    await this.prisma.vehicle.delete({ where: { id } });
    return { deleted: true, id: vehicle.id };
  }

  async bulkImport(
    csvText: string,
  ): Promise<{ created: number; errors: { row: number; error: string }[] }> {
    const lines = csvText
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .filter((l) => l.trim());
    if (lines.length < 2)
      return {
        created: 0,
        errors: [
          {
            row: 0,
            error: 'CSV must have a header row and at least one data row',
          },
        ],
      };

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const errors: { row: number; error: string }[] = [];
    let created = 0;

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i]
        .split(',')
        .map((v) => v.trim().replace(/^"|"$/g, ''));
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] ?? '';
      });

      try {
        const price = parseFloat(row['price'] ?? '0');
        const year = parseInt(row['year'] ?? '0', 10);
        const mileage = parseInt(row['mileage'] ?? '0', 10);

        if (!row['make']) throw new Error('make is required');
        if (!row['model']) throw new Error('model is required');
        if (!year) throw new Error('year is required');
        if (!row['locationid'] && !row['locationId'])
          throw new Error('locationId is required');
        if (!price) throw new Error('price is required');

        const vehicleData: any = {
          make: row['make'],
          model: row['model'],
          year,
          price,
          condition: row['condition']?.toUpperCase() || 'NEW',
          status: row['status']?.toUpperCase() || 'AVAILABLE',
          locationId: row['locationid'] || row['locationId'],
        };
        if (row['trim']) vehicleData.trim = row['trim'];
        if (row['vin']) vehicleData.vin = row['vin'];
        if (row['bodytype'] || row['bodyType'])
          vehicleData.bodyType = row['bodytype'] || row['bodyType'];
        if (row['color']) vehicleData.color = row['color'];
        if (row['fueltype'] || row['fuelType'])
          vehicleData.fuelType = row['fueltype'] || row['fuelType'];
        if (row['transmission'])
          vehicleData.transmission = row['transmission'].toUpperCase();
        if (mileage) vehicleData.mileage = mileage;
        if (row['description']) vehicleData.description = row['description'];

        await this.prisma.vehicle.create({ data: vehicleData });
        created++;
      } catch (e: unknown) {
        errors.push({
          row: i + 1,
          error: e instanceof Error ? e.message : 'Unknown error',
        });
      }
    }

    return { created, errors };
  }
}
