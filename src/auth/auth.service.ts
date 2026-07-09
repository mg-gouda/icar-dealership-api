import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../common/mail/mail.service';
import { generateSecret, verifyTotp, totpUri } from './totp';
import { encryptSecret, decryptSecret } from '../common/utils/crypto.util';

const TWO_FA_ROLES = ['FINANCE', 'ADMIN', 'SUPER_ADMIN'];
// ponytail: DB-backed lockout — survives restarts, works under PM2 cluster
const MAX_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 30 * 60 * 1000; // 30 min

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private audit: AuditService,
    private mail: MailService,
  ) {}

  async validateUser(email: string, password: string, ip?: string) {
    // -- DB-backed lockout check --
    const windowStart = new Date(Date.now() - LOCKOUT_WINDOW_MS);
    const recentAttempts = await this.prisma.loginAttempt.count({
      where: { identifier: email, attemptedAt: { gte: windowStart } },
    });
    if (recentAttempts >= MAX_ATTEMPTS) {
      throw new UnauthorizedException(
        'Too many failed login attempts. Try again in 30 minutes.',
      );
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      await this.recordFailedAttempt(email, ip);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      await this.recordFailedAttempt(email, ip);
      this.audit
        .log({
          entity: 'Auth',
          entityId: user.id,
          action: 'LOGIN_FAILED',
          userId: user.id,
        })
        .catch(() => {});
      throw new UnauthorizedException('Invalid credentials');
    }

    // Success -> clear attempts for this email
    await this.prisma.loginAttempt.deleteMany({
      where: { identifier: email },
    });
    return user;
  }

  private async recordFailedAttempt(email: string, ip?: string) {
    await this.prisma.loginAttempt.create({
      data: { identifier: email, ip: ip ?? 'unknown' },
    });
    // Check if this attempt triggers lockout -> audit
    const windowStart = new Date(Date.now() - LOCKOUT_WINDOW_MS);
    const count = await this.prisma.loginAttempt.count({
      where: { identifier: email, attemptedAt: { gte: windowStart } },
    });
    if (count === MAX_ATTEMPTS) {
      // ponytail: fire-and-forget lockout audit
      this.prisma.user
        .findUnique({ where: { email }, select: { id: true } })
        .then((u) => {
          if (u)
            this.audit.log({
              entity: 'Auth',
              entityId: u.id,
              action: 'ACCOUNT_LOCKED',
              userId: u.id,
            });
        })
        .catch(() => {});
    }
  }

  async login(user: {
    id: string;
    email: string;
    role: string;
    locationId: string | null;
    totpSecret: string | null;
    totpEnabled: boolean;
  }) {
    // Roles that REQUIRE 2FA: must have enrolled before getting a token
    if (TWO_FA_ROLES.includes(user.role) && !user.totpEnabled) {
      // Return a short-lived pre-auth token so the frontend can drive enrollment
      const preToken = this.jwt.sign(
        { sub: user.id, type: 'totp-setup' },
        { expiresIn: '10m' },
      );
      return { requiresTotpSetup: true, preAuthToken: preToken };
    }

    if (user.totpEnabled) {
      // Return pre-auth token — client must call /auth/2fa/verify next
      const preToken = this.jwt.sign(
        { sub: user.id, type: 'totp-pending' },
        { expiresIn: '5m' },
      );
      return { requiresTotp: true, preAuthToken: preToken };
    }

    const tokens = this.issueTokens(user);
    this.audit
      .log({
        entity: 'Auth',
        entityId: user.id,
        action: 'LOGIN',
        userId: user.id,
      })
      .catch(() => {});
    return tokens;
  }

  async setupTotp(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, totpEnabled: true },
    });
    if (user.totpEnabled) throw new BadRequestException('TOTP already enabled');
    const secret = generateSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: encryptSecret(secret) },
    });
    return { secret, uri: totpUri(secret, user.email) };
  }

  async confirmTotp(userId: string, token: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        totpSecret: true,
        totpEnabled: true,
        id: true,
        email: true,
        role: true,
        locationId: true,
        tokenVersion: true,
      },
    });
    if (!user.totpSecret)
      throw new BadRequestException('Run /auth/2fa/setup first');
    if (!verifyTotp(decryptSecret(user.totpSecret), token))
      throw new UnauthorizedException('Invalid TOTP code');
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: true },
    });
    this.audit
      .log({ entity: 'Auth', entityId: userId, action: '2FA_SETUP', userId })
      .catch(() => {});
    return this.issueTokens(user);
  }

  async verifyTotp(userId: string, token: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        totpSecret: true,
        totpEnabled: true,
        id: true,
        email: true,
        role: true,
        locationId: true,
        tokenVersion: true,
      },
    });
    if (!user.totpEnabled || !user.totpSecret)
      throw new ForbiddenException('2FA not configured');
    if (!verifyTotp(decryptSecret(user.totpSecret), token))
      throw new UnauthorizedException('Invalid TOTP code');
    const tokens = this.issueTokens(user);
    this.audit
      .log({ entity: 'Auth', entityId: userId, action: '2FA_VERIFY', userId })
      .catch(() => {});
    return tokens;
  }

  async disableTotp(userId: string, token: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { totpSecret: true, totpEnabled: true, role: true },
    });
    if (TWO_FA_ROLES.includes(user.role))
      throw new ForbiddenException('Cannot disable 2FA for privileged roles');
    if (!user.totpEnabled || !user.totpSecret)
      throw new BadRequestException('2FA not enabled');
    if (!verifyTotp(decryptSecret(user.totpSecret), token))
      throw new UnauthorizedException('Invalid TOTP code');
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: false, totpSecret: null },
    });
    return { ok: true };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { passwordHash: true },
    });
    const valid = await bcrypt.compare(currentPassword, user.passwordHash ?? '');
    if (!valid) throw new UnauthorizedException('Current password is incorrect');
    if (newPassword.length < 8) throw new BadRequestException('Password must be at least 8 characters');
    const hash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: hash } });
    return { ok: true };
  }

  private issueTokens(user: {
    id: string;
    email: string;
    role: string;
    locationId: string | null;
    tokenVersion?: number;
  }) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      locationId: user.locationId,
      companyId: 'company-001',
      tv: user.tokenVersion ?? 0,
    };
    const accessToken = this.jwt.sign(payload);
    const refreshToken = this.jwt.sign(payload, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d') as any,
    });
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        locationId: user.locationId,
      },
    };
  }

  async refreshToken(token: string) {
    try {
      const payload = this.jwt.verify(token, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: payload.sub },
        select: { id: true, email: true, role: true, locationId: true, tokenVersion: true },
      });
      // ponytail: tv mismatch means user logged out — token is stale
      if ((payload.tv ?? 0) !== user.tokenVersion) {
        throw new UnauthorizedException('Token has been invalidated');
      }
      return this.issueTokens(user);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async me(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        locationId: true,
        totpEnabled: true,
        createdAt: true,
      },
    });
  }

  // ── Logout ─────────────────────────────────────────────────────────────────

  async auditLogout(userId: string) {
    // Increment tokenVersion to invalidate all existing refresh tokens
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
    await this.audit.log({
      entity: 'Auth',
      entityId: userId,
      action: 'LOGOUT',
      userId,
    });
  }

  // ── Password Reset ─────────────────────────────────────────────────────────

  private hashResetCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return; // ponytail: no-op silently to prevent enumeration

    const code = randomBytes(3).toString('hex').toUpperCase(); // 6-char hex
    const hashed = this.hashResetCode(code);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: hashed,
        resetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000), // 1hr
      },
    });

    await this.audit.log({
      entity: 'Auth',
      entityId: user.id,
      action: 'PASSWORD_RESET_REQUESTED',
      userId: user.id,
    });

    // Send email (no-op if SMTP not configured)
    await this.mail.sendPasswordReset(user.email, code);
  }

  async resetPassword(email: string, code: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.resetToken || !user.resetTokenExpiry) {
      throw new BadRequestException('Invalid or expired reset code');
    }

    if (user.resetTokenExpiry < new Date()) {
      throw new BadRequestException('Invalid or expired reset code');
    }

    const hashed = this.hashResetCode(code);
    if (hashed !== user.resetToken) {
      throw new BadRequestException('Invalid or expired reset code');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, resetToken: null, resetTokenExpiry: null },
    });

    await this.audit.log({
      entity: 'Auth',
      entityId: user.id,
      action: 'PASSWORD_RESET_COMPLETED',
      userId: user.id,
    });
  }

  async customerRegister(name: string, email: string, password: string) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new BadRequestException('Email already registered');

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await this.prisma.user.create({
      data: { name, email, passwordHash, role: 'CUSTOMER' },
    });

    const payload = { sub: user.id, email: user.email, role: user.role };
    return {
      accessToken: this.jwt.sign(payload),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }
}
