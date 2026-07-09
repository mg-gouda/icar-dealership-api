import { Prisma } from '@prisma/client';

// ponytail: shared vehicle where-clause builder — used by VehiclesService, PublicService, ReportsService

export interface VehicleFilterParams {
  locationId?: string;
  status?: string;
  make?: string;
  bodyType?: string;
  condition?: string;
  fuelType?: string;
  accreditedDealerId?: string;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
}

export function buildVehicleWhereClause(
  params: VehicleFilterParams,
): Prisma.VehicleWhereInput {
  const where: Prisma.VehicleWhereInput = {};

  if (params.locationId) where.locationId = params.locationId;
  if (params.status) where.status = params.status as any;
  if (params.make) where.make = { contains: params.make, mode: 'insensitive' };
  if (params.bodyType) where.bodyType = params.bodyType;
  if (params.condition) where.condition = params.condition;
  if (params.fuelType) where.fuelType = params.fuelType as any;
  if (params.accreditedDealerId)
    where.accreditedDealerId = params.accreditedDealerId;

  if (params.search) {
    where.OR = [
      { make: { contains: params.search, mode: 'insensitive' } },
      { model: { contains: params.search, mode: 'insensitive' } },
    ];
  }

  if (params.minPrice || params.maxPrice) {
    where.price = {};
    if (params.minPrice)
      (where.price as any).gte = Number(params.minPrice);
    if (params.maxPrice)
      (where.price as any).lte = Number(params.maxPrice);
  }

  return where;
}
