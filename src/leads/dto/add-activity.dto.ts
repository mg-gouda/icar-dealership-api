import { IsString, IsOptional } from 'class-validator';

export class AddLeadActivityDto {
  @IsString()
  type: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  outcome?: string;
}
