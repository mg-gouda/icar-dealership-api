import {
  IsString,
  IsOptional,
  IsArray,
  IsIn,
  IsNumber,
  IsDateString,
  Min,
  ArrayMinSize,
} from 'class-validator';

// ponytail: string literals instead of Prisma enum import → compiles before prisma generate
const RMA_RESOLUTION_TYPES = ['CASH_REFUND', 'CREDIT_NOTE'] as const;

export class CreateRMADto {
  @IsString()
  supplierId: string;

  @IsString()
  locationId: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  partReturnIds: string[];

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ResolveRMADto {
  @IsIn(RMA_RESOLUTION_TYPES)
  resolutionType: (typeof RMA_RESOLUTION_TYPES)[number];

  @IsNumber()
  @Min(0)
  resolutionAmount: number;

  @IsOptional()
  @IsString()
  creditNoteRef?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;
}

export class ListRMAsQuery {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;
}
