import { IsString, IsOptional, IsEnum, IsNumber, IsArray, IsBoolean, IsDateString } from 'class-validator';
import { VehicleStatus } from '@prisma/client';

export class CreateVehicleDto {
  @IsString()
  make: string;

  @IsString()
  model: string;

  @IsNumber()
  year: number;

  @IsOptional()
  @IsString()
  vin?: string;

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

  // Specs & Drivetrain
  @IsOptional()
  @IsString()
  engineSize?: string;

  @IsOptional()
  @IsNumber()
  hp?: number;

  @IsOptional()
  @IsNumber()
  torque?: number;

  @IsOptional()
  @IsString()
  driveType?: string;

  @IsOptional()
  @IsString()
  gearType?: string;

  @IsOptional()
  @IsNumber()
  doors?: number;

  @IsOptional()
  @IsNumber()
  seats?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  // Used vehicle details
  @IsOptional()
  @IsString()
  regLicenseNumber?: string;

  @IsOptional()
  @IsDateString()
  licenseExpiryDate?: string;

  @IsOptional()
  @IsBoolean()
  engineChanged?: boolean;

  @IsOptional()
  @IsString()
  newEngineNumber?: string;

  @IsOptional()
  @IsBoolean()
  accidentHistory?: boolean;

  @IsOptional()
  @IsString()
  affectedParts?: string;

  @IsOptional()
  @IsNumber()
  engineConditionPct?: number;

  @IsOptional()
  @IsNumber()
  transmissionConditionPct?: number;

  // Used vehicle pricing
  @IsOptional()
  @IsNumber()
  customerAskingPrice?: number;

  @IsOptional()
  @IsNumber()
  minimumAskingPrice?: number;

  @IsOptional()
  @IsNumber()
  overprice?: number;

  @IsOptional()
  @IsNumber()
  acquisitionCost?: number;

  @IsOptional()
  @IsNumber()
  salePrice?: number;

  @IsOptional()
  @IsString()
  accreditedDealerId?: string;
}
