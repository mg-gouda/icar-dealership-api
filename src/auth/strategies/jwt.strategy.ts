import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  // ponytail: 60s in-memory cache avoids DB hit per request
  private readonly activeCache = new Map<string, { isActive: boolean; expiresAt: number }>();

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
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
    if (payload.type === 'totp-setup' || payload.type === 'totp-pending') {
      throw new UnauthorizedException('2FA verification required');
    }

    // Check user is still active (cached 60s)
    const cached = this.activeCache.get(payload.sub);
    if (!cached || cached.expiresAt < Date.now()) {
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { isActive: true },
      });
      if (!user) throw new UnauthorizedException();
      this.activeCache.set(payload.sub, {
        isActive: user.isActive,
        expiresAt: Date.now() + 60_000,
      });
      if (!user.isActive) throw new UnauthorizedException('Account is deactivated');
    } else if (!cached.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      locationId: payload.locationId,
      companyId: payload.companyId,
    };
  }
}
