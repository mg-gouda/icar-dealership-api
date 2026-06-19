import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

export interface VehicleFilters {
  locationId?: string;
  status?: string;
  make?: string;
  bodyType?: string;
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  limit?: number;
}

@Injectable()
export class VehiclesService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: VehicleFilters = {}) {
    const { page = 1, limit = 20, locationId, status, make, bodyType, minPrice, maxPrice } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (locationId) where.locationId = locationId;
    if (status) where.status = status;
    if (make) where.make = { contains: make, mode: 'insensitive' };
    if (bodyType) where.bodyType = bodyType;
    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price.gte = minPrice;
      if (maxPrice) where.price.lte = maxPrice;
    }

    const [data, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          images: { orderBy: { order: 'asc' }, take: 1 },
          location: { select: { id: true, name: true } },
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
      },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    return vehicle;
  }

  async create(dto: any) {
    const vehicle = await this.prisma.vehicle.create({ data: dto, include: { images: true } });

    // ponytail: auto-create DRAFT vendor bill when cost + supplierId provided
    if (dto.cost && Number(dto.cost) > 0 && dto.supplierId) {
      const location = await this.prisma.location.findUnique({
        where: { id: vehicle.locationId },
        include: { journals: { where: { code: { startsWith: 'PUR' } }, take: 1 } },
      });
      const purchJournal = location?.journals?.[0];
      const inventoryAccount = purchJournal ? await this.prisma.account.findFirst({
        where: { companyId: location!.companyId, code: '1400' },
      }) : null;
      if (purchJournal && inventoryAccount) {
        await this.prisma.invoice.create({
          data: {
            type: 'VENDOR_BILL',
            status: 'DRAFT',
            journalId: purchJournal.id,
            partnerId: dto.supplierId,
            vendorBillSourceVehicleId: vehicle.id,
            date: new Date(),
            lines: {
              create: [{
                accountId: inventoryAccount.id,
                description: `Vehicle acquisition: ${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.vin ?? vehicle.id})`,
                quantity: 1,
                unitPrice: Number(dto.cost),
                subtotal: Number(dto.cost),
              }],
            },
          },
        });
      }
    }

    return vehicle;
  }

  async update(id: string, dto: any) {
    await this.findById(id);
    return this.prisma.vehicle.update({
      where: { id },
      data: dto,
      include: { images: true },
    });
  }

  async addImage(vehicleId: string, data: { url: string; order?: number }) {
    return this.prisma.vehicleImage.create({
      data: { vehicleId, url: data.url, order: data.order ?? 0 },
    });
  }

  async updateImage(vehicleId: string, imageId: string, data: { order?: number }) {
    return this.prisma.vehicleImage.update({
      where: { id: imageId, vehicleId },
      data,
    });
  }

  async deleteImage(vehicleId: string, imageId: string) {
    return this.prisma.vehicleImage.delete({ where: { id: imageId, vehicleId } });
  }

  async bulkImport(csvText: string): Promise<{ created: number; errors: { row: number; error: string }[] }> {
    const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.trim());
    if (lines.length < 2) return { created: 0, errors: [{ row: 0, error: 'CSV must have a header row and at least one data row' }] };

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const errors: { row: number; error: string }[] = [];
    let created = 0;

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => { row[h] = values[idx] ?? ''; });

      try {
        const price = parseFloat(row['price'] ?? '0');
        const year = parseInt(row['year'] ?? '0', 10);
        const mileage = parseInt(row['mileage'] ?? '0', 10);

        if (!row['make']) throw new Error('make is required');
        if (!row['model']) throw new Error('model is required');
        if (!year) throw new Error('year is required');
        if (!row['locationid'] && !row['locationId']) throw new Error('locationId is required');
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
        if (row['bodytype'] || row['bodyType']) vehicleData.bodyType = row['bodytype'] || row['bodyType'];
        if (row['color']) vehicleData.color = row['color'];
        if (row['fueltype'] || row['fuelType']) vehicleData.fuelType = row['fueltype'] || row['fuelType'];
        if (row['transmission']) vehicleData.transmission = row['transmission'].toUpperCase();
        if (mileage) vehicleData.mileage = mileage;
        if (row['description']) vehicleData.description = row['description'];

        await this.prisma.vehicle.create({ data: vehicleData });
        created++;
      } catch (e: unknown) {
        errors.push({ row: i + 1, error: e instanceof Error ? e.message : 'Unknown error' });
      }
    }

    return { created, errors };
  }
}
