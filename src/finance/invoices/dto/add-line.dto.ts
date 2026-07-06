import { IsString, IsOptional, IsNumber } from 'class-validator';

export class AddInvoiceLineDto {
  @IsString()
  accountId: string;

  @IsString()
  description: string;

  @IsNumber()
  quantity: number;

  @IsNumber()
  unitPrice: number;

  @IsOptional()
  @IsString()
  taxId?: string;
}
