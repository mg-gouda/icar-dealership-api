import { IsString, IsEmail, MinLength, IsOptional } from 'class-validator';

export class CustomerRegisterDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
