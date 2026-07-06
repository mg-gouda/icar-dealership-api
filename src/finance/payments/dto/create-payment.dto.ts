import { IsString, IsOptional, IsEnum, IsNumber, IsDateString, IsArray } from 'class-validator';
import { PaymentType, PaymentMethod } from '@prisma/client';

export class CreatePaymentDto {
  @IsEnum(PaymentType)
  type: PaymentType;

  @IsString()
  partnerId: string;

  @IsString()
  journalId: string;

  @IsNumber()
  amount: number;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsOptional()
  @IsString()
  memo?: string;

  @IsOptional()
  @IsString()
  dealId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  invoiceIds?: string[];

  @IsOptional()
  @IsString()
  whtCategoryId?: string;
}

export class AllocatePaymentDto {
  @IsString()
  invoiceId: string;

  @IsNumber()
  amount: number;
}
