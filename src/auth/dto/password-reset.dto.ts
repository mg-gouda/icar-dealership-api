import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'A1B2C3', description: '6-char reset code' })
  @IsString()
  @MinLength(6)
  @MaxLength(6)
  code: string;

  @ApiProperty({ example: 'newSecurePass123' })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
