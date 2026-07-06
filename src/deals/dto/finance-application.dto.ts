import { IsString, IsOptional, IsNumber, IsObject, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ValidateNested, IsArray } from 'class-validator';
import { BankFinancingStatus, FinanceApplicationStatus } from '@prisma/client';

export class FinanceDocumentDto {
  @IsString()
  documentType: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateFinanceApplicationDto {
  @IsOptional()
  @IsObject()
  applicantInfo?: Record<string, any>;

  @IsOptional()
  @IsString()
  creditScoreRange?: string;

  @IsOptional()
  @IsString()
  lenderName?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  bankBranch?: string;

  @IsOptional()
  @IsNumber()
  termMonths?: number;

  @IsOptional()
  @IsNumber()
  apr?: number;

  @IsOptional()
  @IsNumber()
  monthlyPayment?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FinanceDocumentDto)
  documents?: FinanceDocumentDto[];
}

export class UpdateFinanceApplicationDto {
  @IsOptional()
  @IsEnum(FinanceApplicationStatus)
  status?: FinanceApplicationStatus;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  bankBranch?: string;

  @IsOptional()
  @IsEnum(BankFinancingStatus)
  bankFinancingStatus?: BankFinancingStatus;

  @IsOptional()
  @IsString()
  lenderName?: string;

  @IsOptional()
  @IsString()
  creditScoreRange?: string;

  @IsOptional()
  @IsNumber()
  termMonths?: number;

  @IsOptional()
  @IsNumber()
  apr?: number;

  @IsOptional()
  @IsNumber()
  monthlyPayment?: number;

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

export class RecordBankApprovalDto {
  @IsString()
  approvalReferenceNumber: string;

  @IsNumber()
  approvedAmount: number;

  @IsString()
  approvalDate: string;

  @IsOptional()
  @IsString()
  expiryDate?: string;

  @IsOptional()
  @IsString()
  approvalDocumentUrl?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class AddDocumentDto {
  @IsString()
  documentType: string;

  @IsOptional()
  @IsString()
  fileUrl?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  fileUrl?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class AddCommissionSplitDto {
  @IsString()
  userId: string;

  @IsString()
  roleInDeal: string;

  @IsOptional()
  @IsString()
  commissionPlanId?: string;

  @IsNumber()
  baseAmount: number;

  @IsNumber()
  splitPercentage: number;
}

export class BulkDealActionDto {
  @IsArray()
  @IsString({ each: true })
  ids: string[];

  @IsString()
  action: string;

  @IsOptional()
  @IsString()
  value?: string;
}
