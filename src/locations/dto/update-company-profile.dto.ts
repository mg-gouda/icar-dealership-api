import { IsString, IsOptional, IsNumber } from 'class-validator';

export class UpdateCompanyProfileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  taxId?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsNumber()
  fiscalYearStartMonth?: number;

  @IsOptional()
  @IsNumber()
  adminFeeBoundsPercent?: number;

  @IsOptional()
  @IsNumber()
  insuranceFeeBoundsPercent?: number;
}
