import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  Res,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/password-reset.dto';
import { CustomerRegisterDto } from './dto/customer-register.dto';
import { FIELD_POLICIES, roleAtLeast } from '../common/field-policies';
import type { Role } from '../common/field-policies';

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
};

function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken?: string,
) {
  res.cookie('admin_token', accessToken, {
    ...COOKIE_OPTS,
    maxAge: 8 * 3600 * 1000,
    path: '/',
  });
  if (refreshToken) {
    res.cookie('admin_refresh', refreshToken, {
      ...COOKIE_OPTS,
      maxAge: 7 * 24 * 3600 * 1000,
      path: '/api/v1/auth/refresh',
    });
  }
}

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private authService: AuthService) {}

  // ponytail: brute-force guard — strict in prod, relaxed for dev/test
  @UseGuards(ThrottlerGuard, AuthGuard('local'))
  @Throttle({ default: { limit: process.env.NODE_ENV === 'production' ? 5 : 500, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login — returns tokens or 2FA challenge' })
  async login(@Request() req: any, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(req.user);
    const r = result as any;
    if (r.accessToken) setAuthCookies(res, r.accessToken, r.refreshToken);
    return result;
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: process.env.NODE_ENV === 'production' ? 10 : 500, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Request() req: any) {
    // B-5: Read refresh token from httpOnly cookie, not request body
    const refreshToken = req.cookies?.['admin_refresh'];
    if (!refreshToken)
      throw new BadRequestException('Missing refresh token cookie');
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
      canWrite: p.writeMinRole
        ? roleAtLeast(role, p.writeMinRole)
        : roleAtLeast(role, p.minRole),
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
  async confirm2fa(
    @Request() req: any,
    @Body('token') token: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.confirmTotp(req.user.id, token);
    if ((result as any).accessToken)
      setAuthCookies(
        res,
        (result as any).accessToken,
        (result as any).refreshToken,
      );
    return result;
  }

  // Called after login when requiresTotp: true
  @UseGuards(AuthGuard('jwt'))
  @Post('2fa/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify TOTP code during login flow' })
  async verify2fa(
    @Request() req: any,
    @Body('token') token: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = (await this.authService.verifyTotp(
      req.user.id,
      token,
    )) as any;
    if (result.accessToken)
      setAuthCookies(res, result.accessToken, result.refreshToken);
    return result;
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
  async logout(@Request() req: any, @Res({ passthrough: true }) res: Response) {
    await this.authService.auditLogout(req.user.id);
    res.clearCookie('admin_token', { path: '/' });
    res.clearCookie('admin_refresh', { path: '/api/v1/auth/refresh' });
    return { message: 'Logged out' };
  }

  // ── Password Reset ─────────────────────────────────────────────────────────

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset code (no auth required)' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
    // ponytail: constant response prevents user enumeration
    return { message: 'If that email exists, a reset code has been sent.' };
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
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
    @Body() body: CustomerRegisterDto,
  ) {
    return this.authService.customerRegister(
      body.name,
      body.email,
      body.password,
    );
  }
}
