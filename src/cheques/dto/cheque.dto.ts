import {
  IsString, IsEnum, IsNumber, IsOptional, IsDateString, IsArray, ValidateNested, Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum ChequeDirection { OUTGOING = 'OUTGOING', INCOMING = 'INCOMING' }
export enum ChequeStatus { ISSUED = 'ISSUED', CLEARED = 'CLEARED', BOUNCED = 'BOUNCED', CANCELLED = 'CANCELLED' }

export class ChequeAllocationDto {
  @IsNumber() @Min(0.01) amount: number;
  @IsOptional() @IsString() purchaseOrderId?: string;
  @IsOptional() @IsString() invoiceId?: string;
  @IsOptional() @IsString() memo?: string;
}

export class CreateChequeDto {
  @IsString() locationId: string;
  @IsString() chequeNumber: string;
  @IsEnum(ChequeDirection) direction: ChequeDirection;
  @IsNumber() @Min(0.01) amount: number;
  @IsOptional() @IsString() currency?: string;
  @IsString() bankAccountId: string;
  @IsOptional() @IsString() partnerId?: string;
  @IsString() payeePayor: string;
  @IsDateString() issueDate: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() memo?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ChequeAllocationDto)
  allocations?: ChequeAllocationDto[];
}

export class UpdateChequeStatusDto {
  @IsEnum(ChequeStatus) status: ChequeStatus;
  @IsOptional() @IsDateString() clearedDate?: string;
}

export class ListChequesQuery {
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsEnum(ChequeDirection) direction?: ChequeDirection;
  @IsOptional() @IsEnum(ChequeStatus) status?: ChequeStatus;
  @IsOptional() @IsString() partnerId?: string;
  @IsOptional() @IsString() q?: string;
  @IsOptional() page?: number;
  @IsOptional() limit?: number;
}
