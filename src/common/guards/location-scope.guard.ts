import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { LOCATION_SCOPE_KEY } from '../decorators/location-scope.decorator';

@Injectable()
export class LocationScopeGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requireScope = this.reflector.getAllAndOverride<boolean>(
      LOCATION_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requireScope) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // SUPER_ADMIN and ADMIN can access all locations
    if (['SUPER_ADMIN', 'ADMIN'].includes(user?.role)) return true;

    const requestedLocationId =
      request.params?.locationId ??
      request.query?.locationId ??
      request.body?.locationId;

    if (!requestedLocationId) {
      // Non-admin users without an explicit locationId: inject their own so services auto-filter
      if (user?.locationId && !['SUPER_ADMIN', 'ADMIN'].includes(user.role)) {
        // request.query is a read-only getter in Express — mutate the object it returns
        (request.query as Record<string, unknown>)['locationId'] = user.locationId;
      }
      return true;
    }

    if (user?.locationId && user.locationId !== requestedLocationId) {
      throw new ForbiddenException('Access to this location is not permitted.');
    }

    return true;
  }
}
