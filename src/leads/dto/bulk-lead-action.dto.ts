import { IsString, IsOptional, IsArray } from 'class-validator';

export class BulkLeadActionDto {
  @IsArray()
  @IsString({ each: true })
  ids: string[];

  @IsString()
  action: string;

  @IsOptional()
  @IsString()
  value?: string;
}
