import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { PERMISSION_KEY } from '../decorators/permission.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;

    // ponytail: base role check first — fast path
    if (requiredRoles.includes(user.role)) return true;

    // Fall back to UserPermission override
    const permissionKey =
      this.reflector.get<string>(PERMISSION_KEY, context.getHandler()) ??
      `${context.getClass().name}:${context.getHandler().name}`;

    const override = await this.prisma.userPermission.findUnique({
      where: {
        userId_permissionKey: {
          userId: user.id,
          permissionKey,
        },
      },
      select: { granted: true },
    });

    return !!override?.granted;
  }
}
