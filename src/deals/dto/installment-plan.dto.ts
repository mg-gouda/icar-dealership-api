import { IsString, IsOptional, IsEnum, IsNumber, IsDateString } from 'class-validator';
import { InstallmentCalculationMethod } from '@prisma/client';

export class CreateInstallmentPlanDto {
  @IsNumber()
  principalAmount: number;

  @IsNumber()
  downPayment: number;

  @IsNumber()
  interestRate: number;

  @IsNumber()
  durationMonths: number;

  @IsEnum(InstallmentCalculationMethod)
  calculationMethod: InstallmentCalculationMethod;

  @IsNumber()
  totalPayable: number;

  @IsOptional()
  @IsNumber()
  monthlyInstallment?: number;

  @IsDateString()
  startDate: string;
}
