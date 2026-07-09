import {
  IsString,
  IsOptional,
  IsIn,
  IsNumber,
  Min,
} from 'class-validator';

// ponytail: string literals instead of Prisma enum import → compiles before prisma generate
const RETURN_REASONS = ['WARRANTY', 'DEFECTIVE', 'WRONG_PART', 'CHANGE_OF_MIND', 'DAMAGED_IN_TRANSIT', 'OTHER'] as const;
const REFUND_METHODS = ['CASH', 'REPLACEMENT', 'CC_REFUND', 'CREDIT_NOTE'] as const;

export class CreatePartReturnDto {
  @IsString()
  partId: string;

  @IsNumber()
  @Min(0.001)
  qty: number;

  @IsIn(RETURN_REASONS)
  reason: (typeof RETURN_REASONS)[number];

  @IsIn(REFUND_METHODS)
  refundMethod: (typeof REFUND_METHODS)[number];

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsOptional()
  @IsString()
  saleRef?: string;

  @IsNumber()
  @Min(0)
  originalAmount: number;

  @IsString()
  locationId: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class RejectPartReturnDto {
  @IsString()
  rejectionReason: string;
}

export class ListPartReturnsQuery {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  inventoryStatus?: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;
}
