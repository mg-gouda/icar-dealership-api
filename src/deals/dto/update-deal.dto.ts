import { IsString, IsOptional, IsEnum, IsNumber } from 'class-validator';
import { PurchaseMethod } from '@prisma/client';

export class UpdateDealDto {
  @IsOptional()
  @IsNumber()
  salePrice?: number;

  @IsOptional()
  @IsNumber()
  adminFee?: number;

  @IsOptional()
  @IsNumber()
  insuranceFee?: number;

  @IsOptional()
  @IsString()
  salesRepId?: string;

  @IsOptional()
  @IsEnum(PurchaseMethod)
  purchaseMethod?: PurchaseMethod;

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
