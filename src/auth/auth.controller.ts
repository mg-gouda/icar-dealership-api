import { Controller, Post, Get, Body, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private authService: AuthService) {}

  @UseGuards(AuthGuard('local'))
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login — returns tokens or 2FA challenge' })
  async login(@Request() req: any) {
    return this.authService.login(req.user);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body('refreshToken') refreshToken: string) {
    return this.authService.refreshToken(refreshToken);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  me(@Request() req: any) {
    return this.authService.me(req.user.sub);
  }

  // ── 2FA setup (first-time enrollment) ──────────────────────────────────────

  // Call with preAuthToken in Authorization header to get secret + QR URI
  @UseGuards(AuthGuard('jwt'))
  @Post('2fa/setup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate TOTP secret for enrollment' })
  setup2fa(@Request() req: any) {
    return this.authService.setupTotp(req.user.sub);
  }

  // Confirm enrollment by providing first valid code
  @UseGuards(AuthGuard('jwt'))
  @Post('2fa/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm TOTP enrollment with first valid code' })
  confirm2fa(@Request() req: any, @Body('token') token: string) {
    return this.authService.confirmTotp(req.user.sub, token);
  }

  // Called after login when requiresTotp: true
  @UseGuards(AuthGuard('jwt'))
  @Post('2fa/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify TOTP code during login flow' })
  verify2fa(@Request() req: any, @Body('token') token: string) {
    return this.authService.verifyTotp(req.user.sub, token);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Post('2fa/disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disable TOTP (non-privileged roles only)' })
  disable2fa(@Request() req: any, @Body('token') token: string) {
    return this.authService.disableTotp(req.user.sub, token);
  }
}
