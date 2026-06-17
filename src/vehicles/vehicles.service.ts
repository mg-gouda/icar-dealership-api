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

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findById(id: string, includePrivateFields = false) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      include: {
        images: { orderBy: { order: 'asc' } },
        features: true,
        location: { select: { id: true, name: true, city: true } },
      },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    // cost is field-level restricted — omit unless caller requests and is privileged
    if (!includePrivateFields) {
      const { cost: _cost, ...rest } = vehicle as any;
      return rest;
    }
    return vehicle;
  }

  async create(dto: any) {
    return this.prisma.vehicle.create({
      data: dto,
      include: { images: true },
    });
  }

  async update(id: string, dto: any) {
    await this.findById(id);
    return this.prisma.vehicle.update({
      where: { id },
      data: dto,
      include: { images: true },
    });
  }
}
