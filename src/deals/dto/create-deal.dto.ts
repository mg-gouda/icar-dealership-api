import { IsString, IsOptional, IsEnum, IsNumber } from 'class-validator';
import { PurchaseMethod } from '@prisma/client';

export class CreateDealDto {
  @IsString()
  vehicleId: string;

  @IsString()
  customerId: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsString()
  salesRepId: string;

  @IsEnum(PurchaseMethod)
  purchaseMethod: PurchaseMethod;

  @IsNumber()
  salePrice: number;

  @IsOptional()
  @IsNumber()
  adminFee?: number;

  @IsOptional()
  @IsNumber()
  insuranceFee?: number;

  @IsOptional()
  @IsString()
  leadId?: string;

  @IsOptional()
  @IsString()
  tradeInMake?: string;

  @IsOptional()
  @IsString()
  tradeInModel?: string;

  @IsOptional()
  @IsNumber()
  tradeInYear?: number;

  @IsOptional()
  @IsNumber()
  tradeInValue?: number;
}
