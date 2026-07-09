import { IsString, IsOptional, IsArray, IsDateString } from 'class-validator';

export class ApPaymentRunDto {
  @IsArray()
  @IsString({ each: true })
  invoiceIds: string[];

  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @IsString({ message: 'journalId is required — provide the bank or cash journal to pay from' })
  journalId: string;
}
