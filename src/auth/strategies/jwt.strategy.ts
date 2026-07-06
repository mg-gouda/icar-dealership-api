import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: any) => req?.cookies?.['admin_token'] ?? null,
      ]),
      passReqToCallback: false,
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') ?? (() => { throw new Error('JWT_SECRET env var is required'); })(),
    });
  }

  async validate(payload: any) {
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      locationId: payload.locationId,
      companyId: payload.companyId,
    };
  }
}
