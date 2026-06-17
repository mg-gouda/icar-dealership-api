import { Controller, Post, Body, Get, Query, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../common/prisma/prisma.service';

@ApiTags('Public')
@Controller({ path: 'public', version: '1' })
export class PublicController {
  constructor(private prisma: PrismaService) {}

  @Get('vehicles')
  @ApiOperation({ summary: 'List available vehicles for B2C site' })
  async listVehicles(@Query() q: any) {
    const { make, bodyType, condition, search, minPrice, maxPrice, limit = 48, page = 1 } = q;
    const where: any = { status: 'AVAILABLE' };
    if (make) where.make = { contains: make, mode: 'insensitive' };
    if (bodyType) where.bodyType = bodyType;
    if (condition) where.condition = condition;
    if (search) where.OR = [
      { make: { contains: search, mode: 'insensitive' } },
      { model: { contains: search, mode: 'insensitive' } },
    ];
    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price.gte = Number(minPrice);
      if (maxPrice) where.price.lte = Number(maxPrice);
    }
    const [data, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        take: Number(limit),
        skip: (Number(page) - 1) * Number(limit),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, make: true, model: true, year: true, vin: true,
          price: true, bodyType: true, color: true,
          mileage: true, fuelType: true, transmission: true, status: true,
          images: { orderBy: { order: 'asc' }, take: 1, select: { url: true } },
          location: { select: { name: true, city: true } },
        },
      }),
      this.prisma.vehicle.count({ where }),
    ]);
    return { data, meta: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) } };
  }

  @Get('vehicles/:id')
  @ApiOperation({ summary: 'Get vehicle detail for B2C site' })
  async getVehicle(@Param('id') id: string) {
    return this.prisma.vehicle.findUniqueOrThrow({
      where: { id },
      select: {
        id: true, make: true, model: true, trim: true, year: true, vin: true,
        price: true, bodyType: true, color: true,
        mileage: true, fuelType: true, transmission: true, description: true, status: true,
        images: { orderBy: { order: 'asc' }, select: { url: true } },
        features: { select: { feature: true } },
        location: { select: { name: true, city: true, phone: true } },
      },
    });
  }

  @Post('leads')
  @ApiOperation({ summary: 'Submit a lead from the B2C website (no auth required)' })
  async createLead(@Body() body: {
    name: string;
    phone?: string;
    email?: string;
    source?: string;
    vehicleId?: string;
    notes?: string;
  }) {
    // resolve the default location (first active location of the company)
    const location = await this.prisma.location.findFirst({
      orderBy: { createdAt: 'asc' },
    });
    if (!location) throw new Error('No location configured');
    return this.prisma.lead.create({
      data: {
        name: body.name,
        phone: body.phone,
        email: body.email,
        source: (body.source as any) ?? 'WEBSITE',
        vehicleId: body.vehicleId || undefined,
        notes: body.notes,
        locationId: location.id,
      },
    });
  }
}
