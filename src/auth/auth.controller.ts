import { Controller, Post, Get, Body, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/password-reset.dto';
import { FIELD_POLICIES, roleAtLeast } from '../common/field-policies';
import type { Role } from '../common/field-policies';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private authService: AuthService) {}

  // ponytail: 5 attempts per minute per IP — brute-force guard on auth endpoints
  @UseGuards(ThrottlerGuard, AuthGuard('local'))
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login — returns tokens or 2FA challenge' })
  async login(@Request() req: any) {
    return this.authService.login(req.user);
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body('refreshToken') refreshToken: string) {
    return this.authService.refreshToken(refreshToken);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  me(@Request() req: any) {
    return this.authService.me(req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me/field-permissions')
  @ApiOperation({ summary: 'Field-level permission map for current user' })
  getFieldPermissions(@Request() req: any) {
    const role: Role = req.user.role;
    return FIELD_POLICIES.map((p) => ({
      entity: p.entity,
      field: p.field,
      canRead: roleAtLeast(role, p.minRole),
      canWrite: p.writeMinRole ? roleAtLeast(role, p.writeMinRole) : roleAtLeast(role, p.minRole),
    }));
  }

  // ── 2FA setup (first-time enrollment) ──────────────────────────────────────

  // Call with preAuthToken in Authorization header to get secret + QR URI
  @UseGuards(AuthGuard('jwt'))
  @Post('2fa/setup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate TOTP secret for enrollment' })
  setup2fa(@Request() req: any) {
    return this.authService.setupTotp(req.user.id);
  }

  // Confirm enrollment by providing first valid code
  @UseGuards(AuthGuard('jwt'))
  @Post('2fa/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm TOTP enrollment with first valid code' })
  confirm2fa(@Request() req: any, @Body('token') token: string) {
    return this.authService.confirmTotp(req.user.id, token);
  }

  // Called after login when requiresTotp: true
  @UseGuards(AuthGuard('jwt'))
  @Post('2fa/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify TOTP code during login flow' })
  verify2fa(@Request() req: any, @Body('token') token: string) {
    return this.authService.verifyTotp(req.user.id, token);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Post('2fa/disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disable TOTP (non-privileged roles only)' })
  disable2fa(@Request() req: any, @Body('token') token: string) {
    return this.authService.disableTotp(req.user.id, token);
  }

  // ── Logout ─────────────────────────────────────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout — audit and invalidate session indicator' })
  async logout(@Request() req: any) {
    await this.authService.auditLogout(req.user.id);
    return { message: 'Logged out' };
  }

  // ── Password Reset ─────────────────────────────────────────────────────────

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset code (no auth required)' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
    // ponytail: constant response prevents user enumeration
    return { message: 'If that email exists, a reset code has been sent.' };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with code (no auth required)' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.email, dto.code, dto.newPassword);
    return { message: 'Password reset successful' };
  }

  // ── Customer (B2C) self-registration ──────────────────────────────────────
  @Post('customer/register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'B2C customer self-registration' })
  async customerRegister(
    @Body() body: { name: string; email: string; password: string },
  ) {
    return this.authService.customerRegister(body.name, body.email, body.password);
  }
}
