import { IsString, IsOptional, IsEnum, IsNumber, IsArray } from 'class-validator';
import { VehicleStatus } from '@prisma/client';

export class CreateVehicleDto {
  @IsString()
  make: string;

  @IsString()
  model: string;

  @IsNumber()
  year: number;

  @IsString()
  vin: string;

  @IsString()
  locationId: string;

  @IsNumber()
  price: number;

  @IsOptional()
  @IsString()
  trim?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  bodyType?: string;

  @IsOptional()
  @IsString()
  fuelType?: string;

  @IsOptional()
  @IsString()
  transmission?: string;

  @IsOptional()
  @IsNumber()
  mileage?: number;

  @IsOptional()
  @IsNumber()
  cost?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(VehicleStatus)
  status?: VehicleStatus;

  @IsOptional()
  @IsString()
  condition?: string;

  @IsOptional()
  @IsNumber()
  adminFeeOverride?: number;

  @IsOptional()
  @IsNumber()
  insuranceFeeOverride?: number;

  @IsOptional()
  @IsString()
  supplierId?: string;
}
