import { IsString, IsOptional, IsEnum, IsBoolean, IsEmail } from 'class-validator';
import { PartnerType } from '@prisma/client';

export class CreatePartnerDto {
  @IsString()
  name: string;

  @IsEnum(PartnerType)
  type: PartnerType;

  @IsOptional()
  @IsString()
  taxId?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  currencyId?: string;

  @IsOptional()
  @IsString()
  vendorCategory?: string;

  @IsOptional()
  @IsBoolean()
  taxExempt?: boolean;

  @IsOptional()
  @IsString()
  taxExemptCertNumber?: string;

  @IsOptional()
  @IsString()
  taxExemptCertUrl?: string;
}
