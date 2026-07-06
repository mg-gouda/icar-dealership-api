import { IsOptional, IsNumber, IsArray, IsString } from 'class-validator';

export class UpdateSecuritySettingsDto {
  @IsOptional()
  @IsNumber()
  sessionTimeoutMinutes?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  require2fa?: string[];

  @IsOptional()
  @IsNumber()
  maxLoginAttempts?: number;
}
