import { IsString, IsOptional, IsNumber, Min } from 'class-validator';

export class ApplyCreditDto {
  @IsNumber()
  @Min(0.01)
  amountUsed: number;

  @IsOptional()
  @IsString()
  purchaseOrderRef?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ListSupplierCreditsQuery {
  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;
}
