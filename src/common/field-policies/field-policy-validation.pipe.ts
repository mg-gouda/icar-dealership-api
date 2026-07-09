import {
  Injectable,
  PipeTransform,
  ArgumentMetadata,
  ForbiddenException,
  Inject,
  Scope,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { FIELD_POLICIES, roleAtLeast, Role } from './field-policies';

/**
 * Pipe that rejects write payloads containing fields the caller's role
 * cannot edit (403, not silent drop — per spec).
 *
 * Usage: @UsePipes(new FieldPolicyWritePipe('Vehicle'))
 * Or inject via DI for request-scoped access.
 */
@Injectable({ scope: Scope.REQUEST })
export class FieldPolicyWritePipe implements PipeTransform {
  private entity: string;

  constructor(@Inject(REQUEST) private req: any) {
    // Entity set via factory — see createFieldPolicyWritePipe
    this.entity = '';
  }

  withEntity(entity: string): this {
    this.entity = entity;
    return this;
  }

  transform(value: any, _metadata: ArgumentMetadata) {
    if (!this.entity || !value || typeof value !== 'object') return value;

    const userRole: Role = this.req.user?.role ?? 'CUSTOMER';
    const policies = FIELD_POLICIES.filter((p) => p.entity === this.entity);

    for (const policy of policies) {
      const writeMin = policy.writeMinRole ?? policy.minRole;
      // ponytail: check value !== undefined — ValidationPipe with transform:true adds all DTO
      // properties as undefined keys, so `in` alone would block every non-ADMIN PATCH
      if (policy.field in value && value[policy.field] !== undefined && !roleAtLeast(userRole, writeMin)) {
        throw new ForbiddenException(
          `Insufficient permissions to set field "${policy.field}" on ${this.entity}`,
        );
      }
    }

    return value;
  }
}

// ponytail: simpler standalone fn for manual use in controllers/services
export function assertFieldWriteAccess(
  entity: string,
  body: Record<string, any>,
  userRole: Role,
): void {
  const policies = FIELD_POLICIES.filter((p) => p.entity === entity);
  for (const policy of policies) {
    const writeMin = policy.writeMinRole ?? policy.minRole;
    if (policy.field in body && body[policy.field] !== undefined && !roleAtLeast(userRole, writeMin)) {
      throw new ForbiddenException(
        `Insufficient permissions to set field "${policy.field}" on ${entity}`,
      );
    }
  }
}
