import { IsOptional, IsBoolean, IsString } from 'class-validator';

export class UpdateIntegrationDto {
  @IsOptional()
  @IsBoolean()
  connected?: boolean;

  @IsOptional()
  @IsString()
  apiKey?: string;
}
