import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

// ponytail: accepts totp-setup and totp-pending tokens — used only on 2FA enrollment endpoints
@Injectable()
export class JwtPreAuthStrategy extends PassportStrategy(Strategy, 'jwt-preauth') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: any) => req?.cookies?.['admin_token'] ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') ?? (() => { throw new Error('JWT_SECRET env var is required'); })(),
    });
  }

  validate(payload: any) {
    if (!payload.sub) throw new UnauthorizedException();
    // Allow totp-setup and totp-pending types; block full-access tokens on wrong endpoints
    return { id: payload.sub, type: payload.type };
  }
}
